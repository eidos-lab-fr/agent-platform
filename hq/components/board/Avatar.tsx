"use client";

// An agent: a small round creature in its color, with its icon on the chest.
// `walking` swings the legs, `working` makes it bob and type.

export function Avatar({
  color,
  icon,
  size = 34,
  clone,
  mood = "idle",
  title,
}: {
  color: string;
  icon: string;
  size?: number;
  clone?: number;
  mood?: "idle" | "walking" | "working" | "asking";
  title?: string;
}) {
  return (
    <span className={`avatar mood-${mood}`} style={{ width: size, height: size * 1.15 }} title={title}>
      <svg viewBox="0 0 40 46" width={size} height={size * 1.15} aria-hidden>
        <g className="legs">
          <rect className="leg leg-l" x="12" y="34" width="5" height="9" rx="2.5" fill={color} />
          <rect className="leg leg-r" x="23" y="34" width="5" height="9" rx="2.5" fill={color} />
        </g>
        <g className="body">
          <circle cx="20" cy="21" r="15" fill={color} />
          <circle cx="20" cy="21" r="15" fill="url(#shine)" opacity="0.35" />
          <ellipse cx="14.5" cy="17" rx="2.4" ry="3" fill="#16161f" />
          <ellipse cx="25.5" cy="17" rx="2.4" ry="3" fill="#16161f" />
          <circle cx="15.2" cy="16" r="0.9" fill="#fff" />
          <circle cx="26.2" cy="16" r="0.9" fill="#fff" />
          <text x="20" y="30" textAnchor="middle" fontSize="9" fill="#16161f" fontWeight="700">
            {icon}
          </text>
        </g>
        <defs>
          <radialGradient id="shine" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {mood === "asking" && <span className="bubble">?</span>}
      {clone && clone > 1 ? <span className="clone-badge">{clone}</span> : null}
    </span>
  );
}
