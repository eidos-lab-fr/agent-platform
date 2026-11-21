// Every word that differs between Simple mode (product words, for a PM) and Dev mode (GitHub words).
// Add a word here rather than writing `simple ? "…" : "…"` in a component: a missing translation
// then shows as a type error.

import type { Stage } from "@/lib/types";

const STAGE: Record<Stage, { simple: string; dev: string }> = {
  backlog: { simple: "Backlog", dev: "Backlog" },
  a_developper: { simple: "About to start", dev: "Ready for dev" },
  en_developpement: { simple: "Being built", dev: "In development" },
  pr_ouverte: { simple: "Being reviewed", dev: "PR open" },
  revue_humaine: { simple: "Waiting for your OK", dev: "Human review" },
  done: { simple: "Live", dev: "Done" },
  bloque: { simple: "Needs your answer", dev: "Blocked" },
};

const WORDS = {
  repo: { simple: "product", dev: "island" },
  repos: { simple: "Products", dev: "Islands" },
  allRepos: { simple: "All products", dev: "All islands" },
  quest: { simple: "request", dev: "quest" },
  newQuest: { simple: "+ New request", dev: "+ Forge a quest" },
  atWork: { simple: "Being built right now", dev: "At work right now" },
  atWorkTile: { simple: "being built", dev: "agents at work" },
  atWorkEmpty: { simple: "Nothing is being built. Start a request from the Requests tab.", dev: "Everyone is asleep. Hand out a quest from the Quests tab." },
  blocked: { simple: "Needs your answer", dev: "Raised hands" },
  blockedTile: { simple: "need your answer", dev: "raised hands" },
  blockedEmpty: { simple: "Nobody is waiting for you.", dev: "No agent is waiting for you." },
  toMerge: { simple: "Ready to ship", dev: "Parcels at the door" },
  toMergeTile: { simple: "ready to ship", dev: "parcels to merge" },
  toMergeEmpty: { simple: "Nothing to approve yet.", dev: "No PR approved by the reviewers yet." },
  approved: { simple: "approved", dev: "review:ok" },
  completedTile: { simple: "shipped (60 days)", dev: "quests completed (60 days)" },
  connect: { simple: "Connect a product", dev: "🌫️ Unknown island" },
  connectHint: {
    simple: "Connecting a product sets it up for the agents: labels, secrets, then a setup change for you to approve.",
    dev: "Runs agent-platform's \"Onboarder un repo\" workflow: labels and secrets, then a setup PR for you to merge.",
  },
  connectButton: { simple: "Connect", dev: "Explore the island" },
  repoPlaceholder: { simple: "repository name", dev: "repo-name (without the org)" },
  noRepo: { simple: "No product connected yet. Connect one in Settings.", dev: "No connected repo yet. Onboard one from the Archipelago tab." },
  placements: { simple: "🧭 Products", dev: "🏝️ Islands" },
} as const;

export type Word = keyof typeof WORDS;

export function stageText(stage: Stage, simple: boolean): string {
  return simple ? STAGE[stage].simple : STAGE[stage].dev;
}

export function word(key: Word, simple: boolean): string {
  return simple ? WORDS[key].simple : WORDS[key].dev;
}
