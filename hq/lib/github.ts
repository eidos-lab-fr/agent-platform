// GitHub REST API access with the signed-in user's token.
// Acting with this token keeps your login as the sender: agent-platform workflows
// only start for logins listed in allowed_users.

import type { RawIssue, RawJob, RawPull, RawRepoData, RawRun } from "./derive";
import { isActiveRun, WORKFLOW_REVIEW } from "./derive";
import type { PRStats } from "./types";
import { createHash } from "node:crypto";
import { config } from "./config";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Conditional requests: GitHub answers 304 when nothing changed, and a 304 does not count
// against the 5,000 requests per hour of the token. Most polls of a quiet repo end there.
const etags = new Map<string, { etag: string; data: unknown }>();
/** Cache keys never hold the token itself. */
const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 16);
const MAX_ETAGS = 2000;

export async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const key = method === "GET" ? `${tokenKey(token)}:${path}` : null;
  const cached = key ? etags.get(key) : undefined;
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "agent-hq",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cached ? { "If-None-Match": cached.etag } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 304 && cached) return cached.data as T;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GitHubError(res.status, `GitHub ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  const etag = res.headers.get("etag");
  if (key && etag) {
    if (etags.size >= MAX_ETAGS) etags.delete(etags.keys().next().value!);
    etags.set(key, { etag, data });
  }
  return data;
}

/** For tests. */
export function clearEtags() {
  etags.clear();
}

async function exists(token: string, path: string): Promise<boolean> {
  try {
    await gh(token, path);
    return true;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return false;
    throw e;
  }
}

const repoCache = new Map<string, { at: number; repos: string[] }>();

/** Repos connected to the platform: HQ_REPOS, else the org's repos that have the Agent dev workflow. */
export async function listConnectedRepos(token: string): Promise<string[]> {
  if (config.repos.length) return config.repos.map((r) => (r.includes("/") ? r : `${config.org}/${r}`));
  const cached = repoCache.get(token);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.repos;
  const all = await gh<{ full_name: string; archived: boolean }[]>(token, `/orgs/${config.org}/repos?per_page=100&sort=pushed`);
  const candidates = all.filter((r) => !r.archived && !r.full_name.endsWith(`/${config.platformRepo}`));
  const checks = await Promise.all(
    candidates.map(async (r) => ((await exists(token, `/repos/${r.full_name}/contents/.github/workflows/agent-dev.yml`)) ? r.full_name : null)),
  );
  const repos = checks.filter((x): x is string => x !== null);
  repoCache.set(token, { at: Date.now(), repos });
  return repos;
}

// Desks (scopes) only change when a setup PR is merged: read them every 5 minutes.
const scopeCache = new Map<string, { at: number; scopes: Promise<string[]> }>();

function listScopes(token: string, repo: string): Promise<string[]> {
  const key = `${tokenKey(token)}:${repo}`;
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.scopes;
  const scopes = readScopes(token, repo);
  scopeCache.set(key, { at: Date.now(), scopes });
  scopes.catch(() => scopeCache.delete(key));
  return scopes;
}

async function readScopes(token: string, repo: string): Promise<string[]> {
  try {
    const files = await gh<{ name: string }[]>(token, `/repos/${repo}/contents/.github/agents`);
    return files
      .map((f) => /^dev-(.+)\.md$/.exec(f.name)?.[1])
      .filter((s): s is string => Boolean(s));
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return [];
    throw e;
  }
}

export async function fetchRepoData(token: string, repo: string): Promise<RawRepoData> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [scopes, issues, pulls, runsRes] = await Promise.all([
    listScopes(token, repo),
    gh<RawIssue[]>(token, `/repos/${repo}/issues?state=all&since=${since}&per_page=100&sort=updated`),
    gh<RawPull[]>(token, `/repos/${repo}/pulls?state=all&per_page=60&sort=created&direction=desc`),
    gh<{ workflow_runs: RawRun[] }>(token, `/repos/${repo}/actions/runs?per_page=40`),
  ]);
  const runs = runsRes.workflow_runs;
  const jobs: Record<number, RawJob[]> = {};
  await Promise.all(
    runs.filter(isActiveRun).map(async (run) => {
      const res = await gh<{ jobs: RawJob[] }>(token, `/repos/${repo}/actions/runs/${run.id}/jobs`);
      jobs[run.id] = res.jobs;
    }),
  );
  const lastComments: Record<number, string> = {};
  await Promise.all(
    issues
      .filter((i) => !i.pull_request && i.state === "open" && i.labels.some((l) => l.name === "needs-human"))
      .map(async (i) => {
        const comments = await gh<{ body: string }[]>(token, `/repos/${repo}/issues/${i.number}/comments?per_page=100`);
        const last = comments.at(-1);
        if (last) lastComments[i.number] = last.body;
      }),
  );
  const open = pulls.filter((p) => p.state === "open");
  const pullStats: Record<number, PRStats> = {};
  const reviewJobs: Record<string, RawJob[]> = {};
  await Promise.all(
    open.map(async (p) => {
      pullStats[p.number] = await prStats(token, repo, p);
      // Runs come newest first: the first finished review run of the branch is the latest.
      const run = runs.find((r) => r.name === WORKFLOW_REVIEW && r.head_branch === p.head.ref && r.status === "completed");
      if (run) reviewJobs[p.head.ref] = await finishedJobs(token, repo, run.id);
    }),
  );
  return { repo, scopes, issues, pulls, runs, jobs, lastComments, pullStats, reviewJobs };
}

// A PR's size only changes when it is updated, and a finished run never changes: cache both.
const statsCache = new Map<string, PRStats>();
const jobsCache = new Map<string, RawJob[]>();

async function prStats(token: string, repo: string, p: RawPull): Promise<PRStats> {
  const key = `${repo}#${p.number}@${p.updated_at ?? ""}`;
  const hit = statsCache.get(key);
  if (hit) return hit;
  const d = await gh<{ additions: number; deletions: number; changed_files: number; commits: number }>(token, `/repos/${repo}/pulls/${p.number}`);
  const stats = { additions: d.additions, deletions: d.deletions, files: d.changed_files, commits: d.commits };
  if (statsCache.size > 500) statsCache.clear();
  statsCache.set(key, stats);
  return stats;
}

async function finishedJobs(token: string, repo: string, runId: number): Promise<RawJob[]> {
  const key = `${repo}:${runId}`;
  const hit = jobsCache.get(key);
  if (hit) return hit;
  const res = await gh<{ jobs: RawJob[] }>(token, `/repos/${repo}/actions/runs/${runId}/jobs`);
  if (jobsCache.size > 500) jobsCache.clear();
  jobsCache.set(key, res.jobs);
  return res.jobs;
}
