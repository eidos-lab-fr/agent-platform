// The board, read from GitHub. Pure functions, tested in tests/github-board.test.ts.
//
// A project is a connected repo, a card is an issue:
//
//   Ideas        open issue with no other HQ label (label hq:idea when created from HQ)
//   Specified    label hq:specified: the spec is in the issue body
//   Planned      label hq:planned: the plan is in the issue body
//   Waiting      label hq:waiting: HQ adds ready-for-dev as soon as the planner says it can run
//   In progress  ready-for-dev, a running "Agent dev" workflow, or needs-human (a question)
//   To approve   an open pull request from the agent
//   Shipped      merged or closed in the last 14 days
//
// Zones are labels zone:front, zone:back, zone:data, zone:docs. The issue body keeps the need,
// the spec and the plan as French sections the dev agent reads, plus a hidden JSON line for HQ.

import { isActiveRun, issueNumberOfPull, questNumberOfRun, reviewsOf, verdictOf, WORKFLOW_DEV, type RawJob, type RawRepoData, type RawRun } from "../derive";
import type { ProviderId } from "../ai-names";
import { teamOf, type BoardState } from "./engine";
import { READY_TEAMS, ZONE_IDS, ZONES, type Card, type Column, type Message, type Plan, type Project, type Spec, type Team, type Worker, type ZoneId } from "./model";
import { agentFor, guessZones, verdictFor } from "./planner";

export const HQ_LABELS = { idea: "hq:idea", specified: "hq:specified", planned: "hq:planned", waiting: "hq:waiting" } as const;
export const STAGE_LABELS: string[] = Object.values(HQ_LABELS);
export const zoneLabel = (z: ZoneId) => `zone:${z}`;

export const PALETTE = ["#4f8cff", "#2fbf71", "#a06cf0", "#f2c94c", "#ff9f43", "#ff5c6c", "#3dd6d0"];
const DONE_DAYS = 14;

// ---------------------------------------------------------------- issue body

interface Meta {
  engine?: ProviderId;
  plan?: { zones: ZoneId[]; files: Record<string, string[]>; steps: { zone: ZoneId; text: string }[]; override: Plan["override"] };
}

export interface ParsedBody {
  need: string;
  spec: Omit<Spec, "engine"> | null;
  engine: ProviderId | null;
  plan: Meta["plan"] | null;
}

const META_RE = /<!--\s*hq:\s*(\{[\s\S]*?\})\s*-->/;
const FOOTER = "_Created from Agent HQ._";

function sections(body: string): { preamble: string; map: Map<string, string> } {
  const parts = body.split(/^###\s+(.+)$/m);
  const map = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i].trim().toLowerCase(), (parts[i + 1] ?? "").trim());
  return { preamble: parts[0].trim(), map };
}

const clean = (s: string) =>
  s
    .replace(META_RE, "")
    .replace(FOOTER, "")
    .replace(/^_No response_$/m, "")
    .replace(/^Rien de précisé\.$/m, "")
    .trim();

const listItems = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*(?:\[[ x]\]\s*)?/i, "").trim())
    .filter(Boolean);

/** Reads an issue written by HQ, or by the agent-platform issue form. */
export function parseBody(body: string | null): ParsedBody {
  const raw = body ?? "";
  let meta: Meta = {};
  try {
    const m = META_RE.exec(raw);
    if (m) meta = JSON.parse(m[1]) as Meta;
  } catch {
    meta = {};
  }
  const { preamble, map } = sections(raw);
  const get = (...names: string[]) => names.map((n) => map.get(n)).find((v) => v !== undefined);
  const need = clean(preamble) || clean(get("ce que ce ticket couvre", "spec", "résumé") ?? "");
  const criteria = listItems(clean(get("critères d'acceptation", "criteres d'acceptation", "acceptance criteria") ?? ""));
  const spec = criteria.length
    ? { summary: clean(get("spec", "résumé", "ce que ce ticket couvre") ?? need), criteria, outOfScope: clean(get("hors périmètre", "out of scope") ?? "") }
    : null;
  return { need, spec, engine: meta.engine ?? null, plan: meta.plan ?? null };
}

/** Writes the body back: sections in French for the dev agent, the HQ data in a hidden line. */
export function renderBody(need: string, spec: Spec | Omit<Spec, "engine"> | null, plan: Meta["plan"] | null, engine?: ProviderId | null): string {
  const out = [need.trim() || "_No description._"];
  if (spec) {
    out.push(`### Spec\n\n${spec.summary.trim() || need.trim()}`);
    out.push(`### Critères d'acceptation\n\n${spec.criteria.map((c) => `- ${c}`).join("\n")}`);
    out.push(`### Hors périmètre\n\n${spec.outOfScope.trim() || "Rien de précisé."}`);
  }
  if (plan) {
    const steps = plan.steps.map((s) => `- [${ZONES[s.zone].name}] ${s.text}`).join("\n");
    const files = plan.zones.flatMap((z) => (plan.files[z] ?? []).map((f) => `- \`${f}\``)).join("\n");
    out.push(`### Plan de développement (Agent HQ)\n\n${steps}\n\nFichiers probablement touchés :\n\n${files}`);
  }
  const meta: Meta = { ...(engine ? { engine } : {}), ...(plan ? { plan } : {}) };
  if (Object.keys(meta).length) out.push(`<!-- hq: ${JSON.stringify(meta)} -->`);
  out.push(FOOTER);
  return out.join("\n\n");
}

