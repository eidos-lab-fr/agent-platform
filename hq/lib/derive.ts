// Derives quests, agents and activity from raw GitHub REST API data.
// Pure functions, tested in tests/derive.test.ts.

import type {
  ActivityEvent,
  PRStats,
  ReviewResult,
  Agent,
  AgentActivity,
  AgentRole,
  Quest,
  QuestPR,
  Stage,
  Verdict,
} from "./types";

export interface RawLabel {
  name: string;
}
export interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: "open" | "closed";
  labels: RawLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}
export interface RawPull {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: "open" | "closed";
  merged_at: string | null;
  created_at: string;
  updated_at?: string;
  head: { ref: string };
  labels: RawLabel[];
}
export interface RawRun {
  id: number;
  name: string | null;
  display_title: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  html_url: string;
  created_at: string;
  run_started_at?: string;
  updated_at: string;
}
export interface RawStep {
  name: string;
  status: string;
}
export interface RawJob {
  name: string;
  status: string;
  conclusion?: string | null;
  started_at: string | null;
  steps?: RawStep[];
}
export interface RawRepoData {
  repo: string;
  scopes: string[];
  issues: RawIssue[];
  pulls: RawPull[];
  runs: RawRun[];
  /** Jobs of active runs, keyed by run id. */
  jobs: Record<number, RawJob[]>;
  /** Last comment on blocked issues, keyed by issue number. */
  lastComments: Record<number, string>;
  /** Size of open PRs, keyed by PR number. */
  pullStats?: Record<number, PRStats>;
  /** Jobs of the latest finished review run, keyed by branch. */
  reviewJobs?: Record<string, RawJob[]>;
}

// Workflow names installed by agent-platform in each repo (templates/callers).
export const WORKFLOW_DEV = "Agent dev";
export const WORKFLOW_REVIEW = "Agents de review";
export const WORKFLOW_CLAUDE = "Claude (@claude)";
export const REVIEWERS: AgentRole[] = ["spec", "securite", "tests"];

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

export function isActiveRun(run: RawRun): boolean {
  return run.status !== null && ACTIVE.has(run.status);
}

export function scopeOf(labels: string[]): string | null {
  const l = labels.find((x) => x.startsWith("scope:"));
  return l ? l.slice("scope:".length) : null;
}

/** Issue linked to a PR: branch agent/<n>-slug, else "Closes #n" in the body. */
export function issueNumberOfPull(pull: Pick<RawPull, "head" | "body">): number | null {
  const m = /^agent\/(\d+)(?:-|$)/.exec(pull.head.ref);
  if (m) return Number(m[1]);
  const c = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(pull.body ?? "");
  return c ? Number(c[1]) : null;
}

export function verdictOf(labels: string[]): Verdict {
  if (labels.includes("review:changes")) return "changes";
  if (labels.includes("review:ok")) return "ok";
  return null;
}

/** Reviewer results of a branch: the running review run first, else the latest finished one. */
export function reviewsOf(branch: string, data: Pick<RawRepoData, "runs" | "jobs" | "reviewJobs">): ReviewResult[] {
  const active = data.runs.find((r) => r.name === WORKFLOW_REVIEW && r.head_branch === branch && isActiveRun(r));
  const jobs = (active ? data.jobs[active.id] : undefined) ?? data.reviewJobs?.[branch] ?? [];
  const out: ReviewResult[] = [];
  for (const role of ["spec", "securite", "tests"] as const) {
    const job = jobs.find((j) => new RegExp(`\\(${role}\\)`).test(j.name));
    if (!job) continue;
    const result =
      job.status === "completed" ? (job.conclusion === "success" || job.conclusion === "skipped" ? "passed" : "failed") : job.status === "in_progress" ? "running" : "queued";
    out.push({ role, result });
  }
  return out;
}

export function toQuestPR(pull: RawPull, data?: Pick<RawRepoData, "runs" | "jobs" | "reviewJobs" | "pullStats">): QuestPR {
  const labels = pull.labels.map((l) => l.name);
  return {
    number: pull.number,
    url: pull.html_url,
    title: pull.title,
    branch: pull.head.ref,
    state: pull.merged_at ? "merged" : pull.state,
    verdict: verdictOf(labels),
    mergedAt: pull.merged_at,
    createdAt: pull.created_at,
    stats: data?.pullStats?.[pull.number] ?? null,
    reviews: data ? reviewsOf(pull.head.ref, data) : [],
  };
}

/** Board column of a quest, from its labels, its PR and running workflows. */
export function stageOf(input: {
  state: "open" | "closed";
  labels: string[];
  pr: QuestPR | null;
  devRunning: boolean;
}): Stage {
  const { state, labels, pr, devRunning } = input;
  if (state === "closed" || pr?.state === "merged") return "done";
  if (labels.includes("needs-human")) return "bloque";
  if (pr && pr.state === "open") return pr.verdict === "ok" ? "revue_humaine" : "pr_ouverte";
  if (devRunning) return "en_developpement";
  if (labels.includes("ready-for-dev")) return "a_developper";
  if (labels.includes("spec:prete")) return "spec_prete";
  if (labels.includes("spec:en-cours")) return "spec_en_cours";
  return "backlog";
}

