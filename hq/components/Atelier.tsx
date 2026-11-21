"use client";

import { useEffect, useState } from "react";
import type { Agent, Quest } from "@/lib/types";
import { useHQ } from "./HQ";
import { ROLE_COLORS, Sprite } from "./Sprite";
import { ago, parisHourNow, repoName } from "./util";

const ACTIVITY_TEXT: Record<Agent["activity"], string> = {
  idle: "dort",
  queued: "attend son tour",
  preparing: "se prépare",
  working: "travaille",
  reviewing: "relit",
  blocked: "lève la main",
  failed: "est K.O.",
};

function Bubble({ agent }: { agent: Agent }) {
  if (agent.activity === "idle") return null;
  return (
    <div className={`bubble bubble-${agent.activity}`}>
      {agent.activity === "blocked" && <span className="bubble-q">?</span>}
      <strong>{agent.questTitle ?? "…"}</strong>
      <span>
        {agent.step} · {ago(agent.startedAt)}
      </span>
    </div>
  );
}

function AgentSpot({ agent, label }: { agent: Agent; label: string }) {
  const { openQuest } = useHQ();
  const busy = agent.activity !== "idle";
  return (
    <button
      className={`spot spot-${agent.activity}`}
      onClick={() => agent.questId && openQuest(agent.questId)}
      disabled={!agent.questId}
      title={`${label} ${ACTIVITY_TEXT[agent.activity]}`}
    >
      <Bubble agent={agent} />
      <Sprite role={agent.role} activity={agent.activity} size={busy ? 64 : 52} />
      <span className="spot-label">{label}</span>
      {agent.activity === "working" && <span className="sparks" aria-hidden>✦</span>}
    </button>
  );
}

function Room({ repo, agents, quests }: { repo: string; agents: Agent[]; quests: Quest[] }) {
  const { openQuest } = useHQ();
  const devs = agents.filter((a) => a.role === "dev");
  const scopes = [...new Set(devs.map((a) => a.scope ?? "general"))];
  const reviewers = agents.filter((a) => ["spec", "securite", "tests"].includes(a.role));
  const claude = agents.find((a) => a.role === "claude");
  const mailbox = quests.filter((q) => q.stage === "pr_ouverte");
  const door = quests.filter((q) => q.stage === "revue_humaine");
  const waiting = quests.filter((q) => q.stage === "a_developper");

  return (
    <section className="room">
      <header className="room-head">
        <h2>🏝️ {repoName(repo)}</h2>
        <span className="muted">
          {agents.filter((a) => a.activity !== "idle").length} actifs · {waiting.length} quête(s) à la porte d'entrée
        </span>
      </header>
      <div className="floor">
        <div className="zone desks">
          <h3>Bureaux des devs</h3>
          <div className="desk-row">
            {scopes.map((s) => (
              <div key={s} className="desk">
                <div className="desk-agents">
                  {devs
                    .filter((a) => (a.scope ?? "general") === s)
                    .map((a) => (
                      <AgentSpot key={a.id} agent={a} label={`dev ${s}`} />
                    ))}
                </div>
                <div className="desk-top" />
              </div>
            ))}
          </div>
        </div>

        <div className="zone tower">
          <h3>Tour de relecture</h3>
          <div className="desk-row">
            {reviewers.map((a) => (
              <AgentSpot key={a.id} agent={a} label={a.role} />
            ))}
          </div>
        </div>

        <div className="zone corner">
          <h3>Coin @claude</h3>
          {claude && <AgentSpot agent={claude} label="@claude" />}
        </div>

        <div className="zone mailbox">
          <h3>Boîte aux lettres</h3>
          <div className="parcels">
            {mailbox.length === 0 && <span className="muted small">vide</span>}
            {mailbox.map((q) => (
              <button key={q.id} className="parcel-chip" onClick={() => openQuest(q.id)} title={q.title}>
                📦 #{q.pr?.number}
              </button>
            ))}
          </div>
        </div>

        <div className="zone door">
          <h3>Ta porte · Merge</h3>
          <div className="parcels">
            {door.length === 0 && <span className="muted small">rien à valider</span>}
            {door.map((q) => (
              <button key={q.id} className="parcel-chip gold" onClick={() => openQuest(q.id)} title={q.title}>
                ✅ #{q.pr?.number} {q.title.slice(0, 24)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Atelier() {
  const { world } = useHQ();
  const [filter, setFilter] = useState<string>("tous");
  const [hour, setHour] = useState(12);
  const [, tick] = useState(0);
  useEffect(() => {
    setHour(parisHourNow());
    const t = setInterval(() => {
      setHour(parisHourNow());
      tick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const night = hour >= 21 || hour < 7;
  const repos = world.repos.filter((r) => filter === "tous" || r.fullName === filter);

  return (
    <div className={`atelier ${night ? "night" : "day"}`}>
      <div className="atelier-bar">
        <div className="chips">
          <button className={filter === "tous" ? "active" : ""} onClick={() => setFilter("tous")}>
            Toutes les îles
          </button>
          {world.repos.map((r) => (
            <button key={r.fullName} className={filter === r.fullName ? "active" : ""} onClick={() => setFilter(r.fullName)}>
              {r.name}
            </button>
          ))}
        </div>
        <span className="muted">{night ? "🌙 Nuit à Paris" : "☀️ Jour à Paris"}</span>
      </div>
      <div className="legend-roles">
        {Object.entries(ROLE_COLORS).map(([role, c]) => (
          <span key={role}>
            <i style={{ background: c.body }} /> {c.label}
          </span>
        ))}
      </div>
      {repos.length === 0 && <p className="muted">Aucun repo branché. Onboarde-en un depuis l'Archipel.</p>}
      {repos.map((r) => (
        <Room
          key={r.fullName}
          repo={r.fullName}
          agents={world.agents.filter((a) => a.repo === r.fullName)}
          quests={world.quests.filter((q) => q.repo === r.fullName)}
        />
      ))}
    </div>
  );
}