// ---------------------------------------------------------------- derive

export interface RawComment {
  id: number;
  body: string;
  created_at: string;
  user: { login: string; type?: string } | null;
}

export interface RepoBoardData extends RawRepoData {
  /** Comments of the cards in progress or to approve, keyed by issue number. */
  comments: Record<number, RawComment[]>;
}

export interface BoardPrefs {
  /** Your own teams (the ready-made ones are always there). */
  teams: Team[];
  /** Team of each project; Web app by default. */
  teamOf: Record<string, string>;
}

const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
const isBot = (login: string, type?: string) => type === "Bot" || /\[bot\]$/.test(login);

function devStatus(run: RawRun, jobs: RawJob[] | undefined): string {
  if (run.status !== "in_progress") return "Queued on GitHub";
  const step = jobs?.flatMap((j) => j.steps ?? []).find((s) => s.status === "in_progress");
  if (!step) return "Starting";
  if (/claude-code-action/i.test(step.name)) return "Coding";
  return step.name.replace(/^Run /, "");
}

function columnOf(i: { state: string; labels: string[] }, pr: { state: "open" | "merged" | "closed" } | null, devRunning: boolean): Column {
  if (i.state === "closed" || pr?.state === "merged") return "done";
  if (pr?.state === "open") return "review";
  if (i.labels.includes("needs-human") || devRunning || i.labels.includes("ready-for-dev")) return "in_progress";
  if (i.labels.includes(HQ_LABELS.waiting)) return "waiting";
  if (i.labels.includes(HQ_LABELS.planned)) return "planned";
  if (i.labels.includes(HQ_LABELS.specified)) return "specified";
  return "idea";
}

function messagesOf(comments: RawComment[], login: string, agentId: string | undefined, question: boolean): Message[] {
  const out: Message[] = comments.map((c) => {
    const who = c.user?.login ?? "";
    const agent = isBot(who, c.user?.type) || (who !== login && /^\s*(?:🤖|\*\*Agent)/.test(c.body));
    return { id: `gh${c.id}`, from: agent ? "agent" : "you", agentId: agent ? agentId : undefined, text: c.body.trim().slice(0, 2000), at: ts(c.created_at) };
  });
  if (question) {
    const last = [...out].reverse().find((m) => m.from === "agent");
    if (last) last.open = true;
  }
  return out;
}

