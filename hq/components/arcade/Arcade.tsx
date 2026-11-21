"use client";

// Agent Arcade: draws rooms where little agents work, from a snapshot (`snapshot` prop)
// or a source that publishes snapshots (`source` prop). No dependency on Agent HQ.

import { useEffect, useState } from "react";
import "./arcade.css";
import { DEFAULT_PALETTE, styleOf } from "./palette";
import { Sprite } from "./Sprite";
import type { ArcadeAgent, ArcadeRoleStyle, ArcadeRoom, ArcadeSnapshot, ArcadeSource, ArcadeZone } from "./types";

export type { ArcadeAgent, ArcadeRoom, ArcadeSnapshot, ArcadeSource } from "./types";

const ACTIVITY_TEXT: Record<ArcadeAgent["activity"], string> = {
  idle: "is asleep",
  queued: "is waiting its turn",
  preparing: "is getting ready",
  working: "is working",
  reviewing: "is reviewing",
  blocked: "is raising its hand",
  failed: "is knocked out",
};

export function elapsed(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** Subscribes the component to a snapshot source. */
export function useArcadeSource(source: ArcadeSource | undefined): ArcadeSnapshot | null {
  const [snapshot, setSnapshot] = useState<ArcadeSnapshot | null>(null);
  useEffect(() => (source ? source.subscribe(setSnapshot) : undefined), [source]);
  return snapshot;
}

interface Props {
  snapshot?: ArcadeSnapshot;
  source?: ArcadeSource;
  palette?: Record<string, ArcadeRoleStyle>;
  onSelect?: (targetId: string) => void;
  /** Time zone of the day and night cycle. */
  timeZone?: string;
  /** Shows the role legend. */
  legend?: boolean;
}

function hourIn(timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date()));
}

export function Arcade({ snapshot, source, palette = DEFAULT_PALETTE, onSelect, timeZone = "Europe/Paris", legend = true }: Props) {
  const fromSource = useArcadeSource(source);
  const data = snapshot ?? fromSource;
  const [hour, setHour] = useState(12);
  const [, tick] = useState(0);
  useEffect(() => {
    setHour(hourIn(timeZone));
    const t = setInterval(() => {
      setHour(hourIn(timeZone));
      tick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [timeZone]);
  const night = hour >= 21 || hour < 7;

  return (
    <div className={`arcade ${night ? "night" : "day"}`}>
      <div className="arcade-sky">{night ? "🌙 Night" : "☀️ Day"}</div>
      {legend && (
        <div className="arcade-legend">
          {Object.entries(palette).map(([role, c]) => (
            <span key={role}>
              <i style={{ background: c.body }} /> {c.label}
            </span>
          ))}
        </div>
      )}
      {!data && <p className="arcade-muted">The agents are on their way…</p>}
      {data?.rooms.map((room) => <Room key={room.id} room={room} palette={palette} onSelect={onSelect} />)}
    </div>
  );
}

function Room({ room, palette, onSelect }: { room: ArcadeRoom; palette: Record<string, ArcadeRoleStyle>; onSelect?: (id: string) => void }) {
  return (
    <section className="arcade-room">
      <header className="arcade-room-head">
        <h2>🏝️ {room.name}</h2>
        {room.summary && <span className="arcade-muted">{room.summary}</span>}
      </header>
      <div className="arcade-floor">
        {room.zones.map((z) => (
          <Zone key={`${z.slot}-${z.title}`} zone={z} palette={palette} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function Zone({ zone, palette, onSelect }: { zone: ArcadeZone; palette: Record<string, ArcadeRoleStyle>; onSelect?: (id: string) => void }) {
  return (
    <div className={`arcade-zone slot-${zone.slot}`}>
      <h3>{zone.title}</h3>
      {zone.kind === "desks" && (
        <div className="arcade-row">
          {zone.desks.map((d) => (
            <div key={d.id} className="arcade-desk">
              <div className="arcade-desk-agents">
                {d.agents.map((a) => (
                  <Spot key={a.id} agent={a} palette={palette} onSelect={onSelect} />
                ))}
              </div>
              <div className="arcade-desk-top" />
            </div>
          ))}
        </div>
      )}
      {zone.kind === "agents" && (
        <div className="arcade-row">
          {zone.agents.map((a) => (
            <Spot key={a.id} agent={a} palette={palette} onSelect={onSelect} />
          ))}
        </div>
      )}
      {zone.kind === "tray" && (
        <div className="arcade-items">
          {zone.items.length === 0 && <span className="arcade-muted small">{zone.empty}</span>}
          {zone.items.map((it) => (
            <button
              key={it.id}
              className={`arcade-item ${it.highlight ? "gold" : ""}`}
              title={it.title}
              disabled={!it.targetId || !onSelect}
              onClick={() => it.targetId && onSelect?.(it.targetId)}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spot({ agent, palette, onSelect }: { agent: ArcadeAgent; palette: Record<string, ArcadeRoleStyle>; onSelect?: (id: string) => void }) {
  const busy = agent.activity !== "idle";
  const style = styleOf(agent.role, palette);
  return (
    <button
      className={`arcade-spot spot-${agent.activity}`}
      onClick={() => agent.targetId && onSelect?.(agent.targetId)}
      disabled={!agent.targetId || !onSelect}
      title={`${agent.label} (${style.label}) ${ACTIVITY_TEXT[agent.activity]}`}
    >
      {busy && (
        <div className={`arcade-bubble bubble-${agent.activity}`}>
          {agent.activity === "blocked" && <span className="arcade-bubble-q">?</span>}
          <strong>{agent.title ?? "…"}</strong>
          <span>
            {agent.detail}
            {agent.startedAt ? ` · ${elapsed(agent.startedAt)}` : ""}
          </span>
        </div>
      )}
      <Sprite role={agent.role} activity={agent.activity} size={busy ? 64 : 52} palette={palette} />
      <span className="arcade-spot-label">{agent.label}</span>
      {agent.activity === "working" && (
        <span className="arcade-sparks" aria-hidden>
          ✦
        </span>
      )}
    </button>
  );
}
