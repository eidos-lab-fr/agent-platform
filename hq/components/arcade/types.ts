// Agent Arcade : la vue animée des agents au travail.
// Ce module ne dépend de rien d'autre dans Agent HQ (ni GitHub, ni Next.js) : il reçoit un
// instantané du monde, ou une source qui en publie, et dessine les pièces et leurs agents.

/** Geste de la mascotte. */
export type ArcadeActivity = "idle" | "queued" | "preparing" | "working" | "reviewing" | "blocked" | "failed";

/** Accessoire dessiné sur la mascotte. */
export type ArcadeProp = "cap" | "magnifier" | "shield" | "flask" | "spark" | "none";

export interface ArcadeRoleStyle {
  label: string;
  body: string;
  shade: string;
  prop: ArcadeProp;
}

export interface ArcadeAgent {
  id: string;
  /** Clé de rôle, cherchée dans la palette (dev, spec, securite, tests, claude par défaut). */
  role: string;
  /** Nom affiché sous la mascotte. */
  label: string;
  activity: ArcadeActivity;
  /** Sujet en cours, affiché dans la bulle. */
  title?: string | null;
  /** Étape en cours, affichée sous le sujet. */
  detail?: string | null;
  startedAt?: string | null;
  /** Identifiant transmis à onSelect quand on clique l'agent. */
  targetId?: string | null;
}

export interface ArcadeItem {
  id: string;
  label: string;
  title?: string;
  highlight?: boolean;
  targetId?: string | null;
}

/** Emplacements fixes d'une pièce : le grand espace, deux à droite, deux en bas. */
export type ArcadeSlot = "main" | "side" | "corner" | "bottom" | "bottomCorner";

export type ArcadeZone =
  | { slot: ArcadeSlot; title: string; kind: "desks"; desks: { id: string; agents: ArcadeAgent[] }[] }
  | { slot: ArcadeSlot; title: string; kind: "agents"; agents: ArcadeAgent[] }
  | { slot: ArcadeSlot; title: string; kind: "tray"; items: ArcadeItem[]; empty: string };

export interface ArcadeRoom {
  id: string;
  name: string;
  summary?: string;
  zones: ArcadeZone[];
}

export interface ArcadeSnapshot {
  rooms: ArcadeRoom[];
}

/** Source d'instantanés : GitHub, un flux SSE, une simulation… Renvoie la fonction de désabonnement. */
export interface ArcadeSource {
  subscribe(listener: (snapshot: ArcadeSnapshot) => void): () => void;
}