/** Builds the board of every connected repo. `now` is used to keep only recent shipped cards. */
export function deriveBoard(data: RepoBoardData[], prefs: BoardPrefs, login: string, now = Date.now()): BoardState {
  const projects: Project[] = data.map((d, i) => ({ id: d.repo, name: d.repo.split("/")[1] ?? d.repo, color: PALETTE[i % PALETTE.length] }));
  const state: BoardState = {
    projects,
    cards: [],
    teams: [...READY_TEAMS, ...prefs.teams.filter((t) => !READY_TEAMS.some((r) => r.id === t.id))],
    teamOf: prefs.teamOf,
    nextNumber: {},
    seq: 0,
  };

  for (const d of data) {
    const team = teamOf(state, d.repo);
    const pullsByIssue = new Map<number, RawRepoData["pulls"][number]>();
    for (const p of d.pulls) {
      const n = issueNumberOfPull(p);
      if (n !== null && !pullsByIssue.has(n)) pullsByIssue.set(n, p);
    }
    const runsByIssue = new Map<number, RawRun>();
    for (const r of d.runs) {
      if (r.name !== WORKFLOW_DEV || r.conclusion === "skipped") continue;
      const n = questNumberOfRun(r, d.issues);
      if (n !== null && !runsByIssue.has(n)) runsByIssue.set(n, r); // newest first
    }

    for (const i of d.issues) {
      if (i.pull_request) continue;
      const labels = i.labels.map((l) => l.name);
      const pull = pullsByIssue.get(i.number);
      const prState = pull ? (pull.merged_at ? "merged" : pull.state) : null;
      const run = runsByIssue.get(i.number);
      const running = Boolean(run && isActiveRun(run));
      const column = columnOf({ state: i.state, labels }, prState ? { state: prState } : null, running);
      if (column === "done" && now - ts(pull?.merged_at ?? i.closed_at) > DONE_DAYS * 86_400_000) continue;
      if (i.state === "closed" && !pull?.merged_at && (i as { state_reason?: string }).state_reason === "not_planned") continue;

      const body = parseBody(i.body);
      const zoneLabels = ZONE_IDS.filter((z) => labels.includes(zoneLabel(z)));
      const zones = zoneLabels.length ? zoneLabels : body.plan?.zones.length ? body.plan.zones : guessZones(`${i.title} ${body.need}`);
      const question = labels.includes("needs-human") && i.state === "open";
      const failed = !running && !question && column === "in_progress" && run?.status === "completed" && ["failure", "timed_out", "cancelled"].includes(run.conclusion ?? "");

      let plan: Plan | null = null;
      if (body.plan) {
        const done = column === "review" || column === "done";
        plan = {
          zones: body.plan.zones,
          files: body.plan.files,
          steps: body.plan.steps.map((s, k) => ({
            id: `${d.repo}#${i.number}:${k}`,
            zone: s.zone,
            text: s.text,
            status: done ? "done" : column === "in_progress" && k === 0 ? "doing" : "todo",
          })),
          verdict: { parallel: true },
          override: body.plan.override ?? null,
        };
      }

      const card: Card = {
        id: `${d.repo}#${i.number}`,
        project: d.repo,
        number: i.number,
        title: i.title,
        need: body.need,
        column,
        zones,
        spec: body.spec ? { ...body.spec, engine: body.engine ?? "rules" } : null,
        plan,
        workers: [],
        messages: messagesOf(d.comments[i.number] ?? [], login, agentFor(team, zones[0])?.id, question),
        change: pull && pull.state === "open" ? { files: d.pullStats?.[pull.number]?.files ?? 0, additions: d.pullStats?.[pull.number]?.additions ?? 0, deletions: d.pullStats?.[pull.number]?.deletions ?? 0, url: pull.html_url } : null,
        createdAt: ts(i.created_at),
        updatedAt: ts(i.updated_at),
        url: i.html_url,
      };
      if (column === "in_progress") {
        card.live = question
          ? { text: "Waiting for your answer", url: i.html_url }
          : failed
            ? { text: "The agent stopped: see the run", url: run!.html_url, failed: true }
            : running
              ? { text: devStatus(run!, d.jobs[run!.id]), url: run!.html_url }
              : { text: "Queued on GitHub", url: null };
      }
      if (pull && column === "review") {
        card.pr = { number: pull.number, url: pull.html_url, verdict: verdictOf(pull.labels.map((l) => l.name)), reviews: reviewsOf(pull.head.ref, d) };
      }
      state.cards.push(card);
    }
  }

  assignWorkers(state);
  return withVerdicts(state);
}

/** Agents on the cards in progress: one per zone, numbered as clones per agent and project. */
function assignWorkers(state: BoardState) {
  const byProject = new Map<string, Card[]>();
  for (const c of state.cards) if (c.column === "in_progress") (byProject.get(c.project) ?? byProject.set(c.project, []).get(c.project)!).push(c);
  for (const [project, cards] of byProject) {
    const team = teamOf(state, project);
    const count: Record<string, number> = {};
    cards.sort((a, b) => a.updatedAt - b.updatedAt);
    for (const c of cards) {
      const workers: Worker[] = [];
      for (const zone of c.zones) {
        const agent = agentFor(team, zone) ?? team.agents.find((a) => a.kind === "builder");
        if (!agent || workers.some((w) => w.agentId === agent.id)) continue;
        count[agent.id] = (count[agent.id] ?? 0) + 1;
        workers.push({ id: `${c.id}:${zone}`, agentId: agent.id, zone, clone: count[agent.id], branch: `agent/${c.number}-…` });
      }
      c.workers = workers;
    }
  }
}

/** The planner's verdict on the planned and waiting cards. */
export function withVerdicts(state: BoardState): BoardState {
  return {
    ...state,
    cards: state.cards.map((c) =>
      (c.column === "planned" || c.column === "waiting") && c.plan ? { ...c, plan: { ...c.plan, verdict: verdictFor(c, state.cards, teamOf(state, c.project)) } } : c,
    ),
  };
}

/** Waiting cards that can start now, oldest first, each one counted before the next. */
export function cardsToLaunch(state: BoardState): Card[] {
  let s = state;
  const out: Card[] = [];
  const queue = s.cards.filter((c) => c.column === "waiting" && c.plan && c.plan.override !== "hold").sort((a, b) => a.updatedAt - b.updatedAt);
  for (const q of queue) {
    const team = teamOf(s, q.project);
    const v = verdictFor(q, s.cards, team, { ignoreFiles: q.plan!.override === "force" });
    if (!v.parallel) continue;
    out.push(q);
    const started: Card = { ...q, column: "in_progress", workers: q.zones.map((z) => ({ id: `${q.id}:${z}`, agentId: agentFor(team, z)?.id ?? "", zone: z, clone: 0, branch: "" })) };
    s = { ...s, cards: s.cards.map((c) => (c.id === q.id ? started : c)) };
  }
  return out;
}

/** The scope label for the dev agent: the first zone of the card that has its agent file in the repo. */
export function scopeFor(zones: ZoneId[], repoScopes: string[]): string | undefined {
  return zones.find((z) => repoScopes.includes(z));
}
