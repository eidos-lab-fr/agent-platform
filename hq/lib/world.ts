// Assembles the whole world: quests, agents, activity and progress.

import { deriveActivity, deriveAgents, deriveQuests, type RawRepoData } from "./derive";
import { demoRawData } from "./demo";
import { fetchRepoData, listConnectedRepos } from "./github";
import { computeProgress } from "./progress";
import type { Session } from "./session";
import type { World } from "./types";

export function assembleWorld(raw: RawRepoData[], mode: World["mode"], login: string, now = new Date()): World {
  const quests = raw.flatMap(deriveQuests);
  const agents = raw.flatMap((r) => deriveAgents(r, quests.filter((q) => q.repo === r.repo)));
  const activity = raw
    .flatMap((r) => deriveActivity(r, quests.filter((q) => q.repo === r.repo)))
    .filter((e) => Date.parse(e.at) <= now.getTime())
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 60);
  const repos = raw.map((r) => ({
    fullName: r.repo,
    name: r.repo.split("/")[1] ?? r.repo,
    url: `https://github.com/${r.repo}`,
    scopes: r.scopes,
  }));
  quests.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return {
    mode,
    login,
    generatedAt: now.toISOString(),
    repos,
    quests,
    agents,
    activity,
    progress: computeProgress(quests, repos, now),
  };
}

const cache = new Map<string, { at: number; world: Promise<World> }>();
const TTL = 8_000;

export function getWorld(session: Session | null): Promise<World> {
  if (!session) return Promise.resolve(assembleWorld(demoRawData(), "demo", "demo"));
  const hit = cache.get(session.login);
  if (hit && Date.now() - hit.at < TTL) return hit.world;
  const world = (async () => {
    const repos = await listConnectedRepos(session.token);
    const raw = await Promise.all(repos.map((r) => fetchRepoData(session.token, r)));
    return assembleWorld(raw, "github", session.login);
  })();
  cache.set(session.login, { at: Date.now(), world });
  world.catch(() => cache.delete(session.login));
  return world;
}

export function invalidateWorld(login: string) {
  cache.delete(login);
}
