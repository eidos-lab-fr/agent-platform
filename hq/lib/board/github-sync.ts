// Reads the board from GitHub and runs your moves there, with your own token.
// The agents only start for the sender logins in AGENT_ALLOWED_USERS: that is why every
// action uses the token of the person at the keyboard, never a bot.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "../config";
import { fetchRepoData, gh, GitHubError, listConnectedRepos } from "../github";
import type { Session } from "../session";
import type { BoardAction, BoardState } from "./engine";
import {
  cardsToLaunch,
  deriveBoard,
  HQ_LABELS,
  parseBody,
  renderBody,
  scopeFor,
  STAGE_LABELS,
  zoneLabel,
  type BoardPrefs,
  type RawComment,
  type RepoBoardData,
} from "./github-board";
import { READY_TEAMS, ZONE_IDS, ZONES, type Card, type Team, type ZoneId } from "./model";
import { guessZones, planCard } from "./planner";

// ---------------------------------------------------------------- your preferences

const prefsFile = () => process.env.HQ_BOARD_FILE ?? join(process.cwd(), ".hq", "board.json");

export async function loadPrefs(): Promise<BoardPrefs> {
  try {
    const p = JSON.parse(await readFile(prefsFile(), "utf8")) as Partial<BoardPrefs>;
    return { teams: Array.isArray(p.teams) ? p.teams : [], teamOf: p.teamOf && typeof p.teamOf === "object" ? p.teamOf : {} };
  } catch {
    return { teams: [], teamOf: {} };
  }
}

async function savePrefs(p: BoardPrefs) {
  await mkdir(dirname(prefsFile()), { recursive: true });
  await writeFile(prefsFile(), JSON.stringify(p, null, 2) + "\n", { mode: 0o600 });
}

// ---------------------------------------------------------------- reading

async function fetchComments(token: string, repo: string, number: number): Promise<RawComment[]> {
  return gh<RawComment[]>(token, `/repos/${repo}/issues/${number}/comments?per_page=100`);
}

/** One repo: issues, PRs, runs, plus the comments of the cards with agents on them. */
async function fetchRepo(token: string, repo: string): Promise<RepoBoardData> {
  const raw = await fetchRepoData(token, repo);
  const busy = new Set<number>();
  for (const i of raw.issues) {
    if (i.pull_request || i.state !== "open") continue;
    if (i.labels.some((l) => l.name === "ready-for-dev" || l.name === "needs-human")) busy.add(i.number);
  }
  for (const p of raw.pulls) {
    const m = /^agent\/(\d+)/.exec(p.head.ref);
    if (m && p.state === "open") busy.add(Number(m[1]));
  }
  const comments: Record<number, RawComment[]> = {};
  await Promise.all([...busy].map(async (n) => (comments[n] = await fetchComments(token, repo, n))));
  return { ...raw, comments };
}

interface Loaded {
  state: BoardState;
  data: RepoBoardData[];
}

const cache = new Map<string, { at: number; value: Promise<Loaded> }>();
const TTL = 8_000;

async function load(session: Session): Promise<Loaded> {
  const repos = await listConnectedRepos(session.token);
  const [data, prefs] = await Promise.all([Promise.all(repos.map((r) => fetchRepo(session.token, r))), loadPrefs()]);
  return { state: deriveBoard(data, prefs, session.login), data };
}

function loadCached(session: Session, fresh = false): Promise<Loaded> {
  const hit = cache.get(session.login);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const value = load(session);
  cache.set(session.login, { at: Date.now(), value });
  value.catch(() => cache.delete(session.login));
  return value;
}

export function invalidateBoard(login: string) {
  cache.delete(login);
}

// Cards HQ just launched: never twice, even if two pages ask for the board at once.
const launching = new Map<string, number>();

/**
 * The board, after starting the waiting cards that can run. That is how a card on the same
 * files as another starts on its own: the next time HQ looks, the other one is done.
 */
