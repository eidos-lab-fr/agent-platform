import { describe, expect, it } from "vitest";
import { demoState } from "@/lib/board/demo-seed";
import { load, reduce, STEP_MS, tick, type BoardState } from "@/lib/board/engine";
import { MAX_CLONES, READY_TEAMS } from "@/lib/board/model";
import { guessZones, planCard } from "@/lib/board/planner";

const P = "acme/app";
const empty = (): BoardState => ({
  projects: [{ id: P, name: "app", color: "#fff" }],
  cards: [],
  teams: structuredClone(READY_TEAMS),
  teamOf: { [P]: "web-app" },
  nextNumber: { [P]: 1 },
  seq: 0,
});
const spec = { summary: "s", criteria: ["c"], outOfScope: "", engine: "rules" as const };

/** Adds an idea and takes it to "waiting" (launched). Returns the card id. */
function launch(s: BoardState, title: string, need: string, at = 0): [BoardState, string] {
  s = reduce(s, { type: "addIdea", project: P, title, need, at });
  const id = s.cards.at(-1)!.id;
  s = { ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, askAfter: undefined } : c)) };
  s = reduce(s, { type: "setSpec", id, spec, at });
  s = reduce(s, { type: "approveSpec", id, at });
  s = reduce(s, { type: "plan", id, at });
  s = reduce(s, { type: "launch", id, at });
  return [s, id];
}
const card = (s: BoardState, id: string) => s.cards.find((c) => c.id === id)!;
const run = (s: BoardState, from: number, ms: number) => {
  for (let t = from; t <= from + ms; t += 1000) s = tick(s, t);
  return s;
};

describe("planner", () => {
  it("guesses zones from the words, front when nothing matches", () => {
    expect(guessZones("Add a button on the settings page")).toEqual(["front"]);
    expect(guessZones("Store the tags in the database")).toContain("data");
    expect(guessZones("Something vague")).toEqual(["front"]);
  });
  it("plans one step per zone plus a test step, with the files of each zone", () => {
    const p = planCard({ id: "c1", title: "Colored tags", need: "Tags on the note page, saved in the database", spec, zones: ["front", "data"] });
    expect(p.zones).toEqual(["front", "data"]);
    expect(Object.keys(p.files).sort()).toEqual(["data", "front"]);
    expect(p.files.data).toContain("db/schema.ts");
    expect(p.steps.length).toBeGreaterThan(2);
  });
});

describe("parallelism", () => {
  it("runs cards on different files at once, with clones of the same agent", () => {
    let s = empty();
    let a: string, b: string;
    [s, a] = launch(s, "Colored tags", "Tags on the note page");
    [s, b] = launch(s, "Dark theme", "A dark theme for the settings screen");
    expect(card(s, a).column).toBe("in_progress");
    expect(card(s, b).column).toBe("in_progress");
    expect(card(s, a).workers[0].clone).toBe(1);
    expect(card(s, b).workers[0].clone).toBe(2);
    expect(card(s, b).workers[0].branch).toMatch(/^agent\/2-front$/);
  });

  it("makes a card on the same files wait, and starts it when the first one is done", () => {
    let s = empty();
    let a: string, b: string;
    [s, a] = launch(s, "Colored tags on notes", "Tags on the note page");
    [s, b] = launch(s, "Tag colors on the note list", "Show the tag colors next to each note");
    expect(card(s, b).column).toBe("waiting");
    expect(card(s, b).plan!.verdict).toMatchObject({ parallel: false, blockedBy: a });
    s = run(s, 0, STEP_MS * 10);
    expect(card(s, a).column).toBe("review");
    expect(card(s, b).column).not.toBe("waiting");
  });

  it("'run in parallel anyway' skips the file check but never the clone limit", () => {
    let s = empty();
    let b: string;
    [s] = launch(s, "Colored tags on notes", "Tags on the note page");
    [s, b] = launch(s, "Tag colors on the note list", "Show the tag colors next to each note");
    expect(card(s, b).column).toBe("waiting");
    s = reduce(s, { type: "override", id: b, value: "force", at: 1 });
    expect(card(s, b).column).toBe("in_progress");

    let t = empty();
    const ids: string[] = [];
    const screens = ["profile", "billing", "search", "inbox", "calendar", "export"];
    for (const name of screens) {
      let id: string;
      [t, id] = launch(t, `${name} screen`, `A new ${name} screen`);
      ids.push(id);
    }
    const front = load(t, P).find((g) => g.agentId === "front")!;
    expect(front.used).toBe(MAX_CLONES);
    const queued = ids.filter((id) => card(t, id).column === "waiting");
    expect(queued).toHaveLength(screens.length - MAX_CLONES);
    t = reduce(t, { type: "override", id: queued[0], value: "force", at: 1 });
    expect(card(t, queued[0]).column).toBe("waiting");
  });

  it("'hold' keeps a free card waiting", () => {
    let s = empty();
    s = reduce(s, { type: "addIdea", project: P, title: "Docs page", need: "A readme section", at: 0 });
    const id = s.cards[0].id;
    s = reduce(s, { type: "setSpec", id, spec, at: 0 });
    s = reduce(s, { type: "approveSpec", id, at: 0 });
    s = reduce(s, { type: "plan", id, at: 0 });
    s = reduce(s, { type: "override", id, value: "hold", at: 0 });
    s = reduce(s, { type: "launch", id, at: 0 });
    expect(card(s, id).column).toBe("waiting");
  });
});

