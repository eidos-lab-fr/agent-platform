// Agent Arcade: the animated view of agents at work.
// This module depends on nothing else in Agent HQ (no GitHub, no Next.js): it takes a
// snapshot of the world, or a source that publishes them, and draws rooms and their agents.

/** What the mascot is doing. */
export type ArcadeActivity = "idle" | "queued" | "preparing" | "working" | "reviewing" | "blocked" | "failed";

/** Accessory drawn on the mascot. */
export type ArcadeProp = "cap" | "magnifier" | "shield" | "flask" | "spark" | "none";

export interface ArcadeRoleStyle {
  label: string;
  body: string;
  shade: string;
  prop: ArcadeProp;
}

export interface ArcadeAgent {
  id: string;
  /** Role key, looked up in the palette (dev, spec, securite, tests, claude by default). */
  role: string;
  /** Name shown under the mascot. */
  label: string;
  activity: ArcadeActivity;
  /** Current topic, shown in the speech bubble. */
  title?: string | null;
  /** Current step, shown under the topic. */
  detail?: string | null;
  startedAt?: string | null;
  /** Id passed to onSelect when the agent is clicked. */
  targetId?: string | null;
}

export interface ArcadeItem {
  id: string;
  label: string;
  title?: string;
  highlight?: boolean;
  targetId?: string | null;
}

/** Fixed slots in a room: the large area, two on the right, two at the bottom. */
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

/** Snapshot source: GitHub, an SSE stream, a simulation… Returns the unsubscribe function. */
export interface ArcadeSource {
  subscribe(listener: (snapshot: ArcadeSnapshot) => void): () => void;
}
