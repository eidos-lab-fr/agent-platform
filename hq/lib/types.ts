// Modèle du monde affiché par Agent HQ. Tout est déduit de GitHub (ou simulé en mode démo).

/** Les colonnes du board d'agent-platform (board-setup.yml). */
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
  spec_en_cours: "Spec en cours",
  spec_prete: "Spec prête",
  a_developper: "À développer",
  en_developpement: "En développement",
  pr_ouverte: "PR ouverte",
  revue_humaine: "Revue humaine",
  done: "Done",
  bloque: "Bloqué",
};

export type Verdict = "ok" | "changes" | null;

export interface QuestPR {
  number: number;
  url: string;
  title: string;
  branch: string;
  state: "open" | "merged" | "closed";
  verdict: Verdict;
  mergedAt: string | null;
  createdAt: string;
}

export interface Quest {
  /** owner/repo#numéro */
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
  /** Dernier commentaire d'agent quand le ticket est bloqué (needs-human). */
  question: string | null;
}

export type AgentRole = "dev" | "spec" | "securite" | "tests" | "claude";

/** Geste affiché dans l'Atelier. */
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
  /** Scope pour un agent dev (front, api…), sinon null. */
  scope: string | null;
  activity: AgentActivity;
  questId: string | null;
  questTitle: string | null;
  /** Nom réel de l'étape GitHub Actions en cours. */
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
