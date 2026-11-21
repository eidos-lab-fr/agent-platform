// Simulated world for demo mode (no GitHub access). It produces the same raw data as
// the GitHub API, which derive.ts then transforms: the demo runs the real state engine.

import type { RawIssue, RawJob, RawPull, RawRepoData, RawRun } from "./derive";
import { WORKFLOW_DEV, WORKFLOW_REVIEW } from "./derive";

const ORG = "eidos-lab-fr";

interface DemoRepo {
  name: string;
  scopes: string[];
  lanes: { offset: number; scope: string; blockFrom?: number; blockTo?: number }[];
  titles: string[];
  backlog: { title: string; scope: string }[];
}

const REPOS: DemoRepo[] = [
  {
    name: "notula",
    scopes: ["front", "api"],
    lanes: [
      { offset: 0, scope: "front" },
      { offset: 95, scope: "api", blockFrom: 70, blockTo: 115 },
    ],
    titles: [
      "Export a note as PDF",
      "Full-text search in notes",
      "Share a note by link",
      "Colored tags on notes",
      "Rate-limit calls to the AI API",
      "Version history for a note",
      "Offline mode",
      "Keyboard shortcuts",
    ],
    backlog: [
      { title: "Import notes from Markdown", scope: "api" },
      { title: "Automatic dark theme", scope: "front" },
    ],
  },
  {
    name: "eidoslab",
    scopes: ["site"],
    lanes: [{ offset: 160, scope: "site" }],
    titles: [
      "Project page for Agent HQ",
      "Contact form",
      "Improve the Lighthouse score",
      "Filterable project gallery",
    ],
    backlog: [{ title: "English version of the site", scope: "site" }],
  },
  {
    name: "prompt-compare",
    scopes: [],
    lanes: [{ offset: 60, scope: "general" }],
    titles: ["Compare three prompts side by side", "Export results as CSV", "Similarity score"],
    backlog: [],
  },
];

/** Length of a full simulated quest cycle, in seconds. */
export const CYCLE = 260;

