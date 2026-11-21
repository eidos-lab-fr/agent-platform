// Agent teams: who the agents are, what they know (skills), what they must never do
// (guardrails), and on which islands (repos) they work. A trained agent can be placed
// on several islands: each placement becomes a copy of its files in that repo.

export type TeamRole = "dev" | "spec" | "securite" | "tests";
export const TEAM_ROLES: TeamRole[] = ["dev", "spec", "securite", "tests"];

export interface AgentFile {
  /** File name, e.g. "react-conventions.md". */
  name: string;
  content: string;
}

export interface Placement {
  /** owner/repo */
  repo: string;
  /** Desk on that island (dev agents). Reviewers ignore it. */
  scope: string;
}

export interface TeamAgent {
  id: string;
  name: string;
  role: TeamRole;
  /** One sentence: what this agent is good at. */
  mission: string;
  /** Files the dev agent may change (globs). */
  perimeter: string[];
  /** Short rules, written in the agent file under "Points d'attention". */
  attention: string[];
  /** Free text the agent reads before working. */
  context: string;
  skills: AgentFile[];
  guardrails: AgentFile[];
  placements: Placement[];
}

export interface Deployment {
  repo: string;
  at: string;
  prUrl: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  /** Shared by all agents of the team: product, users, tone, conventions. */
  context: string;
  agents: TeamAgent[];
  template: string | null;
  createdAt: string;
  updatedAt: string;
  deployments: Deployment[];
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "x";

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const FILE_RE = /^[\w.-]{1,60}$/;
const GLOB_RE = /^[\w./*{},@ -]{1,120}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const SCOPE_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

/** Checks a team sent by the browser. Returns an error message or null. */
export function validateTeam(t: Team): string | null {
  if (!t || typeof t !== "object") return "Invalid team.";
  if (!/^[\w-]{1,60}$/.test(t.id ?? "")) return "Invalid team id.";
  if (!t.name?.trim() || t.name.length > 80) return "The team needs a name (80 characters max).";
  if (!Array.isArray(t.agents) || t.agents.length > 30) return "A team holds 30 agents at most.";
  if ((t.context ?? "").length > 20_000) return "The team context is too long.";
  const deskTaken = new Map<string, string>();
  for (const a of t.agents) {
    if (!/^[\w-]{1,60}$/.test(a.id ?? "")) return "Invalid agent id.";
    if (!a.name?.trim()) return "Every agent needs a name.";
    if (!TEAM_ROLES.includes(a.role)) return `Unknown role for ${a.name}.`;
    for (const g of a.perimeter ?? []) if (!GLOB_RE.test(g)) return `Invalid path in ${a.name}'s perimeter: ${g}`;
    for (const f of [...(a.skills ?? []), ...(a.guardrails ?? [])]) {
      if (!FILE_RE.test(f.name ?? "")) return `Invalid file name for ${a.name}: ${f.name}`;
      if ((f.content ?? "").length > 50_000) return `${f.name} is too long (50,000 characters max).`;
    }
    for (const p of a.placements ?? []) {
      if (!REPO_RE.test(p.repo ?? "")) return `Invalid island for ${a.name}.`;
      if (a.role === "dev") {
        if (!SCOPE_RE.test(p.scope ?? "")) return `Invalid desk for ${a.name} on ${p.repo}: use lowercase letters, digits and dashes.`;
        const key = `${p.repo}:${p.scope}`;
        const other = deskTaken.get(key);
        if (other && other !== a.id) return `Two dev agents share the "${p.scope}" desk on ${p.repo}.`;
        deskTaken.set(key, a.id);
      } else {
        const key = `${p.repo}:review:${a.role}`;
        const other = deskTaken.get(key);
        if (other && other !== a.id) return `Two ${a.role} reviewers are placed on ${p.repo}.`;
        deskTaken.set(key, a.id);
      }
    }
  }
  return null;
}

/** Copy of an agent, to train a variant without touching the original. */
export function duplicateAgent(a: TeamAgent): TeamAgent {
  return {
    ...structuredClone(a),
    id: newId("agent"),
    name: `${a.name} (copy)`,
    placements: [],
  };
}

