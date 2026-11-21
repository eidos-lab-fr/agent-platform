"use client";

import { useState } from "react";
import { TEAM_TEMPLATES } from "@/lib/team-templates";
import { slug, type Team } from "@/lib/teams";
import { useHQ } from "./HQ";
import { ROLE_TEXT } from "./Team";
import { Sprite } from "./arcade/Sprite";

/** First visit: pick a ready-made team (or none), name it, and place the agents on islands. */
export function TeamWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { world, teamOp, busy, simple } = useHQ();
  const [step, setStep] = useState<"pick" | "place">("pick");
  const [template, setTemplate] = useState<string | null>(TEAM_TEMPLATES[0].id);
  const [name, setName] = useState("");
  const [team, setTeam] = useState<Team | null>(null);

  const create = async () => {
    const r = await teamOp({ op: "create", template, name });
    if (!r.ok || !r.team) return;
    // Proposed placement: every agent on the first island, dev agents on a desk of their own.
    const first = world.repos[0];
    const placed: Team = {
      ...r.team,
      agents: r.team.agents.map((a) => {
        if (!first) return a;
        const desks = first.scopes.filter((s) => s !== "general");
        const devIndex = r.team!.agents.filter((x) => x.role === "dev").indexOf(a);
        const scope = a.role === "dev" ? (desks[devIndex] ?? slug(a.name)) : a.role;
        return { ...a, placements: [{ repo: first.fullName, scope }] };
      }),
    };
    if (!placed.agents.length || !world.repos.length) return onDone();
    setTeam(placed);
    setStep("place");
  };

  const toggle = (agentId: string, repo: string) => {
    if (!team) return;
    setTeam({
      ...team,
      agents: team.agents.map((a) => {
        if (a.id !== agentId) return a;
        const on = a.placements.some((p) => p.repo === repo);
        if (on) return { ...a, placements: a.placements.filter((p) => p.repo !== repo) };
        const r = world.repos.find((x) => x.fullName === repo);
        const scope = a.role === "dev" ? (r?.scopes.find((s) => s !== "general" && !team.agents.some((o) => o.id !== a.id && o.placements.some((p) => p.repo === repo && p.scope === s))) ?? slug(a.name)) : a.role;
        return { ...a, placements: [...a.placements, { repo, scope }] };
      }),
    });
  };

  return (
    <div className="overlay">
      <div className="modal wizard" role="dialog" aria-label="Build your agent team">
        <header>
          <h2>{step === "pick" ? "👋 Welcome! Build your agent team" : "🏝️ Where do they work?"}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {step === "pick" && (
          <>
            <p className="muted">Start from a ready-made team or from scratch. You can add agents, give them skills and guardrails, and change everything later.</p>
            <div className="templates">
              {TEAM_TEMPLATES.map((t) => {
                const preview = t.build();
                return (
                  <button key={t.id} className={`template ${template === t.id ? "active" : ""}`} onClick={() => setTemplate(t.id)}>
                    <span className="template-emoji">{t.emoji}</span>
                    <strong>{t.name}</strong>
                    <span className="small">{t.pitch}</span>
                    <span className="template-crew">
                      {preview.agents.map((a) => (
                        <span key={a.id} title={`${a.name}: ${simple ? ROLE_TEXT[a.role].simple : ROLE_TEXT[a.role].dev}`}>
                          <Sprite role={a.role} activity="idle" size={28} />
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
              <button className={`template ${template === null ? "active" : ""}`} onClick={() => setTemplate(null)}>
                <span className="template-emoji">✏️</span>
                <strong>From scratch</strong>
                <span className="small">An empty team. Add the agents you need, one by one.</span>
              </button>
            </div>
            <label className="wizard-name">
              Team name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={TEAM_TEMPLATES.find((t) => t.id === template)?.build().name ?? "My team"} />
            </label>
            <footer>
              <button className="ghost" onClick={onClose}>
                Later
              </button>
              <button className="primary" disabled={busy} onClick={create}>
                Create the team
              </button>
            </footer>
          </>
        )}

        {step === "place" && team && (
          <>
            <p className="muted">Tick the islands each agent works on. An agent can work on several islands: each one gets its own copy.</p>
            <table className="place-grid">
              <thead>
                <tr>
                  <th />
                  {world.repos.map((r) => (
                    <th key={r.fullName}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.agents.map((a) => (
                  <tr key={a.id}>
                    <th>
                      <Sprite role={a.role} activity="idle" size={28} /> {a.name} <span className="muted small">{simple ? ROLE_TEXT[a.role].simple : ROLE_TEXT[a.role].dev}</span>
                    </th>
                    {world.repos.map((r) => (
                      <td key={r.fullName}>
                        <input
                          type="checkbox"
                          aria-label={`${a.name} on ${r.name}`}
                          checked={a.placements.some((p) => p.repo === r.fullName)}
                          onChange={() => toggle(a.id, r.fullName)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <footer>
              <button className="ghost" onClick={onDone}>
                Skip
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if ((await teamOp({ op: "save", team })).ok) onDone();
                }}
              >
                Save and open the team
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
