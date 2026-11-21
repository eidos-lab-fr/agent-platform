// Team storage.

import { config } from "./config";
import { gh, GitHubError } from "./github";
import type { Team } from "./teams";

// ---------------------------------------------------------------------------
// Storage. In demo mode, server memory. Signed in, one JSON file per team in the
// teams/ folder of agent-platform, so teams are versioned like the rest.

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

export function githubStore(token: string): TeamStore {
  const repo = `${config.org}/${config.platformRepo}`;
  const path = (id: string) => `/repos/${repo}/contents/teams/${id}.json`;
  async function sha(id: string): Promise<string | undefined> {
    try {
      return (await gh<{ sha: string }>(token, path(id))).sha;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return undefined;
      throw e;
    }
  }
  return {
    async list() {
      const hit = listCache.get(token);
      if (hit && Date.now() - hit.at < 30_000) return hit.teams;
      let files: { name: string; path: string }[] = [];
      try {
        files = await gh(token, `/repos/${repo}/contents/teams`);
      } catch (e) {
        if (!(e instanceof GitHubError && e.status === 404)) throw e;
      }
      const teams = await Promise.all(
        files
          .filter((f) => f.name.endsWith(".json"))
          .map(async (f) => {
            const file = await gh<{ content: string }>(token, `/repos/${repo}/contents/${f.path}`);
            return JSON.parse(unb64(file.content)) as Team;
          }),
      );
      teams.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      listCache.set(token, { at: Date.now(), teams });
      return teams;
    },
    async save(team) {
      const saved = { ...team, updatedAt: new Date().toISOString() };
      await gh(token, path(team.id), {
        method: "PUT",
        body: JSON.stringify({
          message: `Agent HQ: update team "${team.name}"`,
          content: b64(JSON.stringify(saved, null, 2) + "\n"),
          sha: await sha(team.id),
        }),
      });
      listCache.delete(token);
      return saved;
    },
    async remove(id) {
      const s = await sha(id);
      if (!s) return;
      await gh(token, path(id), { method: "DELETE", body: JSON.stringify({ message: `Agent HQ: delete team ${id}`, sha: s }) });
      listCache.delete(token);
    },
  };
}
