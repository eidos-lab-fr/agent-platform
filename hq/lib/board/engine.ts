// The board engine: every move of a card, as pure functions over the board state.
// The demo runs it in the browser with a clock; the GitHub adapter will map the same moves
// to issues, labels and workflow runs.

import { MAX_CLONES, READY_TEAMS, ZONES, type Card, type Column, type Message, type Project, type Spec, type Team, type Worker, type ZoneId } from "./model";
import { agentFor, guessZones, planCard, verdictFor } from "./planner";

export interface BoardState {
  projects: Project[];
  cards: Card[];
  teams: Team[];
  /** Active team of each project. */
  teamOf: Record<string, string>;
  nextNumber: Record<string, number>;
  seq: number;
}

/** How long a plan step takes in the demo. */
export const STEP_MS = 9000;
/** How long an agent takes to answer your question in the demo. */
export const REPLY_MS = 2500;

export type BoardAction =
  | { type: "addIdea"; project: string; title: string; need: string; at: number }
  | { type: "setSpec"; id: string; spec: Spec; title?: string; at: number }
  | { type: "approveSpec"; id: string; at: number }
  | { type: "plan"; id: string; at: number }
  | { type: "launch"; id: string; at: number }
  | { type: "override"; id: string; value: "force" | "hold" | null; at: number }
  | { type: "setZones"; id: string; zones: ZoneId[]; at: number }
  | { type: "answer"; id: string; text: string; at: number }
  | { type: "ask"; id: string; text: string; at: number }
  | { type: "ship"; id: string; at: number }
  | { type: "requestChange"; id: string; text: string; at: number }
  | { type: "delete"; id: string }
  | { type: "setTeam"; project: string; teamId: string }
  | { type: "saveTeam"; team: Team }
  | { type: "deleteTeam"; id: string }
  | { type: "addProject"; project: Project }
  | { type: "tick"; at: number };

export function teamOf(state: BoardState, project: string): Team {
  const id = state.teamOf[project] ?? "web-app";
  return state.teams.find((t) => t.id === id) ?? state.teams[0] ?? READY_TEAMS[0];
}

const updateCard = (state: BoardState, id: string, f: (c: Card) => Card): BoardState => ({
  ...state,
  cards: state.cards.map((c) => (c.id === id ? f(c) : c)),
});

const msg = (state: BoardState, m: Omit<Message, "id">): [BoardState, Message] => {
  const seq = state.seq + 1;
  return [{ ...state, seq }, { ...m, id: `m${seq}` }];
};

/** Clones for each zone of a card: the first free clone number of each agent, per project. */
function hireWorkers(state: BoardState, card: Card): Worker[] {
  const team = teamOf(state, card.project);
  const taken: Record<string, Set<number>> = {};
  for (const c of state.cards) {
    if (c.project !== card.project || c.column !== "in_progress" || c.id === card.id) continue;
    for (const w of c.workers) (taken[w.agentId] ??= new Set()).add(w.clone);
  }
  return card.plan!.zones.map((zone) => {
    const agent = agentFor(team, zone)!;
    const set = (taken[agent.id] ??= new Set());
    let clone = 1;
    while (set.has(clone) && clone < MAX_CLONES) clone++;
    set.add(clone);
    return { id: `${card.id}:${zone}`, agentId: agent.id, zone, clone, branch: `agent/${card.number}-${zone}` };
  });
}

function start(state: BoardState, card: Card, at: number): Card {
  const workers = hireWorkers(state, card);
  const steps = card.plan!.steps.map((s) => ({ ...s }));
  // Each clone starts on the first step of its zone.
  for (const w of workers) {
    const first = steps.find((s) => s.zone === w.zone && s.status === "todo");
    if (first) Object.assign(first, { status: "doing", startedAt: at });
  }
  return { ...card, column: "in_progress", workers, plan: { ...card.plan!, steps }, updatedAt: at };
}

/** Planned and waiting cards: recompute the verdict, start the waiting ones that can. */
export function schedule(state: BoardState, at: number): BoardState {
  let s = state;
  // Oldest first, so cards start in the order they were launched.
  const queue = s.cards.filter((c) => c.column === "waiting" || c.column === "planned").sort((a, b) => a.updatedAt - b.updatedAt);
  for (const q of queue) {
    const card = s.cards.find((c) => c.id === q.id)!;
    const team = teamOf(s, card.project);
    const verdict = verdictFor(card, s.cards, team);
    let next: Card = { ...card, plan: { ...card.plan!, verdict } };
    const canRun = card.plan!.override === "force" ? verdictFor(card, s.cards, team, { ignoreFiles: true }).parallel : verdict.parallel;
    if (card.column === "waiting" && canRun && card.plan!.override !== "hold") next = start(s, next, at);
    s = updateCard(s, card.id, () => next);
  }
  return s;
}