interface Built {
  issue: RawIssue;
  pull: RawPull | null;
  runs: RawRun[];
  jobs: Record<number, RawJob[]>;
  comment: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const label = (name: string) => ({ name });

/** Builds a quest's raw data `phase` seconds after it started. */
export function buildQuest(opts: {
  repo: string;
  number: number;
  title: string;
  scope: string;
  start: number;
  phase: number;
  blockFrom?: number;
  blockTo?: number;
  autoMerge?: boolean;
}): Built {
  const { repo, number, title, scope, start, phase } = opts;
  const at = (s: number) => iso(start + s * 1000);
  const slug = title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const labels = scope === "general" ? [] : [label(`scope:${scope}`)];
  const runs: RawRun[] = [];
  const jobs: Record<number, RawJob[]> = {};
  let pull: RawPull | null = null;
  let comment: string | null = null;
  let state: "open" | "closed" = "open";
  let closedAt: string | null = null;

  const blocked = opts.blockFrom !== undefined && phase >= opts.blockFrom && phase < (opts.blockTo ?? 0);
  // A blocked quest falls behind: the rest of its journey is shifted.
  const delay = opts.blockFrom !== undefined && phase >= (opts.blockTo ?? 0) ? (opts.blockTo ?? 0) - opts.blockFrom : 0;
  const p = blocked ? (opts.blockFrom ?? 0) : phase - delay;

  if (p >= 15) labels.push(label("ready-for-dev"));
  const runId = number * 10;
  if (blocked) {
    labels.push(label("needs-human"));
    comment =
      "The spec does not say whether the limit applies per user or per organization. Which one should I use? I am stopping until you answer.";
    runs.push(devRun(runId, title, "completed", "success", at(25), at(opts.blockFrom ?? 0)));
  } else if (p >= 20 && p < 110) {
    const status = p < 28 ? "queued" : "in_progress";
    runs.push(devRun(runId, title, status, null, at(20), at(p)));
    jobs[runId] = [
      {
        name: "dev / dev",
        status: status === "queued" ? "queued" : "in_progress",
        started_at: at(28),
        steps: [
          { name: "Run actions/checkout@v4", status: p < 34 ? "in_progress" : "completed" },
          { name: "Déterminer le scope", status: p < 34 ? "pending" : p < 40 ? "in_progress" : "completed" },
          { name: "Run anthropics/claude-code-action@v1", status: p < 40 ? "pending" : "in_progress" },
        ],
      },
    ];
  } else if (p >= 110) {
    runs.push(devRun(runId, title, "completed", "success", at(20), at(110)));
  }

  if (p >= 110) {
    const reviewDone = p >= 175;
    const prLabels = reviewDone ? [label("review:ok")] : [];
    const merged = opts.autoMerge !== false && p >= 245;
    pull = {
      number: number + 1,
      title,
      html_url: `https://github.com/${repo}/pull/${number + 1}`,
      body: `Closes #${number}`,
      state: merged ? "closed" : "open",
      merged_at: merged ? at(245) : null,
      created_at: at(110),
      head: { ref: `agent/${number}-${slug}` },
      labels: prLabels,
    };
    if (merged) {
      state = "closed";
      closedAt = at(245);
    }
    const rid = runId + 1;
    const reviewActive = !reviewDone;
    runs.unshift({
      id: rid,
      name: WORKFLOW_REVIEW,
      display_title: title,
      event: "pull_request",
      status: reviewActive ? (p < 118 ? "queued" : "in_progress") : "completed",
      conclusion: reviewActive ? null : "success",
      head_branch: `agent/${number}-${slug}`,
      html_url: `https://github.com/${repo}/actions/runs/${rid}`,
      created_at: at(112),
      run_started_at: at(118),
      updated_at: at(Math.min(p, 175)),
    });
    if (reviewActive) {
      const job = (role: string, end: number) => ({
        name: `review / review (${role})`,
        status: p < 125 ? "queued" : p < end ? "in_progress" : "completed",
        started_at: at(125),
      });
      jobs[rid] = [job("spec", 150), job("securite", 165), job("tests", 172)];
    }
  }

  const issue: RawIssue = {
    number,
    title,
    html_url: `https://github.com/${repo}/issues/${number}`,
    body: demoBody(title),
    state,
    labels,
    created_at: at(0),
    updated_at: at(blocked ? (opts.blockFrom ?? 0) : Math.max(0, phase)),
    closed_at: closedAt,
  };
  return { issue, pull, runs, jobs, comment };

  function devRun(id: number, t: string, status: string, conclusion: string | null, created: string, updated: string): RawRun {
    return {
      id,
      name: WORKFLOW_DEV,
      display_title: t,
      event: "issues",
      status,
      conclusion,
      head_branch: "main",
      html_url: `https://github.com/${repo}/actions/runs/${id}`,
      created_at: created,
      run_started_at: created,
      updated_at: updated,
    };
  }
}

function demoBody(title: string): string {
  return [
    "### Chemin de la spec",
    `specs/${title.length}-demo/spec.md`,
    "",
    "### Critères d'acceptation",
    "- The described behavior is covered by a test",
    "- No regression in existing tests",
  ].join("\n");
}

// Quests created and launched during the demo (server memory, lost on restart).
interface DemoQuest {
  repo: string;
  number: number;
  title: string;
  scope: string;
  created: number;
  launched: number | null;
  merged: number | null;
}
const created: DemoQuest[] = [];

export function demoCreateQuest(repo: string, title: string, scope: string): number {
  const number = 900 + created.length;
  created.push({ repo, number, title, scope, created: Date.now(), launched: null, merged: null });
  return number;
}
export function demoLaunch(repo: string, number: number): boolean {
  const q = created.find((x) => x.repo === repo && x.number === number);
  if (!q) return false;
  q.launched ??= Date.now() - 15_000;
  return true;
}
export function demoMerge(repo: string, number: number): boolean {
  const q = created.find((x) => x.repo === repo && x.number === number + 1) ?? created.find((x) => x.repo === repo && x.number === number);
  if (!q) return false;
  q.merged ??= Date.now();
  return true;
}

export function demoRepos() {
  return REPOS.map((r) => ({ fullName: `${ORG}/${r.name}`, scopes: r.scopes }));
}

export function demoRawData(now: number = Date.now()): RawRepoData[] {
  const t = Math.floor(now / 1000);
  return REPOS.map((r, ri) => {
    const repo = `${ORG}/${r.name}`;
    const data: RawRepoData = { repo, scopes: r.scopes, issues: [], pulls: [], runs: [], jobs: {}, lastComments: {} };
    const add = (b: Built) => {
      data.issues.push(b.issue);
      if (b.pull) data.pulls.push(b.pull);
      data.runs.push(...b.runs);
      Object.assign(data.jobs, b.jobs);
      if (b.comment) data.lastComments[b.issue.number] = b.comment;
    };

    // Lanes loop forever: each cycle is a new quest.
    r.lanes.forEach((lane, li) => {
      const since = t - lane.offset;
      const k = Math.floor(since / CYCLE);
      for (let back = 0; back < 2; back++) {
        const cycle = k - back;
        const number = 40 + ri * 7 + (cycle % 500) * 4 * 2 + li * 2;
        const title = r.titles[(((cycle * r.lanes.length + li) % r.titles.length) + r.titles.length) % r.titles.length];
        const start = (lane.offset + cycle * CYCLE) * 1000;
        add(
          buildQuest({
            repo,
            number,
            title,
            scope: lane.scope,
            start,
            phase: Math.min((now - start) / 1000, 400),
            blockFrom: lane.blockFrom,
            blockTo: lane.blockTo,
          }),
        );
      }
    });

    // History: quests completed over the last 12 days, for XP and the streak.
    const day = 86_400_000;
    for (let i = 0; i < 3 + ri; i++) {
      const start = now - (1 + i * 1.7) * day - ri * 3_600_000;
      const b = buildQuest({
        repo,
        number: 10 + i * 2,
        title: `${r.titles[i % r.titles.length]} (v${i + 1})`,
        scope: r.scopes[i % Math.max(1, r.scopes.length)] ?? "general",
        start,
        phase: 400,
      });
      if (i % 3 === 1 && b.pull) b.pull.labels = [];
      add(b);
    }

    r.backlog.forEach((q, i) => {
      add(buildQuest({ repo, number: 30 + i * 2 + 1, title: q.title, scope: q.scope, start: now - (i + 2) * 3_600_000, phase: 0 }));
    });

    for (const q of created.filter((x) => x.repo === repo)) {
      const start = q.launched ?? q.created;
      const phase = q.launched ? (now - q.launched) / 1000 : 0;
      const b = buildQuest({
        repo,
        number: q.number,
        title: q.title,
        scope: q.scope,
        start,
        phase: q.merged ? 400 : Math.min(phase, 240),
        autoMerge: Boolean(q.merged),
      });
      b.issue.created_at = iso(q.created);
      add(b);
    }

    data.runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    data.pulls.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return data;
  });
}
