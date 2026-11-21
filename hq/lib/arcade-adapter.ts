// Traduit le monde d'Agent HQ en instantané pour Agent Arcade (components/arcade).
// C'est le seul endroit qui connaît les deux : Arcade reste extractible tel quel.

import type { ArcadeAgent, ArcadeSnapshot } from "@/components/arcade/types";
import type { Agent, World } from "./types";

function toArcadeAgent(a: Agent): ArcadeAgent {
  return {
    id: a.id,
    role: a.role,
    label: a.role === "dev" ? `dev ${a.scope ?? "general"}` : a.role === "claude" ? "@claude" : a.role,
    activity: a.activity,
    title: a.questTitle,
    detail: a.step,
    startedAt: a.startedAt,
    targetId: a.questId,
  };
}

export function worldToArcade(world: World, repoFilter?: string): ArcadeSnapshot {
  return {
    rooms: world.repos
      .filter((r) => !repoFilter || r.fullName === repoFilter)
      .map((r) => {
        const agents = world.agents.filter((a) => a.repo === r.fullName);
        const quests = world.quests.filter((q) => q.repo === r.fullName);
        const devs = agents.filter((a) => a.role === "dev");
        const scopes = [...new Set(devs.map((a) => a.scope ?? "general"))];
        const waiting = quests.filter((q) => q.stage === "a_developper").length;
        return {
          id: r.fullName,
          name: r.name,
          summary: `${agents.filter((a) => a.activity !== "idle").length} actifs · ${waiting} quête(s) à la porte d'entrée`,
          zones: [
            {
              slot: "main",
              title: "Bureaux des devs",
              kind: "desks",
              desks: scopes.map((s) => ({ id: s, agents: devs.filter((a) => (a.scope ?? "general") === s).map(toArcadeAgent) })),
            },
            {
              slot: "side",
              title: "Tour de relecture",
              kind: "agents",
              agents: agents.filter((a) => ["spec", "securite", "tests"].includes(a.role)).map(toArcadeAgent),
            },
            { slot: "corner", title: "Coin @claude", kind: "agents", agents: agents.filter((a) => a.role === "claude").map(toArcadeAgent) },
            {
              slot: "bottom",
              title: "Boîte aux lettres",
              kind: "tray",
              empty: "vide",
              items: quests
                .filter((q) => q.stage === "pr_ouverte")
                .map((q) => ({ id: q.id, label: `📦 #${q.pr?.number}`, title: q.title, targetId: q.id })),
            },
            {
              slot: "bottomCorner",
              title: "Ta porte · Merge",
              kind: "tray",
              empty: "rien à valider",
              items: quests
                .filter((q) => q.stage === "revue_humaine")
                .map((q) => ({ id: q.id, label: `✅ #${q.pr?.number} ${q.title.slice(0, 24)}`, title: q.title, highlight: true, targetId: q.id })),
            },
          ],
        };
      }),
  };
}