const REPLIES = [
  "I'm on it. The plan has not changed: I'll tell you if something blocks me.",
  "Good question. I'm following the acceptance criteria of the spec, one test per criterion.",
  "Noted, I'll take it into account in the next step.",
];

const QUESTIONS: Record<ZoneId, string> = {
  front: "Should this also work on mobile, or desktop only for now?",
  back: "What should happen when the limit is reached: an error message, or a silent retry?",
  data: "Should existing records be migrated too, or only new ones?",
  docs: "Which tone do you want: the same as the home page, or more technical?",
};

/** Advance the demo clock: steps get done, agents ask and answer, finished cards go to review. */
export function tick(state: BoardState, at: number): BoardState {
  let s = state;
  for (const c0 of state.cards) {
    let card = s.cards.find((c) => c.id === c0.id)!;

    // An agent answers your question after a moment.
    const last = card.messages.at(-1);
    if (last && last.from === "you" && !last.open && at - last.at > REPLY_MS && card.workers.length) {
      const w = card.workers[0];
      let m: Message;
      [s, m] = msg(s, { from: "agent", agentId: w.agentId, text: REPLIES[card.messages.length % REPLIES.length], at });
      card = { ...card, messages: [...card.messages, m] };
      s = updateCard(s, card.id, () => card);
    }

    if (card.column !== "in_progress" || !card.plan) continue;
    if (card.messages.some((m) => m.open)) continue; // Paused until you answer.
    const steps = card.plan.steps.map((x) => ({ ...x }));
    let changed = false;
    for (const w of card.workers) {
      const doing = steps.find((x) => x.zone === w.zone && x.status === "doing");
      if (doing && at - (doing.startedAt ?? at) >= STEP_MS) {
        doing.status = "done";
        changed = true;
        const done = steps.filter((x) => x.status === "done").length;
        if (card.askAfter !== undefined && done >= card.askAfter) {
          let m: Message;
          [s, m] = msg(s, { from: "agent", agentId: w.agentId, text: QUESTIONS[w.zone], at, open: true });
          card = { ...card, messages: [...card.messages, m], askAfter: undefined };
          break;
        }
        const next = steps.find((x) => x.zone === w.zone && x.status === "todo");
        if (next) Object.assign(next, { status: "doing", startedAt: at });
      }
      if (!steps.some((x) => x.zone === w.zone && x.status === "doing")) {
        const next = steps.find((x) => x.zone === w.zone && x.status === "todo");
        if (next && !card.messages.some((m) => m.open)) {
          Object.assign(next, { status: "doing", startedAt: at });
          changed = true;
        }
      }
    }
    if (!changed) continue;
    card = { ...card, plan: { ...card.plan!, steps }, updatedAt: at };
    if (steps.every((x) => x.status === "done")) {
      const size = steps.length;
      card = {
        ...card,
        column: "review",
        workers: [],
        change: { files: Object.values(card.plan!.files).flat().length + 1, additions: 40 * size + (card.number % 7) * 9, deletions: 6 * size, url: null },
      };
    }
    s = updateCard(s, card.id, () => card);
  }
  return schedule(s, at);
}

