import { describe, expect, it } from "vitest";
import { deriveAgents, deriveQuests, issueNumberOfPull, stageOf, type RawRepoData } from "@/lib/derive";
import { buildQuest, demoRawData } from "@/lib/demo";
import { assembleWorld } from "@/lib/world";

const pr = (over: Partial<Parameters<typeof stageOf>[0]["pr"] & object> = {}) => ({
  number: 2,
  url: "",
  title: "",
  branch: "agent/1-x",
  state: "open" as const,
  verdict: null,
  mergedAt: null,
  createdAt: "",
  ...over,
});

describe("stageOf", () => {
  it("suit le parcours d'agent-platform", () => {
    expect(stageOf({ state: "open", labels: [], pr: null, devRunning: false })).toBe("backlog");
    expect(stageOf({ state: "open", labels: ["ready-for-dev"], pr: null, devRunning: false })).toBe("a_developper");
    expect(stageOf({ state: "open", labels: ["ready-for-dev"], pr: null, devRunning: true })).toBe("en_developpement");
    expect(stageOf({ state: "open", labels: [], pr: pr(), devRunning: false })).toBe("pr_ouverte");
    expect(stageOf({ state: "open", labels: [], pr: pr({ verdict: "changes" }), devRunning: false })).toBe("pr_ouverte");
    expect(stageOf({ state: "open", labels: [], pr: pr({ verdict: "ok" }), devRunning: false })).toBe("revue_humaine");
    expect(stageOf({ state: "closed", labels: [], pr: pr({ state: "merged" }), devRunning: false })).toBe("done");
  });
  it("donne la priorité à needs-human sur une PR ouverte", () => {
    expect(stageOf({ state: "open", labels: ["needs-human"], pr: pr(), devRunning: false })).toBe("bloque");
  });
});

describe("issueNumberOfPull", () => {
  it("lit la branche agent/<n>-slug, puis Closes #n", () => {
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
  it("met l'agent dev du bon scope au travail pendant claude-code-action", () => {
    const data = single(60);
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("en_developpement");
    const dev = deriveAgents(data, quests).find((a) => a.role === "dev" && a.scope === "front")!;
    expect(dev.activity).toBe("working");
    expect(dev.questId).toBe("o/r#5");
    const api = deriveAgents(data, quests).find((a) => a.role === "dev" && a.scope === "api")!;
    expect(api.activity).toBe("idle");
  });

  it("fait relire les trois relecteurs puis passe en revue humaine", () => {
    const data = single(140);
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("pr_ouverte");
    const reviewers = deriveAgents(data, quests).filter((a) => ["spec", "securite", "tests"].includes(a.role));
    expect(reviewers.every((a) => a.activity === "reviewing")).toBe(true);

    const later = single(200);
    expect(deriveQuests(later)[0].stage).toBe("revue_humaine");
  });

  it("lève la main avec la question de l'agent quand needs-human est posé", () => {
    const data = single(80, { blockFrom: 70, blockTo: 115 });
    const quests = deriveQuests(data);
    expect(quests[0].stage).toBe("bloque");
    expect(quests[0].question).toContain("Laquelle");
    const dev = deriveAgents(data, quests).find((a) => a.activity === "blocked");
    expect(dev?.scope).toBe("front");
  });

  it("crée un second agent quand deux quêtes du même scope tournent en même temps", () => {
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

describe("monde de démo", () => {
  it("produit un monde cohérent", () => {
    const world = assembleWorld(demoRawData(), "demo", "demo");
    expect(world.repos.length).toBe(3);
    expect(world.quests.length).toBeGreaterThan(10);
    expect(world.progress.merged).toBeGreaterThan(0);
    expect(new Set(world.quests.map((q) => q.id)).size).toBe(world.quests.length);
  });
});
