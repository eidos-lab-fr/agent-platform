// Turns the Agent HQ world into an Agent Arcade snapshot (components/arcade).
// This is the only file that knows both sides, so Arcade can be extracted as is.

import type { ArcadeAgent, ArcadeSnapshot } from "@/components/arcade/types";
import { agentName } from "@/components/util";
import type { Agent, World } from "./types";

function toArcadeAgent(a: Agent): ArcadeAgent {
  return {
    id: a.id,
    role: a.role,
    label: agentName(a.role, a.scope),
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
          summary: `${agents.filter((a) => a.activity !== "idle").length} active · ${waiting} quest(s) at the front door`,
          zones: [
            {
              slot: "main",
              title: "Dev desks",
              kind: "desks",
              desks: scopes.map((s) => ({ id: s, agents: devs.filter((a) => (a.scope ?? "general") === s).map(toArcadeAgent) })),
            },
            {
              slot: "side",
              title: "Review tower",
              kind: "agents",
              agents: agents.filter((a) => ["spec", "securite", "tests"].includes(a.role)).map(toArcadeAgent),
            },
            { slot: "corner", title: "@claude corner", kind: "agents", agents: agents.filter((a) => a.role === "claude").map(toArcadeAgent) },
            {
              slot: "bottom",
              title: "Mailbox",
              kind: "tray",
              empty: "empty",
              items: quests
                .filter((q) => q.stage === "pr_ouverte")
                .map((q) => ({ id: q.id, label: `📦 #${q.pr?.number}`, title: q.title, targetId: q.id })),
            },
            {
              slot: "bottomCorner",
              title: "Your door · Merge",
              kind: "tray",
              empty: "nothing to approve",
              items: quests
                .filter((q) => q.stage === "revue_humaine")
                .map((q) => ({ id: q.id, label: `✅ #${q.pr?.number} ${q.title.slice(0, 24)}`, title: q.title, highlight: true, targetId: q.id })),
            },
          ],
        };
      }),
  };
}
