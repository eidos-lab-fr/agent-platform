"use client";

import { useState } from "react";
import { AGENT_CATALOG, MAX_CLONES, ZONES, type AgentDef, type Team } from "@/lib/board/model";
import { Avatar } from "./Avatar";
import { TopBar } from "./TopBar";
import { useBoard } from "./store";

/** Ready-made teams, your own teams, and the agents they are made of. */
export function Teams() {
  const { state, act } = useBoard();
  const [editing, setEditing] = useState<Team | null>(null);

  const usedBy = (id: string) => state.projects.filter((p) => (state.teamOf[p.id] ?? "web-app") === id).map((p) => p.name);

  return (
    <main className="page">
      <TopBar />
      <div className="teams">
        <header className="teams-head">
          <h1>Agent teams</h1>
          <button className="primary" onClick={() => setEditing({ id: `team-${Date.now().toString(36)}`, name: "", builtIn: false, agents: [] })}>
            + Create a team
          </button>
        </header>
        <p className="muted">
          Each agent has one specialty and one color: cards of the same color go to it. When several cards of its color can run at the same time, it splits into up to {MAX_CLONES} clones,
          all as strong, with the same skills and rules.
        </p>
        <div className="team-grid">
          {state.teams.map((t) => (
            <section key={t.id} className="team-card">
              <header>
                <h2>{t.name}</h2>
                {t.builtIn && <span className="badge">ready-made</span>}
              </header>
              <ul className="agents">
                {t.agents.map((a) => (
                  <li key={a.id}>
                    <Avatar color={a.color} icon={a.icon} size={30} />
                    <div>
                      <strong>{a.name}</strong> <span className="muted small">{a.kind === "reviewer" ? "reviewer" : a.zones.map((z) => ZONES[z].name).join(", ")}</span>
                      <span className="muted small block">{a.specialty}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="muted small">{usedBy(t.id).length ? `Used by ${usedBy(t.id).join(", ")}` : "Not used yet: pick it from the team menu of a project."}</p>
              <footer>
                {t.builtIn ? (
                  <button className="ghost small" onClick={() => setEditing({ ...structuredClone(t), id: `team-${Date.now().toString(36)}`, name: `${t.name} (mine)`, builtIn: false })}>
                    Copy to customize
                  </button>
                ) : (
                  <>
                    <button className="ghost small" onClick={() => setEditing(structuredClone(t))}>
                      Edit
                    </button>
                    <button className="ghost small danger" onClick={() => act({ type: "deleteTeam", id: t.id })}>
                      Delete
                    </button>
                  </>
                )}
              </footer>
            </section>
          ))}
        </div>
      </div>
      {editing && <TeamEditor team={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function TeamEditor({ team: initial, onClose }: { team: Team; onClose: () => void }) {
  const { act } = useBoard();
  const [team, setTeam] = useState(initial);
  const [agent, setAgent] = useState<string | null>(null);
  const has = (id: string) => team.agents.some((a) => a.id === id);
  const toggle = (a: AgentDef) => setTeam({ ...team, agents: has(a.id) ? team.agents.filter((x) => x.id !== a.id) : [...team.agents, structuredClone(a)] });
  const setAgentDef = (a: AgentDef) => setTeam({ ...team, agents: team.agents.map((x) => (x.id === a.id ? a : x)) });
  const current = team.agents.find((a) => a.id === agent);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{initial.name ? "Edit the team" : "Create a team"}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <label>
          Name
          <input autoFocus value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} placeholder="My squad" />
        </label>
        <h3>Pick the agents</h3>
        <div className="catalog">
          {AGENT_CATALOG.map((a) => (
            <button key={a.id} className={`catalog-item ${has(a.id) ? "on" : ""}`} onClick={() => toggle(a)} style={{ ["--c" as string]: a.color }}>
              <Avatar color={a.color} icon={a.icon} size={30} />
              <strong>{a.name}</strong>
              <span className="muted small">{a.specialty}</span>
            </button>
          ))}
        </div>
        {team.agents.length > 0 && (
          <>
            <h3>Skills and rules</h3>
            <div className="chips">
              {team.agents.map((a) => (
                <button key={a.id} className={`chip ${agent === a.id ? "active" : ""}`} onClick={() => setAgent(agent === a.id ? null : a.id)}>
                  <span className="dot" style={{ background: a.color }} /> {a.name}
                </button>
              ))}
            </div>
            {current && (
              <div className="form-grid">
                <label>
                  Skills <span className="muted small">(what it reads before working, one per line)</span>
                  <textarea rows={4} defaultValue={current.skills.join("\n")} onBlur={(e) => setAgentDef({ ...current, skills: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} />
                </label>
                <label>
                  Rules <span className="muted small">(what it must never do, one per line)</span>
                  <textarea rows={4} defaultValue={current.rules.join("\n")} onBlur={(e) => setAgentDef({ ...current, rules: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} />
                </label>
              </div>
            )}
          </>
        )}
        <footer>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!team.name.trim() || !team.agents.some((a) => a.kind === "builder")}
            title={!team.agents.some((a) => a.kind === "builder") ? "A team needs at least one builder" : ""}
            onClick={() => {
              act({ type: "saveTeam", team: { ...team, name: team.name.trim() } });
              onClose();
            }}
          >
            Save the team
          </button>
        </footer>
      </div>
    </div>
  );
}