/** Finds the quest a run works on: branch agent/<n>, or issue title (display_title). */
export function questNumberOfRun(run: RawRun, issues: RawIssue[]): number | null {
  const m = /^agent\/(\d+)(?:-|$)/.exec(run.head_branch ?? "");
  if (m) return Number(m[1]);
  const hit = issues.find((i) => !i.pull_request && i.title === run.display_title);
  return hit ? hit.number : null;
}

export function deriveQuests(data: RawRepoData): Quest[] {
  const pullsByIssue = new Map<number, RawPull>();
  // PRs come newest first: keep the newest one.
  for (const p of data.pulls) {
    const n = issueNumberOfPull(p);
    if (n !== null && !pullsByIssue.has(n)) pullsByIssue.set(n, p);
  }
  const running = new Set<number>();
  for (const run of data.runs) {
    if (run.name === WORKFLOW_DEV && isActiveRun(run)) {
      const n = questNumberOfRun(run, data.issues);
      if (n !== null) running.add(n);
    }
  }
  return data.issues
    .filter((i) => !i.pull_request)
    .map((i) => {
      const labels = i.labels.map((l) => l.name);
      const pull = pullsByIssue.get(i.number);
      const pr = pull ? toQuestPR(pull, data) : null;
      const stage = stageOf({ state: i.state, labels, pr, devRunning: running.has(i.number) });
      return {
        id: `${data.repo}#${i.number}`,
        repo: data.repo,
        number: i.number,
        title: i.title,
        url: i.html_url,
        body: i.body ?? "",
        scope: scopeOf(labels),
        labels,
        stage,
        state: i.state,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        closedAt: i.closed_at,
        pr,
        question: stage === "bloque" ? (data.lastComments[i.number] ?? null) : null,
      } satisfies Quest;
    });
}

function devActivity(run: RawRun, jobs: RawJob[] | undefined): { activity: AgentActivity; step: string | null } {
  if (run.status !== "in_progress") return { activity: "queued", step: "Queued" };
  const step = jobs?.flatMap((j) => j.steps ?? []).find((s) => s.status === "in_progress");
  if (!step) return { activity: "preparing", step: "Starting" };
  if (/claude-code-action/i.test(step.name)) return { activity: "working", step: "Claude at work" };
  return { activity: "preparing", step: step.name.replace(/^Run /, "") };
}