export async function getBoard(session: Session): Promise<BoardState> {
  let { state, data } = await loadCached(session);
  const now = Date.now();
  for (const [id, at] of launching) if (now - at > 120_000) launching.delete(id);
  const toStart = cardsToLaunch(state).filter((c) => !launching.has(c.id));
  if (!toStart.length) return state;
  for (const c of toStart) launching.set(c.id, now);
  await Promise.all(toStart.map((c) => startCard(session.token, c, data.find((d) => d.repo === c.project)?.scopes ?? [])));
  invalidateBoard(session.login);
  ({ state, data } = await loadCached(session, true));
  return state;
}

// ---------------------------------------------------------------- writing

const enc = encodeURIComponent;

async function removeLabel(token: string, repo: string, n: number, name: string) {
  try {
    await gh(token, `/repos/${repo}/issues/${n}/labels/${enc(name)}`, { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e;
  }
}

async function addLabels(token: string, repo: string, n: number, labels: string[]) {
  if (labels.length) await gh(token, `/repos/${repo}/issues/${n}/labels`, { method: "POST", body: JSON.stringify({ labels }) });
}

/** Moves a card: removes the other HQ stage labels, adds the new one. */
async function setStage(token: string, repo: string, n: number, current: string[], next: string | null) {
  for (const l of STAGE_LABELS) if (l !== next && current.includes(l)) await removeLabel(token, repo, n, l);
  if (next && !current.includes(next)) await addLabels(token, repo, n, [next]);
}

// The zone labels get their color once per repo.
const labelled = new Set<string>();
async function ensureLabels(token: string, repo: string) {
  if (labelled.has(repo)) return;
  const wanted = [
    ...ZONE_IDS.map((z) => ({ name: zoneLabel(z), color: ZONES[z].color.slice(1), description: `Agent HQ: touches ${ZONES[z].name}` })),
    { name: HQ_LABELS.idea, color: "d0d0dc", description: "Agent HQ: idea" },
    { name: HQ_LABELS.specified, color: "c5b4f5", description: "Agent HQ: spec approved" },
    { name: HQ_LABELS.planned, color: "b4c8f5", description: "Agent HQ: planned" },
    { name: HQ_LABELS.waiting, color: "f5d9a8", description: "Agent HQ: launched, waits for its turn" },
  ];
  await Promise.all(
    wanted.map((l) =>
      gh(token, `/repos/${repo}/labels`, { method: "POST", body: JSON.stringify(l) }).catch((e) => {
        if (!(e instanceof GitHubError && e.status === 422)) throw e; // 422: already there
      }),
    ),
  );
  labelled.add(repo);
}

/** Wakes the dev agent: the scope of the card's main zone, then ready-for-dev (re-added so it fires). */
async function startCard(token: string, c: Card, repoScopes: string[]) {
  const scope = scopeFor(c.zones, repoScopes);
  await removeLabel(token, c.project, c.number, HQ_LABELS.waiting);
  if (scope) await addLabels(token, c.project, c.number, [`scope:${scope}`]);
  await removeLabel(token, c.project, c.number, "ready-for-dev");
  await addLabels(token, c.project, c.number, ["ready-for-dev"]);
}

async function issue(token: string, repo: string, n: number) {
  return gh<{ body: string | null; labels: { name: string }[]; title: string }>(token, `/repos/${repo}/issues/${n}`);
}

async function patchBody(token: string, repo: string, n: number, f: (b: ReturnType<typeof parseBody>, title: string) => { body: string; title?: string }) {
  const i = await issue(token, repo, n);
  const next = f(parseBody(i.body), i.title);
  await gh(token, `/repos/${repo}/issues/${n}`, { method: "PATCH", body: JSON.stringify({ body: next.body, ...(next.title ? { title: next.title } : {}) }) });
  return i;
}

export type GitHubAction = Exclude<BoardAction, { type: "tick" }>;

export interface ActionOutcome {
  ok: boolean;
  message: string;
  url?: string;
}

/** Runs one move of the board on GitHub. The card must belong to a connected repo. */
export async function runBoardAction(session: Session, a: GitHubAction): Promise<ActionOutcome> {
  const t = session.token;
  const repos = await listConnectedRepos(t);

  // Preferences: kept on this computer.
  if (a.type === "setTeam" || a.type === "saveTeam" || a.type === "deleteTeam") {
    const p = await loadPrefs();
    if (a.type === "setTeam") {
      if (![...READY_TEAMS, ...p.teams].some((x) => x.id === a.teamId)) return { ok: false, message: "Unknown team." };
      p.teamOf[a.project] = a.teamId;
    } else if (a.type === "saveTeam") {
      if (READY_TEAMS.some((x) => x.id === a.team.id)) return { ok: false, message: "Ready-made teams cannot be changed: copy it first." };
      p.teams = [...p.teams.filter((x) => x.id !== a.team.id), sanitizeTeam(a.team)];
    } else {
      p.teams = p.teams.filter((x) => x.id !== a.id);
      p.teamOf = Object.fromEntries(Object.entries(p.teamOf).filter(([, v]) => v !== a.id));
    }
    await savePrefs(p);
    invalidateBoard(session.login);
    return { ok: true, message: "Saved." };
  }

  if (a.type === "addProject") {
    const name = a.project.id.split("/")[1] ?? a.project.id;
    if (!/^[\w.-]+$/.test(name)) return { ok: false, message: "Invalid repo name." };
    await gh(t, `/repos/${config.org}/${config.platformRepo}/actions/workflows/onboard-repo.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { repo: name, agent: "true" } }),
    });
    return { ok: true, message: `Setting up ${name}: a setup PR is on its way. Merge it and the project shows up here.` };
  }

  if (a.type === "addIdea") {
    if (!repos.includes(a.project)) return { ok: false, message: "This repo is not connected." };
    if (!a.title.trim()) return { ok: false, message: "The idea needs a title." };
    await ensureLabels(t, a.project);
    const zones = guessZones(`${a.title} ${a.need}`);
    const created = await gh<{ number: number; html_url: string }>(t, `/repos/${a.project}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: a.title.trim().slice(0, 200), body: renderBody(a.need, null, null), labels: [HQ_LABELS.idea, ...zones.map(zoneLabel)] }),
    });
    invalidateBoard(session.login);
    return { ok: true, message: `Idea #${created.number} added.`, url: created.html_url };
  }

  // Every other move is on one card: owner/repo#number.
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(a.id);
  if (!m || !repos.includes(m[1])) return { ok: false, message: "Unknown card." };
  const repo = m[1];
  const n = Number(m[2]);
  const { state, data } = await loadCached(session, true);
  const card = state.cards.find((c) => c.id === a.id);
  if (!card) return { ok: false, message: "This card is no longer on the board." };
  const labels = (await issue(t, repo, n)).labels.map((l) => l.name);
  const done = (message: string): ActionOutcome => {
    invalidateBoard(session.login);
    return { ok: true, message };
  };

  switch (a.type) {
    case "setSpec": {
      if (card.column !== "idea") return { ok: false, message: "The spec can only change on an idea." };
      await patchBody(t, repo, n, (b) => ({ body: renderBody(b.need, a.spec, b.plan, a.spec.engine), title: a.title?.trim().slice(0, 200) }));
      return done("Spec saved on the issue.");
    }
    case "approveSpec":
      if (!card.spec) return { ok: false, message: "Write the spec first." };
      await setStage(t, repo, n, labels, HQ_LABELS.specified);
      return done("Spec approved.");
    case "setZones": {
      if (card.column !== "idea" && card.column !== "specified") return { ok: false, message: "Zones are set by the planner from here." };
      if (!a.zones.length) return { ok: false, message: "Keep at least one zone." };
      await ensureLabels(t, repo);
      for (const z of ZONE_IDS) if (!a.zones.includes(z) && labels.includes(zoneLabel(z))) await removeLabel(t, repo, n, zoneLabel(z));
      await addLabels(t, repo, n, a.zones.filter((z) => !labels.includes(zoneLabel(z))).map(zoneLabel));
      return done("Zones updated.");
    }
    case "plan": {
      if (card.column !== "specified") return { ok: false, message: "Approve the spec first." };
      const plan = planCard(card);
      await patchBody(t, repo, n, (b) => ({
        body: renderBody(b.need, b.spec, { zones: plan.zones, files: plan.files, steps: plan.steps.map((s) => ({ zone: s.zone, text: s.text })), override: null }, b.engine),
      }));
      await setStage(t, repo, n, labels, HQ_LABELS.planned);
      return done("Planned.");
    }
    case "launch":
      if (card.column !== "planned") return { ok: false, message: "Only a planned card can be launched." };
      await setStage(t, repo, n, labels, HQ_LABELS.waiting);
      invalidateBoard(session.login);
      await getBoard(session); // starts it now if it can run
      return { ok: true, message: card.plan?.verdict.parallel ? "Launched: an agent is on its way." : "Launched: it starts as soon as it is free." };
    case "override": {
      if (card.column !== "planned" && card.column !== "waiting") return { ok: false, message: "Too late to change it." };
      await patchBody(t, repo, n, (b) => ({ body: renderBody(b.need, b.spec, b.plan ? { ...b.plan, override: a.value } : null, b.engine) }));
      invalidateBoard(session.login);
      await getBoard(session);
      return { ok: true, message: a.value === "force" ? "It runs in parallel anyway." : a.value === "hold" ? "On hold." : "Back to the planner's verdict." };
    }
    case "answer": {
      // The dev agent reads the issue with `gh issue view --comments`: a comment is enough.
      await gh(t, `/repos/${repo}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: a.text.trim() }) });
      await removeLabel(t, repo, n, "needs-human");
      await startCard(t, card, data.find((d) => d.repo === repo)?.scopes ?? []);
      return done("Answer sent, the agent is back at work.");
    }
    case "ask":
      await gh(t, `/repos/${repo}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: a.text.trim() }) });
      return done("Sent on the issue. The agent reads the comments each time it starts.");
    case "requestChange": {
      if (!card.pr) return { ok: false, message: "No pull request on this card." };
      await gh(t, `/repos/${repo}/issues/${card.pr.number}/comments`, { method: "POST", body: JSON.stringify({ body: `@claude ${a.text.trim()}` }) });
      return done("Change requested: an agent picks it up on the pull request.");
    }
    case "ship": {
      if (!card.pr) return { ok: false, message: "No pull request on this card." };
      const pr = await gh<{ labels: { name: string }[]; head: { ref: string }; title: string }>(t, `/repos/${repo}/pulls/${card.pr.number}`);
      if (!pr.head.ref.startsWith("agent/")) return { ok: false, message: "HQ only merges agent pull requests." };
      if (!pr.labels.some((l) => l.name === "review:ok")) return { ok: false, message: "The reviewers have not approved it yet (review:ok)." };
      await gh(t, `/repos/${repo}/pulls/${card.pr.number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", commit_title: `${pr.title} (#${card.pr.number})` }) });
      return done(`Shipped: pull request #${card.pr.number} merged.`);
    }
    case "delete":
      if (card.column !== "idea" && card.column !== "specified") return { ok: false, message: "Only ideas and specs can be deleted." };
      await gh(t, `/repos/${repo}/issues/${n}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
      return done("Closed on GitHub (you can reopen it there).");
  }
}

function sanitizeTeam(t: Team): Team {
  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  return {
    id: str(t.id, 60),
    name: str(t.name, 60),
    builtIn: false,
    agents: (t.agents ?? []).slice(0, 12).map((a) => ({
      ...a,
      id: str(a.id, 40),
      name: str(a.name, 40),
      specialty: str(a.specialty, 200),
      zones: (a.zones ?? []).filter((z: ZoneId) => ZONE_IDS.includes(z)),
      skills: (a.skills ?? []).slice(0, 20).map((s) => str(s, 300)),
      rules: (a.rules ?? []).slice(0, 20).map((s) => str(s, 300)),
    })),
  };
}

/** Repos of the organization that are not connected yet: what "+ Add a project" offers. */
export async function addableRepos(session: Session): Promise<string[]> {
  const connected = await listConnectedRepos(session.token);
  const all = await gh<{ full_name: string; archived: boolean }[]>(session.token, `/orgs/${config.org}/repos?per_page=100&sort=pushed`);
  return all.filter((r) => !r.archived && !connected.includes(r.full_name) && !r.full_name.endsWith(`/${config.platformRepo}`)).map((r) => r.full_name);
}
