import { describe, expect, it } from "vitest";
import { deriveAgents, deriveQuests, issueNumberOfPull, stageOf, type RawRepoData } from "@/lib/derive";
import { buildQuest, demoRawData } from "@/lib/demo";
import type { QuestPR } from "@/lib/types";
import { assembleWorld } from "@/lib/world";

const pr = (over: Partial<QuestPR> = {}): QuestPR => ({
  number: 2,
  url: "",
  title: "",
  branch: "agent/1-x",
  state: "open" as const,
  verdict: null,
  mergedAt: null,
  createdAt: "",
  stats: null,
  reviews: [],
  ...over,
});

describe("stageOf", () => {
  it("follows the agent-platform journey", () => {
    expect(stageOf({ state: "open", labels: [], pr: null, devRunning: false })).toBe("backlog");
    expect(stageOf({ state: "open", labels: ["ready-for-dev"], pr: null, devRunning: false })).toBe("a_developper");
    expect(stageOf({ state: "open", labels: ["ready-for-dev"], pr: null, devRunning: true })).toBe("en_developpement");
    expect(stageOf({ state: "open", labels: [], pr: pr(), devRunning: false })).toBe("pr_ouverte");
    expect(stageOf({ state: "open", labels: [], pr: pr({ verdict: "changes" }), devRunning: false })).toBe("pr_ouverte");
    expect(stageOf({ state: "open", labels: [], pr: pr({ verdict: "ok" }), devRunning: false })).toBe("revue_humaine");
    expect(stageOf({ state: "closed", labels: [], pr: pr({ state: "merged" }), devRunning: false })).toBe("done");
  });
  it("gives needs-human priority over an open PR", () => {
    expect(stageOf({ state: "open", labels: ["needs-human"], pr: pr(), devRunning: false })).toBe("bloque");
  });
});

describe("issueNumberOfPull", () => {
  it("reads the agent/<n>-slug branch, then Closes #n", () => {
    expect(issueNumberOfPull({ head: { ref: "agent/42-export-pdf" }, body: null })).toBe(42);
    expect(issueNumberOfPull({ head: { ref: "feature/x" }, body: "Closes #7 et spec" })).toBe(7);
    expect(issueNumberOfPull({ head: { ref: "feature/x" }, body: "rien" })).toBeNull();
  });
});

function single(phase: number, extra: Partial<Parameters<typeof buildQuest>[0]> = {}): RawRepoData {
  const b = buildQuest({ repo: "o/r", number: 5, title: "Exporter en PDF", scope: "front", start: Date.now() - phase * 1000, phase, ...extra });
  return {
    repo: "o/r",
    scopes: ["front", "api"],
    issues: [b.issue],
    pulls: b.pull ? [b.pull] : [],
    runs: b.runs,
    jobs: b.jobs,
    lastComments: b.comment ? { 5: b.comment } : {},
  };
}

describe("deriveAgents", () => {
  it("puts the dev agent of the right scope to work during claude-code-action", () => {
    const data = single(60);
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("en_developpement");
    const dev = deriveAgents(data, quests).find((a) => a.role === "dev" && a.scope === "front")!;
    expect(dev.activity).toBe("working");
    expect(dev.questId).toBe("o/r#5");
    const api = deriveAgents(data, quests).find((a) => a.role === "dev" && a.scope === "api")!;
    expect(api.activity).toBe("idle");
  });

  it("runs the three reviewers, then moves to human review", () => {
    const data = single(140);
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("pr_ouverte");
    const reviewers = deriveAgents(data, quests).filter((a) => ["spec", "securite", "tests"].includes(a.role));
    expect(reviewers.every((a) => a.activity === "reviewing")).toBe(true);

    const later = single(200);
    expect(deriveQuests(later)[0].stage).toBe("revue_humaine");
  });

  it("raises a hand with the agent's question when needs-human is added", () => {
    const data = single(80, { blockFrom: 70, blockTo: 115 });
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("bloque");
    expect(quests[0].question).toContain("Which one");
    const dev = deriveAgents(data, quests).find((a) => a.activity === "blocked");
    expect(dev?.scope).toBe("front");
  });

  it("adds a second agent when two quests of the same scope run at once", () => {
    const a = single(60);
    const b = buildQuest({ repo: "o/r", number: 9, title: "Autre", scope: "front", start: Date.now() - 50_000, phase: 50 });
    a.issues.push(b.issue);
    a.runs.push(...b.runs);
    Object.assign(a.jobs, b.jobs);
    const agents = deriveAgents(a, deriveQuests(a)).filter((x) => x.role === "dev" && x.scope === "front");
    expect(agents).toHaveLength(2);
    expect(agents.every((x) => x.activity === "working")).toBe(true);
  });
});

describe("demo world", () => {
  it("produces a consistent world", () => {
    const world = assembleWorld(demoRawData(), "demo", "demo");
    expect(world.repos.length).toBe(3);
    expect(world.quests.length).toBeGreaterThan(10);
    expect(world.progress.merged).toBeGreaterThan(0);
    expect(new Set(world.quests.map((q) => q.id)).size).toBe(world.quests.length);
  });
});

describe("reviewsOf", () => {
  it("reads each reviewer's result of the latest finished review run", async () => {
    const { reviewsOf } = await import("@/lib/derive");
    const r = reviewsOf("agent/1-x", {
      runs: [],
      jobs: {},
      reviewJobs: {
        "agent/1-x": [
          { name: "review / review (spec)", status: "completed", conclusion: "success", started_at: null },
          { name: "review / review (tests)", status: "completed", conclusion: "failure", started_at: null },
        ],
      },
    });
    expect(r).toEqual([
      { role: "spec", result: "passed" },
      { role: "tests", result: "failed" },
    ]);
  });
});
