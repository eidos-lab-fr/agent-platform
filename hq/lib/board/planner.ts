// The planner: reads a spec, says which zones of the code it touches, writes a plan of
// development, and decides whether the card can run in parallel with the work in progress.
//
// Rule: two cards on different zones run in parallel. Two cards on the same zone run in
// parallel only if they touch different files; otherwise the second one waits. An agent can
// split into MAX_CLONES clones at most: past that, cards wait for a free clone.

import { MAX_CLONES, ZONE_IDS, ZONES, type AgentDef, type Card, type Plan, type PlanStep, type Team, type ZoneId } from "./model";

const STOP = new Set(
  "a an the of to for on in at by with and or from as is are be it its this that these those all any each every our your their my his her add make let allow allows users user people should can could would will new better more less page site app colored dark light simple small big".split(
    " ",
  ),
);

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Zones a request points to, most likely first. Defaults to the interface. */
export function guessZones(text: string): ZoneId[] {
  const ws = words(text);
  const scored = ZONE_IDS.map((z) => ({ z, score: ws.filter((w) => ZONES[z].hints.some((h) => w === h || w.startsWith(h))).length })).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.length ? scored.map((x) => x.z) : ["front"];
}

/** The main subject of a request ("export a note as PDF" → "note"), used to name files. */
export function subject(text: string): string {
  const ws = words(text).filter((w) => w.length > 2 && !STOP.has(w));
  const isHint = (w: string) => ZONE_IDS.some((z) => ZONES[z].hints.some((h) => w === h || w === `${h}s` || (h.length > 3 && w.startsWith(h))));
  const nouns = ws.filter((w) => !isHint(w));
  return (nouns[0] ?? ws[0] ?? "feature").replace(/s$/, "");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Files a change on this zone and subject would touch. Data changes always touch the schema. */
export function filesFor(zone: ZoneId, subj: string): string[] {
  switch (zone) {
    case "front":
      return [`src/components/${cap(subj)}.tsx`, `src/styles/${subj}.css`];
    case "back":
      return [`api/${subj}.ts`];
    case "data":
      return ["db/schema.ts", `db/migrations/add-${subj}.sql`];
    case "docs":
      return [`content/${subj}.md`];
  }
}

const STEP_TEXT: Record<ZoneId, (s: string) => string[]> = {
  front: (s) => [`Build the ${s} screen`, `Wire the ${s} screen to the data`],
  back: (s) => [`Add the ${s} endpoint`, `Handle errors and limits for ${s}`],
  data: (s) => [`Add the ${s} migration`, `Backfill existing ${s} records`],
  docs: (s) => [`Write the ${s} content`],
};

/** Plan of development for a card: zones, files, steps. The verdict is computed separately. */
export function planCard(card: Pick<Card, "id" | "title" | "need" | "spec" | "zones">): Omit<Plan, "verdict" | "override"> {
  const text = `${card.title} ${card.need} ${card.spec?.summary ?? ""} ${card.spec?.criteria.join(" ") ?? ""}`;
  const zones = card.zones.length ? card.zones : guessZones(text);
  const subj = subject(card.title || card.need);
  const files: Record<string, string[]> = {};
  const steps: PlanStep[] = [];
  for (const z of zones) {
    files[z] = filesFor(z, subj);
    for (const t of STEP_TEXT[z](subj)) steps.push({ id: `${card.id}:${steps.length}`, zone: z, text: t, status: "todo" });
  }
  steps.push({ id: `${card.id}:${steps.length}`, zone: zones[0], text: "Write a test for each acceptance criterion", status: "todo" });
  return { zones, files, steps };
}

/** The agent of the team that builds a zone. */
export function agentFor(team: Team, zone: ZoneId): AgentDef | undefined {
  return team.agents.find((a) => a.kind === "builder" && a.zones.includes(zone));
}

/** How many clones of each agent are at work across the given cards. */
export function clonesInUse(cards: Card[]): Record<string, number> {
  const used: Record<string, number> = {};
  for (const c of cards) if (c.column === "in_progress") for (const w of c.workers) used[w.agentId] = (used[w.agentId] ?? 0) + 1;
  return used;
}

export type Verdict = Plan["verdict"];

/**
 * Can this card start now? Blocked if a card in progress touches one of its files, if the
 * team has no agent for one of its zones, or if that agent already runs MAX_CLONES clones.
 * ignoreFiles (the "run in parallel anyway" override) skips the file check, never the clone limit.
 */
export function verdictFor(card: Card, others: Card[], team: Team, opts: { ignoreFiles?: boolean } = {}): Verdict {
  const plan = card.plan;
  if (!plan) return { parallel: false, blockedBy: "", reason: "Not planned yet" };
  const running = others.filter((o) => o.id !== card.id && o.project === card.project && o.column === "in_progress" && o.plan);
  for (const z of opts.ignoreFiles ? [] : plan.zones) {
    const mine = new Set(plan.files[z] ?? []);
    for (const o of running) {
      const shared = (o.plan!.files[z] ?? []).filter((f) => mine.has(f));
      if (shared.length) return { parallel: false, blockedBy: o.id, reason: `Same files as #${o.number}: ${shared.join(", ")}` };
    }
  }
  const used = clonesInUse(others.filter((o) => o.id !== card.id && o.project === card.project));
  const needed: Record<string, number> = {};
  for (const z of plan.zones) {
    const agent = agentFor(team, z);
    if (!agent) return { parallel: false, blockedBy: "", reason: `No ${ZONES[z].name} agent in the team "${team.name}"` };
    needed[agent.id] = (needed[agent.id] ?? 0) + 1;
    if ((used[agent.id] ?? 0) + needed[agent.id] > MAX_CLONES) {
      return { parallel: false, blockedBy: "", reason: `${agent.name} already works on ${MAX_CLONES} cards` };
    }
  }
  return { parallel: true };
}
