// The board model: projects, zones of code, agents, teams and cards.
// Pure data, shared by the demo engine and (later) the GitHub adapter.

/** A zone of the code a card touches. Each zone has the color of the agent that owns it. */
export type ZoneId = "front" | "back" | "data" | "docs";

export interface Zone {
  id: ZoneId;
  name: string;
  color: string;
  /** Words that point to this zone in a request (used by the planner in demo and rules mode). */
  hints: string[];
}

export const ZONES: Record<ZoneId, Zone> = {
  front: {
    id: "front",
    name: "Interface",
    color: "#4f8cff",
    hints: ["page", "button", "screen", "display", "show", "ui", "design", "form", "menu", "theme", "dark", "layout", "click", "modal", "mobile", "shortcut", "keyboard", "tag", "color"],
  },
  back: {
    id: "back",
    name: "Server",
    color: "#2fbf71",
    hints: ["api", "server", "endpoint", "auth", "login", "email", "export", "pdf", "rate", "limit", "webhook", "share", "link", "sync", "offline", "notification"],
  },
  data: {
    id: "data",
    name: "Data",
    color: "#a06cf0",
    hints: ["database", "schema", "migration", "import", "history", "search", "index", "stats", "csv", "store", "save", "score"],
  },
  docs: {
    id: "docs",
    name: "Content",
    color: "#f2c94c",
    hints: ["text", "copy", "content", "doc", "docs", "seo", "translation", "english", "french", "blog", "article", "readme", "wording"],
  },
};
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

/** An agent of a team: one specialty, one color, its own skills and rules. */
export interface AgentDef {
  id: string;
  name: string;
  /** One line: what it is good at. */
  specialty: string;
  color: string;
  icon: string;
  /** Zones it builds. A reviewer has none. */
  zones: ZoneId[];
  kind: "builder" | "reviewer";
  skills: string[];
  rules: string[];
}

/** Every agent can split into this many clones at most, all as strong and with the same context. */
export const MAX_CLONES = 4;

export const AGENT_CATALOG: AgentDef[] = [
  {
    id: "front",
    name: "Front",
    specialty: "Screens, components, styles",
    color: ZONES.front.color,
    icon: "◧",
    zones: ["front"],
    kind: "builder",
    skills: ["Component conventions of the repo", "Accessibility basics"],
    rules: ["Never change the API contract", "No new dependency"],
  },
  {
    id: "back",
    name: "Back",
    specialty: "API, server logic, integrations",
    color: ZONES.back.color,
    icon: "⚙",
    zones: ["back"],
    kind: "builder",
    skills: ["Error handling and logging", "Input validation"],
    rules: ["Never write a secret in the code", "No change to authentication without asking"],
  },
  {
    id: "data",
    name: "Data",
    specialty: "Schema, migrations, search, imports",
    color: ZONES.data.color,
    icon: "◆",
    zones: ["data"],
    kind: "builder",
    skills: ["Reversible migrations"],
    rules: ["Never drop a column with data", "Ask before any migration on production data"],
  },
  {
    id: "docs",
    name: "Docs",
    specialty: "Content, wording, SEO, documentation",
    color: ZONES.docs.color,
    icon: "✎",
    zones: ["docs"],
    kind: "builder",
    skills: ["House tone of voice"],
    rules: ["Keep both languages in sync"],
  },
  {
    id: "generalist",
    name: "Solo",
    specialty: "Does everything, one zone after the other",
    color: "#e8e8f0",
    icon: "★",
    zones: ["front", "back", "data", "docs"],
    kind: "builder",
    skills: [],
    rules: ["Stop and ask when a request is unclear"],
  },
  {
    id: "tests",
    name: "Tests",
    specialty: "Checks every change is tested",
    color: "#ff9f43",
    icon: "✓",
    zones: [],
    kind: "reviewer",
    skills: ["Test conventions of the repo"],
    rules: ["Block a change without tests"],
  },
  {
    id: "review",
    name: "Review",
    specialty: "Security and quality review",
    color: "#ff5c6c",
    icon: "◉",
    zones: [],
    kind: "reviewer",
    skills: ["Common security issues"],
    rules: ["Block any secret, injection or risky dependency"],
  },
];

export interface Team {
  id: string;
  name: string;
  /** Ready-made teams cannot be deleted, only copied. */
  builtIn: boolean;
  agents: AgentDef[];
}

const pick = (...ids: string[]) => ids.map((id) => structuredClone(AGENT_CATALOG.find((a) => a.id === id)!));

export const READY_TEAMS: Team[] = [
  { id: "web-app", name: "Web app", builtIn: true, agents: pick("front", "back", "data", "tests", "review") },
  { id: "content-site", name: "Content site", builtIn: true, agents: pick("docs", "front", "review") },
  { id: "solo", name: "Solo", builtIn: true, agents: pick("generalist") },
];

export interface Project {
  /** owner/repo, or "all". */
  id: string;
  name: string;
  color: string;
}

export const COLUMNS = ["idea", "specified", "planned", "waiting", "in_progress", "review"] as const;
export type Column = (typeof COLUMNS)[number] | "done";

export const COLUMN_TEXT: Record<Column, { name: string; hint: string }> = {
  idea: { name: "Ideas", hint: "Write the need in your own words" },
  specified: { name: "Specified", hint: "The AI wrote the spec, you approved it" },
  planned: { name: "Planned", hint: "The planner split it by zone and checked what can run in parallel" },
  waiting: { name: "Waiting", hint: "Blocked by work in progress on the same files: starts on its own" },
  in_progress: { name: "In progress", hint: "Agents at work" },
  review: { name: "To approve", hint: "A change is ready: ship it or ask for a change" },
  done: { name: "Shipped", hint: "Live" },
};

export interface Spec {
  summary: string;
  criteria: string[];
  outOfScope: string;
  engine: import("../ai-names").ProviderId;
}

export interface PlanStep {
  id: string;
  zone: ZoneId;
  text: string;
  status: "todo" | "doing" | "done";
  startedAt?: number;
}

export interface Plan {
  zones: ZoneId[];
  /** Files the change will touch, per zone: what the parallelism verdict is based on. */
  files: Record<string, string[]>;
  steps: PlanStep[];
  /** Planner's verdict, computed again each time the board changes. */
  verdict: { parallel: true } | { parallel: false; blockedBy: string; reason: string };
  /** Manual override: run even if the planner says it conflicts, or hold even if it does not. */
  override: "force" | "hold" | null;
}

export interface Message {
  id: string;
  from: "agent" | "you";
  agentId?: string;
  text: string;
  at: number;
  /** For an agent question: answered or still open. */
  open?: boolean;
}

/** One clone of an agent working on one zone of a card. */
export interface Worker {
  id: string;
  agentId: string;
  zone: ZoneId;
  /** 1 to MAX_CLONES: which clone of the agent this is. */
  clone: number;
  branch: string;
}

export interface Card {
  id: string;
  project: string;
  number: number;
  title: string;
  need: string;
  column: Column;
  /** Zones the card touches: its colors. Guessed from the need, then set by the planner. */
  zones: ZoneId[];
  spec: Spec | null;
  plan: Plan | null;
  workers: Worker[];
  messages: Message[];
  change: { files: number; additions: number; deletions: number; url: string | null } | null;
  createdAt: number;
  updatedAt: number;
  /** Demo only: the step after which the agent asks a question. */
  askAfter?: number;
}
