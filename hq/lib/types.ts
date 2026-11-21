// The world model shown by Agent HQ. Everything is derived from GitHub (or simulated in demo mode).

/** agent-platform board columns (board-setup.yml). */
export const STAGES = [
  "backlog",
  "spec_en_cours",
  "spec_prete",
  "a_developper",
  "en_developpement",
  "pr_ouverte",
  "revue_humaine",
  "done",
  "bloque",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  backlog: "Backlog",
  spec_en_cours: "Spec in progress",
  spec_prete: "Spec ready",
  a_developper: "Ready for dev",
  en_developpement: "In development",
  pr_ouverte: "PR open",
  revue_humaine: "Human review",
  done: "Done",
  bloque: "Blocked",
};

export type Verdict = "ok" | "changes" | null;

export interface PRStats {
  additions: number;
  deletions: number;
  files: number;
  commits: number;
}

export interface ReviewResult {
  role: "spec" | "securite" | "tests";
  result: "passed" | "failed" | "running" | "queued";
}

export interface QuestPR {
  number: number;
  url: string;
  title: string;
  branch: string;
  state: "open" | "merged" | "closed";
  verdict: Verdict;
  mergedAt: string | null;
  createdAt: string;
  /** Size of the change (open PRs only). */
  stats: PRStats | null;
  /** Each reviewer's result in the latest review run of the branch. */
  reviews: ReviewResult[];
}

export interface Quest {
  /** owner/repo#number */
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  body: string;
  scope: string | null;
  labels: string[];
  stage: Stage;
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  pr: QuestPR | null;
  /** Last agent comment when the issue is blocked (needs-human). */
  question: string | null;
}

export type AgentRole = "dev" | "spec" | "securite" | "tests" | "claude";

/** What the agent is shown doing in the Workshop. */
export type AgentActivity =
  | "idle"
  | "queued"
  | "preparing"
  | "working"
  | "reviewing"
  | "blocked"
  | "failed";

export interface Agent {
  id: string;
  repo: string;
  role: AgentRole;
  /** Scope for a dev agent (front, api…), else null. */
  scope: string | null;
  activity: AgentActivity;
  questId: string | null;
  questTitle: string | null;
  /** Actual name of the running GitHub Actions step. */
  step: string | null;
  startedAt: string | null;
  runUrl: string | null;
}

export interface Repo {
  fullName: string;
  name: string;
  url: string;
  scopes: string[];
}

export interface ActivityEvent {
  id: string;
  at: string;
  repo: string;
  kind: "quest" | "launch" | "pr" | "review" | "blocked" | "merged" | "failed" | "claude";
  text: string;
  url: string | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  progress: number;
  goal: number;
}

export interface Progress {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  merged: number;
  firstTry: number;
  streakDays: number;
  achievements: Achievement[];
}

export interface World {
  mode: "github" | "demo";
  login: string;
  generatedAt: string;
  repos: Repo[];
  quests: Quest[];
  agents: Agent[];
  activity: ActivityEvent[];
  progress: Progress;
}
