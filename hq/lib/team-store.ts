// Team storage.

import { config } from "./config";
import { gh, GitHubError } from "./github";
import type { Team } from "./teams";

// ---------------------------------------------------------------------------
// Storage. In demo mode, server memory. Signed in, one JSON file per team in the teams/
// folder of agent-platform, on its own branch (HQ_DATA_BRANCH, `hq-data` by default):
// teams are versioned and shared between your devices, but saving one never commits to
// main, which every connected repo runs its workflows from.

export interface TeamStore {
  list(): Promise<Team[]>;
  save(team: Team): Promise<Team>;
  remove(id: string): Promise<void>;
}

const demoTeams = new Map<string, Team>();

export const demoStore: TeamStore = {
  async list() {
    return [...demoTeams.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async save(team) {
    const saved = { ...team, updatedAt: new Date().toISOString() };
    demoTeams.set(team.id, saved);
    return saved;
  },
  async remove(id) {
    demoTeams.delete(id);
  },
};

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

const listCache = new Map<string, { at: number; teams: Team[] }>();

const notFound = (e: unknown) => e instanceof GitHubError && e.status === 404;

export function githubStore(token: string): TeamStore {
  const repo = `${config.org}/${config.platformRepo}`;
  const branch = config.dataBranch;
  const path = (id: string) => `/repos/${repo}/contents/teams/${id}.json`;

  /** The data branch, or null when it does not exist yet. */
  async function dataBranch(): Promise<string | null> {
    try {
      await gh(token, `/repos/${repo}/branches/${encodeURIComponent(branch)}`);
      return branch;
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }

  /** Creates the data branch from the default branch, so teams saved there earlier carry over. */
  async function ensureBranch(): Promise<void> {
    if (await dataBranch()) return;
    const { default_branch } = await gh<{ default_branch: string }>(token, `/repos/${repo}`);
    const ref = await gh<{ object: { sha: string } }>(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(default_branch)}`);
    await gh(token, `/repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  }

  async function sha(id: string): Promise<string | undefined> {
    try {
      return (await gh<{ sha: string }>(token, `${path(id)}?ref=${encodeURIComponent(branch)}`)).sha;
    } catch (e) {
      if (notFound(e)) return undefined;
      throw e;
    }
  }
  return {
    async list() {
      const hit = listCache.get(token);
      if (hit && Date.now() - hit.at < 30_000) return hit.teams;
      // Before the first save, teams may still be on the default branch (older Agent HQ).
      const ref = await dataBranch();
      const at = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      let files: { name: string; path: string }[] = [];
      try {
        files = await gh(token, `/repos/${repo}/contents/teams${at}`);
      } catch (e) {
        if (!notFound(e)) throw e;
      }
      const teams = await Promise.all(
        files
          .filter((f) => f.name.endsWith(".json"))
          .map(async (f) => {
            const file = await gh<{ content: string }>(token, `/repos/${repo}/contents/${f.path}${at}`);
            return JSON.parse(unb64(file.content)) as Team;
          }),
      );
      teams.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      listCache.set(token, { at: Date.now(), teams });
      return teams;
    },
    async save(team) {
      const saved = { ...team, updatedAt: new Date().toISOString() };
      await ensureBranch();
      await gh(token, path(team.id), {
        method: "PUT",
        body: JSON.stringify({
          message: `Agent HQ: update team "${team.name}"`,
          content: b64(JSON.stringify(saved, null, 2) + "\n"),
          sha: await sha(team.id),
          branch,
        }),
      });
      listCache.delete(token);
      return saved;
    },
    async remove(id) {
      await ensureBranch();
      const s = await sha(id);
      if (!s) return;
      await gh(token, path(id), { method: "DELETE", body: JSON.stringify({ message: `Agent HQ: delete team ${id}`, sha: s, branch }) });
      listCache.delete(token);
    },
  };
}