export function deriveAgents(data: RawRepoData, quests: Quest[]): Agent[] {
  const byNumber = new Map(quests.map((q) => [q.number, q]));
  const agents: Agent[] = [];
  const scopes = data.scopes.length ? [...data.scopes] : [];
  if (!scopes.includes("general")) scopes.push("general");

  const base = (role: AgentRole, scope: string | null, suffix = ""): Agent => ({
    id: `${data.repo}:${role}${scope ? `:${scope}` : ""}${suffix}`,
    repo: data.repo,
    role,
    scope,
    activity: "idle",
    questId: null,
    questTitle: null,
    step: null,
    startedAt: null,
    runUrl: null,
  });

  const devs = new Map<string, Agent[]>();
  for (const s of scopes) devs.set(s, [base("dev", s)]);

  // Dev agents at work.
  for (const run of data.runs.filter((r) => r.name === WORKFLOW_DEV && isActiveRun(r))) {
    const n = questNumberOfRun(run, data.issues);
    const quest = n !== null ? byNumber.get(n) : undefined;
    let scope = quest?.scope ?? "general";
    if (!devs.has(scope)) scope = "general";
    const team = devs.get(scope)!;
    let agent = team.find((a) => a.activity === "idle");
    if (!agent) {
      agent = base("dev", scope, `:${team.length + 1}`);
      team.push(agent);
    }
    const { activity, step } = devActivity(run, data.jobs[run.id]);
    Object.assign(agent, {
      activity,
      step,
      questId: quest?.id ?? null,
      questTitle: quest?.title ?? run.display_title,
      startedAt: run.run_started_at ?? run.created_at,
      runUrl: run.html_url,
    });
  }

  // Blocked agents: the raised hand stays at the scope's desk.
  for (const q of quests.filter((x) => x.stage === "bloque")) {
    let scope = q.scope ?? "general";
    if (!devs.has(scope)) scope = "general";
    const team = devs.get(scope)!;
    let agent = team.find((a) => a.activity === "idle");
    if (!agent) {
      agent = base("dev", scope, `:${team.length + 1}`);
      team.push(agent);
    }
    Object.assign(agent, {
      activity: "blocked",
      step: "Waiting for your answer",
      questId: q.id,
      questTitle: q.title,
      startedAt: q.updatedAt,
    });
  }

  // Dev agent that failed in the last 2 hours and has not been restarted.
  const twoHours = 2 * 3600 * 1000;
  const latestDevRunByQuest = new Map<number, RawRun>();
  for (const run of data.runs.filter((r) => r.name === WORKFLOW_DEV && r.conclusion !== "skipped")) {
    const n = questNumberOfRun(run, data.issues);
    if (n !== null && !latestDevRunByQuest.has(n)) latestDevRunByQuest.set(n, run);
  }
  for (const [n, run] of latestDevRunByQuest) {
    const q = byNumber.get(n);
    if (!q || run.status !== "completed") continue;
    if (!["failure", "timed_out", "cancelled"].includes(run.conclusion ?? "")) continue;
    if (Date.now() - Date.parse(run.updated_at) > twoHours) continue;
    if (q.stage !== "a_developper" && q.stage !== "backlog") continue;
    const scope = devs.has(q.scope ?? "") ? q.scope! : "general";
    const agent = devs.get(scope)!.find((a) => a.activity === "idle");
    if (!agent) continue;
    Object.assign(agent, {
      activity: "failed",
      step: run.conclusion === "timed_out" ? "Timed out" : "Failed",
      questId: q.id,
      questTitle: q.title,
      startedAt: run.updated_at,
      runUrl: run.html_url,
    });
  }

  for (const team of devs.values()) agents.push(...team);

  // Reviewers.
  const reviewers = new Map(REVIEWERS.map((r) => [r, base(r, null)]));
  for (const run of data.runs.filter((r) => r.name === WORKFLOW_REVIEW && isActiveRun(r))) {
    const n = questNumberOfRun(run, data.issues);
    const quest = n !== null ? byNumber.get(n) : undefined;
    const jobs = data.jobs[run.id] ?? [];
    for (const role of REVIEWERS) {
      const agent = reviewers.get(role)!;
      if (agent.activity !== "idle") continue;
      const job = jobs.find((j) => new RegExp(`\\(${role}\\)`).test(j.name));
      let activity: AgentActivity = "queued";
      let step = "Waiting for the PR";
      if (job?.status === "in_progress") {
        activity = "reviewing";
        step = "Reviewing the PR";
      } else if (job?.status === "completed") {
        continue;
      }
      Object.assign(agent, {
        activity,
        step,
        questId: quest?.id ?? null,
        questTitle: quest?.title ?? run.display_title,
        startedAt: job?.started_at ?? run.created_at,
        runUrl: run.html_url,
      });
    }
  }
  agents.push(...reviewers.values());

  // @claude agent.
  const claude = base("claude", null);
  const claudeRun = data.runs.find((r) => r.name === WORKFLOW_CLAUDE && isActiveRun(r));
  if (claudeRun) {
    const n = questNumberOfRun(claudeRun, data.issues);
    const quest = n !== null ? byNumber.get(n) : undefined;
    Object.assign(claude, {
      activity: claudeRun.status === "in_progress" ? "working" : "queued",
      step: "Fixing on request",
      questId: quest?.id ?? null,
      questTitle: quest?.title ?? claudeRun.display_title,
      startedAt: claudeRun.run_started_at ?? claudeRun.created_at,
      runUrl: claudeRun.html_url,
    });
  }
  agents.push(claude);
  return agents;
}

export function deriveActivity(data: RawRepoData, quests: Quest[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  const name = data.repo.split("/")[1] ?? data.repo;
  for (const q of quests) {
    out.push({ id: `${q.id}:new`, at: q.createdAt, repo: data.repo, kind: "quest", text: `New quest on ${name}: ${q.title}`, url: q.url });
    if (q.pr) {
      out.push({ id: `${q.id}:pr`, at: q.pr.createdAt, repo: data.repo, kind: "pr", text: `PR #${q.pr.number} delivered for "${q.title}"`, url: q.pr.url });
      if (q.pr.mergedAt) {
        out.push({ id: `${q.id}:merged`, at: q.pr.mergedAt, repo: data.repo, kind: "merged", text: `Quest completed: ${q.title}`, url: q.pr.url });
      }
    }
    if (q.stage === "bloque") {
      out.push({ id: `${q.id}:blocked`, at: q.updatedAt, repo: data.repo, kind: "blocked", text: `An agent raised its hand on "${q.title}"`, url: q.url });
    }
  }
  for (const run of data.runs) {
    const at = run.run_started_at ?? run.created_at;
    if (run.name === WORKFLOW_DEV && run.conclusion !== "skipped") {
      out.push({ id: `run:${run.id}`, at, repo: data.repo, kind: "launch", text: `A dev agent set off on "${run.display_title}"`, url: run.html_url });
      if (run.status === "completed" && run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped") {
        out.push({ id: `run:${run.id}:ko`, at: run.updated_at, repo: data.repo, kind: "failed", text: `The dev agent failed on "${run.display_title}"`, url: run.html_url });
      }
    } else if (run.name === WORKFLOW_CLAUDE && run.conclusion !== "skipped") {
      out.push({ id: `run:${run.id}`, at, repo: data.repo, kind: "claude", text: `@claude called on "${run.display_title}"`, url: run.html_url });
    } else if (run.name === WORKFLOW_REVIEW && run.conclusion !== "skipped") {
      out.push({ id: `run:${run.id}`, at, repo: data.repo, kind: "review", text: `Reviewers are checking "${run.display_title}"`, url: run.html_url });
    }
  }
  return out;
}
