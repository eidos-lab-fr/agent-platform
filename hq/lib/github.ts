// Accès à l'API REST de GitHub avec le jeton de l'utilisateur connecté.
// Agir avec ce jeton garde ton login comme expéditeur : les workflows d'agent-platform
// ne démarrent que pour les logins de allowed_users.

import type { RawIssue, RawJob, RawPull, RawRepoData, RawRun } from "./derive";
import { isActiveRun } from "./derive";
import { config } from "./config";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "agent-hq",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GitHubError(res.status, `GitHub ${res.status} sur ${path} : ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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

/** Repos branchés sur la plateforme : HQ_REPOS, sinon ceux de l'org qui ont le workflow Agent dev. */
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

async function listScopes(token: string, repo: string): Promise<string[]> {
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
  return { repo, scopes, issues, pulls, runs, jobs, lastComments };
}
