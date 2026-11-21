// The Agent Arcade mascot: an original little pixel-art character, styled per role.

import "./arcade.css";
import { styleOf } from "./palette";
import type { ArcadeActivity, ArcadeRoleStyle } from "./types";

// 12 × 13 pixels. B body, S shade, W eye white, P pupil, M mouth, L legs, A antenna.
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

function eyes(activity: ArcadeActivity): string[] | null {
  if (activity === "idle") return ["..BBBBBBBB..", "..BPPBBPPB.."]; // eyes closed
  if (activity === "failed") return ["..BPBBBPBB..", "..BBPBBBPB.."]; // crossed-out eyes
  return null;
}

export function Sprite({
  role,
  activity,
  size = 48,
  palette,
}: {
  role: string;
  activity: ArcadeActivity;
  size?: number;
  palette?: Record<string, ArcadeRoleStyle>;
}) {
  const c = styleOf(role, palette);
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
  return (
    <svg
      className={`arcade-sprite sprite-${activity}`}
      viewBox="-2 -2 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${c.label} : ${activity}`}
    >
      <g className="sprite-body">{px}</g>
      {/* Hands: one raised when the agent waits for an answer, otherwise at its sides. */}
      <g className="sprite-hands" fill={c.shade}>
        {activity === "blocked" ? <rect x={10} y={2} width={1} height={5} /> : <rect className="hand-r" x={10} y={8} width={1} height={2} />}
        <rect className="hand-l" x={1} y={8} width={1} height={2} />
      </g>
      {c.prop === "cap" && <rect x={3} y={2} width={6} height={1} fill="#2b2140" />}
      {c.prop === "magnifier" && (
        <g className="prop">
          <rect x={11} y={8} width={2} height={2} fill="none" stroke="#2b2140" strokeWidth={0.5} />
          <rect x={12.5} y={10} width={0.6} height={1.6} fill="#2b2140" />
        </g>
      )}
      {c.prop === "shield" && <path className="prop" d="M-1.5 7h3v2.5l-1.5 1.5l-1.5-1.5z" fill="#2b2140" />}
      {c.prop === "flask" && <path className="prop" d="M11 7h2v1l1 3h-4l1-3z" fill="#8ff0c3" stroke="#2b2140" strokeWidth={0.3} />}
      {c.prop === "spark" && <path className="prop" d="M10.5 0l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="#fff4c2" />}
      {activity === "idle" && (
        <text className="zzz" x={10} y={1} fontSize={3} fill="#cfc8ff">
          z
        </text>
      )}
    </svg>
  );
}