export function reduce(state: BoardState, a: BoardAction): BoardState {
  switch (a.type) {
    case "addIdea": {
      const number = state.nextNumber[a.project] ?? 1;
      const seq = state.seq + 1;
      const card: Card = {
        id: `c${seq}`,
        project: a.project,
        number,
        title: a.title.trim(),
        need: a.need.trim(),
        column: "idea",
        zones: guessZones(`${a.title} ${a.need}`),
        spec: null,
        plan: null,
        workers: [],
        messages: [],
        change: null,
        createdAt: a.at,
        updatedAt: a.at,
        askAfter: number % 3 === 0 ? 1 : undefined,
      };
      return { ...state, seq, cards: [...state.cards, card], nextNumber: { ...state.nextNumber, [a.project]: number + 1 } };
    }
    case "setSpec":
      return updateCard(state, a.id, (c) => ({ ...c, spec: a.spec, title: a.title?.trim() || c.title, updatedAt: a.at }));
    case "approveSpec":
      return updateCard(state, a.id, (c) => (c.spec ? { ...c, column: "specified" as Column, updatedAt: a.at } : c));
    case "plan": {
      const s = updateCard(state, a.id, (c) => {
        if (c.column !== "specified") return c;
        const plan = planCard(c);
        return { ...c, zones: plan.zones, column: "planned" as Column, plan: { ...plan, verdict: { parallel: true }, override: null }, updatedAt: a.at };
      });
      return schedule(s, a.at);
    }
    case "launch": {
      const card = state.cards.find((c) => c.id === a.id);
      if (!card || card.column !== "planned") return state;
      const s = updateCard(state, a.id, (c) => ({ ...c, column: "waiting" as Column, updatedAt: a.at }));
      return schedule(s, a.at);
    }
    case "override": {
      const s = updateCard(state, a.id, (c) => (c.plan ? { ...c, plan: { ...c.plan, override: a.value } } : c));
      return schedule(s, a.at);
    }
    case "setZones":
      return updateCard(state, a.id, (c) => (a.zones.length && (c.column === "idea" || c.column === "specified") ? { ...c, zones: a.zones } : c));
    case "answer": {
      const card = state.cards.find((c) => c.id === a.id);
      if (!card) return state;
      let s = state;
      let m: Message;
      [s, m] = msg(s, { from: "you", text: a.text.trim(), at: a.at });
      return updateCard(s, a.id, (c) => ({
        ...c,
        messages: [...c.messages.map((x) => (x.open ? { ...x, open: false } : x)), m],
        // Work resumes: restart the clock of the steps in progress.
        plan: c.plan ? { ...c.plan, steps: c.plan.steps.map((x) => (x.status === "doing" ? { ...x, startedAt: a.at } : x)) } : c.plan,
        updatedAt: a.at,
      }));
    }
    case "ask": {
      let s = state;
      let m: Message;
      [s, m] = msg(s, { from: "you", text: a.text.trim(), at: a.at });
      return updateCard(s, a.id, (c) => ({ ...c, messages: [...c.messages, m] }));
    }
    case "ship":
      return schedule(
        updateCard(state, a.id, (c) => (c.column === "review" ? { ...c, column: "done" as Column, updatedAt: a.at } : c)),
        a.at,
      );
    case "requestChange": {
      const card = state.cards.find((c) => c.id === a.id);
      if (!card || card.column !== "review" || !card.plan) return state;
      let s = state;
      let m: Message;
      [s, m] = msg(s, { from: "you", text: a.text.trim(), at: a.at });
      const zone = card.plan.zones[0];
      const step = { id: `${card.id}:${card.plan.steps.length}`, zone, text: `Change: ${a.text.trim()}`, status: "todo" as const };
      s = updateCard(s, a.id, (c) => ({ ...c, column: "waiting" as Column, change: null, messages: [...c.messages, m], plan: { ...c.plan!, steps: [...c.plan!.steps, step], override: null }, updatedAt: a.at }));
      return schedule(s, a.at);
    }
    case "delete":
      return { ...state, cards: state.cards.filter((c) => c.id !== a.id || c.column === "in_progress") };
    case "setTeam":
      return { ...state, teamOf: { ...state.teamOf, [a.project]: a.teamId } };
    case "saveTeam":
      return { ...state, teams: [...state.teams.filter((t) => t.id !== a.team.id), a.team] };
    case "deleteTeam": {
      const t = state.teams.find((x) => x.id === a.id);
      if (!t || t.builtIn) return state;
      const teamOfNext = Object.fromEntries(Object.entries(state.teamOf).filter(([, v]) => v !== a.id));
      return { ...state, teams: state.teams.filter((x) => x.id !== a.id), teamOf: teamOfNext };
    }
    case "addProject":
      return state.projects.some((p) => p.id === a.project.id) ? state : { ...state, projects: [...state.projects, a.project] };
    case "tick":
      return tick(state, a.at);
  }
}

/** Load per zone and agent for the gauges: clones at work out of MAX_CLONES. */
export function load(state: BoardState, project: string): { agentId: string; name: string; color: string; icon: string; used: number }[] {
  const ids = project === "all" ? state.projects.map((p) => p.id) : [project];
  const team = teamOf(state, ids[0] ?? project);
  return team.agents
    .filter((a) => a.kind === "builder")
    .map((a) => ({
      agentId: a.id,
      name: a.name,
      color: a.color,
      icon: a.icon,
      used: state.cards.filter((c) => ids.includes(c.project) && c.column === "in_progress").flatMap((c) => c.workers).filter((w) => w.agentId === a.id).length,
    }));
}

export const zoneColor = (z: ZoneId) => ZONES[z].color;