describe("agents at work", () => {
  it("pause on a question until you answer, then finish into review", () => {
    let s = empty();
    let a: string;
    [s, a] = launch(s, "Colored tags", "Tags on the note page");
    s = { ...s, cards: s.cards.map((c) => (c.id === a ? { ...c, askAfter: 1 } : c)) };
    s = run(s, 0, STEP_MS + 1000);
    const asked = card(s, a);
    expect(asked.messages.some((m) => m.open)).toBe(true);
    const before = asked.plan!.steps.filter((x) => x.status === "done").length;
    s = run(s, STEP_MS + 2000, STEP_MS * 3);
    expect(card(s, a).plan!.steps.filter((x) => x.status === "done").length).toBe(before);
    const at = STEP_MS * 5;
    s = reduce(s, { type: "answer", id: a, text: "Desktop only", at });
    s = run(s, at, STEP_MS * 10);
    expect(card(s, a).column).toBe("review");
    expect(card(s, a).workers).toEqual([]);
    expect(card(s, a).change!.files).toBeGreaterThan(0);
  });

  it("answer your questions, and a requested change goes back through the queue", () => {
    let s = empty();
    let a: string;
    [s, a] = launch(s, "Colored tags", "Tags on the note page");
    s = reduce(s, { type: "ask", id: a, text: "How is it going?", at: 100 });
    s = tick(s, 100 + 3000);
    expect(card(s, a).messages.at(-1)!.from).toBe("agent");
    s = run(s, 4000, STEP_MS * 10);
    s = reduce(s, { type: "requestChange", id: a, text: "Bigger dots", at: STEP_MS * 20 });
    expect(card(s, a).column).toBe("in_progress");
    expect(card(s, a).plan!.steps.at(-1)!.text).toBe("Change: Bigger dots");
    s = run(s, STEP_MS * 20, STEP_MS * 3);
    s = reduce(s, { type: "ship", id: a, at: STEP_MS * 30 });
    expect(card(s, a).column).toBe("done");
  });
});

describe("demo", () => {
  it("has cards in every column, clones in parallel and a waiting card", () => {
    const s = demoState(1_000_000);
    const cols = new Set(s.cards.map((c) => c.column));
    for (const c of ["idea", "specified", "planned", "waiting", "in_progress", "review"]) expect(cols).toContain(c);
    expect(s.cards.some((c) => c.workers.some((w) => w.clone > 1))).toBe(true);
    expect(s.cards.filter((c) => c.workers.length).every((c) => c.workers.every((w) => w.clone <= MAX_CLONES))).toBe(true);
  });
});
