// The demo board: three projects with cards at every stage, built with the engine's own moves.

import { reduce, type BoardState } from "./engine";
import { READY_TEAMS, type Spec } from "./model";

export const DEMO_PROJECTS = [
  { id: "eidos-lab-fr/notula", name: "notula", color: "#4f8cff" },
  { id: "eidos-lab-fr/eidoslab", name: "eidoslab", color: "#f2c94c" },
  { id: "eidos-lab-fr/prompt-compare", name: "prompt-compare", color: "#a06cf0" },
];

/** Repos you can add in the demo. */
export const DEMO_REPOS = ["eidos-lab-fr/agent-sandbox", "eidos-lab-fr/kapa", "eidos-lab-fr/travel-map"];

const spec = (summary: string, ...criteria: string[]): Spec => ({ summary, criteria, outOfScope: "", engine: "rules" });

export function demoState(now = Date.now()): BoardState {
  let s: BoardState = {
    projects: DEMO_PROJECTS,
    cards: [],
    teams: structuredClone(READY_TEAMS),
    teamOf: { "eidos-lab-fr/notula": "web-app", "eidos-lab-fr/eidoslab": "content-site", "eidos-lab-fr/prompt-compare": "solo" },
    nextNumber: { "eidos-lab-fr/notula": 41, "eidos-lab-fr/eidoslab": 12, "eidos-lab-fr/prompt-compare": 7 },
    seq: 0,
  };
  const t = (min: number) => now - min * 60_000;
  const last = () => s.cards[s.cards.length - 1].id;
  const idea = (project: string, title: string, need: string, min: number) => {
    s = reduce(s, { type: "addIdea", project, title, need, at: t(min) });
    return last();
  };
  const toSpecified = (id: string, sp: Spec, min: number) => {
    s = reduce(s, { type: "setSpec", id, spec: sp, at: t(min) });
    s = reduce(s, { type: "approveSpec", id, at: t(min) });
  };
  const toPlanned = (id: string, sp: Spec, min: number) => {
    toSpecified(id, sp, min);
    s = reduce(s, { type: "plan", id, at: t(min) });
  };
  const launch = (id: string, sp: Spec, min: number, noQuestion = true) => {
    toPlanned(id, sp, min);
    s = { ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, askAfter: noQuestion ? undefined : 1 } : c)) };
    s = reduce(s, { type: "launch", id, at: now - 1000 });
  };
  const N = "eidos-lab-fr/notula";
  const E = "eidos-lab-fr/eidoslab";
  const P = "eidos-lab-fr/prompt-compare";

  // notula: two Front clones in parallel on different screens, one card waiting on the same files.
  launch(idea(N, "Colored tags on notes", "People can add colored tags to a note and see them on the note page.", 50), spec("Tags with a color, shown on each note.", "A tag has a name and a color", "Tags show on the note page"), 40);
  launch(idea(N, "Export a note as PDF", "Export the note as a PDF from the server, with the title and the date at the top.", 45), spec("A PDF export of one note.", "The PDF has the title and the date", "Export works for notes up to 50 pages"), 35);
  launch(idea(N, "Dark theme button in the menu", "A button in the menu to switch to a dark theme.", 40), spec("A dark theme the user can switch on.", "The menu has a theme button", "The choice is remembered"), 30, false);
  launch(idea(N, "Tag colors on the note list screen", "Show the tag colors on the note screen too, next to each title.", 30), spec("Tag colors on the list.", "Each note of the list shows its tag colors"), 20);
  toPlanned(idea(N, "Version history for a note", "Keep the history of each note and let people restore an old version from the database.", 20), spec("History of note versions.", "Every save keeps a version", "A version can be restored"), 15);
  toSpecified(idea(N, "Import notes from Markdown", "Import a folder of Markdown files as notes.", 12), spec("Import Markdown files as notes.", "Each file becomes a note", "Front matter tags are kept"), 10);
  idea(N, "Keyboard shortcuts", "Shortcuts to create a note and to search, like in Notion.", 5);

  // eidoslab: content site team.
  launch(idea(E, "English version of the site", "An English version of every page, with a language switch.", 60), spec("The site in English.", "Every page has an English version", "A switch changes the language"), 50);
  idea(E, "Project page for Agent HQ", "A page that presents Agent HQ with screenshots.", 8);

  // prompt-compare: one Solo agent.
  launch(idea(P, "Export results as CSV", "Download the comparison results as a CSV file from the server.", 30), spec("CSV export of results.", "The CSV has one row per prompt"), 25);

  // Make the first cards look well under way, and one ready to approve.
  s = {
    ...s,
    cards: s.cards.map((c) => {
      if (c.column !== "in_progress" || !c.plan) return c;
      const steps = c.plan.steps.map((x, i) => (i === 0 && c.number % 2 === 1 ? { ...x, status: "done" as const } : x));
      for (const w of c.workers) {
        if (!steps.some((x) => x.zone === w.zone && x.status === "doing")) {
          const nx = steps.find((x) => x.zone === w.zone && x.status === "todo");
          if (nx) Object.assign(nx, { status: "doing", startedAt: now - Math.floor(Math.random() * 3000) });
        }
      }
      return { ...c, plan: { ...c.plan, steps } };
    }),
  };
  const review = s.cards.find((c) => c.project === P)!;
  s = {
    ...s,
    cards: s.cards.map((c) =>
      c.id === review.id ? { ...c, column: "review", workers: [], plan: { ...c.plan!, steps: c.plan!.steps.map((x) => ({ ...x, status: "done" as const })) }, change: { files: 3, additions: 128, deletions: 14, url: null } } : c,
    ),
  };
  return s;
}
