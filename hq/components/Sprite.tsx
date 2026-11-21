// La mascotte d'Agent HQ : un petit personnage original en pixel art, décliné par métier.

import type { AgentActivity, AgentRole } from "@/lib/types";

export const ROLE_COLORS: Record<AgentRole, { body: string; shade: string; label: string }> = {
  dev: { body: "#f0915e", shade: "#c96a3c", label: "Dev" },
  spec: { body: "#6fa8ff", shade: "#4a7fd1", label: "Relecteur spec" },
  securite: { body: "#b58cff", shade: "#8a63d6", label: "Relecteur sécurité" },
  tests: { body: "#5fd39a", shade: "#3aa775", label: "Relecteur tests" },
  claude: { body: "#f5c84c", shade: "#c99d24", label: "@claude" },
};

// 12 × 13 pixels. B corps, S ombre, W blanc des yeux, P pupille, M bouche, L jambes, A antenne.
const BODY = [
  ".....AA.....",
  "......A.....",
  "....BBBB....",
  "...BBBBBB...",
  "..BBBBBBBB..",
  "..BWWBBWWB..",
  "..BWPBBWPB..",
  "..BBBBBBBB..",
  "..BBBMMBBB..",
  "..SBBBBBBS..",
  "...SBBBBS...",
  "...LL..LL...",
  "...LL..LL...",
];

function eyes(activity: AgentActivity): string[] | null {
  if (activity === "idle") return ["..BBBBBBBB..", "..BPPBBPPB.."]; // yeux fermés
  if (activity === "failed") return ["..BPBBBPBB..", "..BBPBBBPB.."]; // yeux en croix
  return null;
}

export function Sprite({
  role,
  activity,
  size = 48,
}: {
  role: AgentRole;
  activity: AgentActivity;
  size?: number;
}) {
  const c = ROLE_COLORS[role];
  const rows = [...BODY];
  const e = eyes(activity);
  if (e) {
    rows[5] = e[0];
    rows[6] = e[1];
  }
  const fill: Record<string, string> = {
    B: c.body,
    S: c.shade,
    W: "#ffffff",
    P: "#1f1a2e",
    M: "#1f1a2e",
    L: c.shade,
    A: activity === "working" || activity === "reviewing" ? "#ffe27a" : c.shade,
  };
  const px: React.ReactElement[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") px.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill[ch]} />);
    }),
  );
  const raised = activity === "blocked";
  return (
    <svg
      className={`sprite sprite-${activity}`}
      viewBox="-2 -2 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${c.label} : ${activity}`}
    >
      <g className="sprite-body">{px}</g>
      {/* Mains : levée quand l'agent attend une réponse, sinon de chaque côté. */}
      <g className="sprite-hands" fill={c.shade}>
        {raised ? <rect x={10} y={2} width={1} height={5} /> : <rect className="hand-r" x={10} y={8} width={1} height={2} />}
        <rect className="hand-l" x={1} y={8} width={1} height={2} />
      </g>
      {role === "dev" && <rect x={3} y={2} width={6} height={1} fill="#2b2140" />}
      {role === "spec" && (
        <g className="prop">
          <rect x={11} y={8} width={2} height={2} fill="none" stroke="#2b2140" strokeWidth={0.5} />
          <rect x={12.5} y={10} width={0.6} height={1.6} fill="#2b2140" />
        </g>
      )}
      {role === "securite" && <path className="prop" d="M-1.5 7h3v2.5l-1.5 1.5l-1.5-1.5z" fill="#2b2140" />}
      {role === "tests" && <path className="prop" d="M11 7h2v1l1 3h-4l1-3z" fill="#8ff0c3" stroke="#2b2140" strokeWidth={0.3} />}
      {role === "claude" && <path className="prop" d="M10.5 0l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="#fff4c2" />}
      {activity === "idle" && (
        <text className="zzz" x={10} y={1} fontSize={3} fill="#cfc8ff">
          z
        </text>
      )}
    </svg>
  );
}
