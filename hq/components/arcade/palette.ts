import type { ArcadeRoleStyle } from "./types";

export const DEFAULT_PALETTE: Record<string, ArcadeRoleStyle> = {
  dev: { label: "Dev", body: "#f0915e", shade: "#c96a3c", prop: "cap" },
  spec: { label: "Spec reviewer", body: "#6fa8ff", shade: "#4a7fd1", prop: "magnifier" },
  securite: { label: "Security reviewer", body: "#b58cff", shade: "#8a63d6", prop: "shield" },
  tests: { label: "Test reviewer", body: "#5fd39a", shade: "#3aa775", prop: "flask" },
  claude: { label: "@claude", body: "#f5c84c", shade: "#c99d24", prop: "spark" },
};

const FALLBACK: ArcadeRoleStyle = { label: "Agent", body: "#9aa3b5", shade: "#6b7385", prop: "none" };

export function styleOf(role: string, palette: Record<string, ArcadeRoleStyle> = DEFAULT_PALETTE): ArcadeRoleStyle {
  return palette[role] ?? FALLBACK;
}
