"use client";

import { useEffect, useMemo, useState } from "react";
import { duplicateAgent, newId, slug, TEAM_ROLES, validateTeam, type AgentFile, type Team, type TeamAgent, type TeamRole } from "@/lib/teams";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";
import { repoName } from "./util";

export const ROLE_TEXT: Record<TeamRole, { simple: string; dev: string; hint: string }> = {
  dev: { simple: "Builder", dev: "Dev agent", hint: "Writes the code for the requests of its desk." },
  spec: { simple: "Spec checker", dev: "Reviewer: spec", hint: "Checks the change does what was asked." },
  securite: { simple: "Security guard", dev: "Reviewer: security", hint: "Looks for secrets, injections, risky dependencies." },
  tests: { simple: "Test keeper", dev: "Reviewer: tests", hint: "Makes sure every change is tested." },
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function TeamTab({ onWizard }: { onWizard: () => void }) {
  const { teams, teamOp, busy, simple } = useHQ();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Team | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const current = teams?.find((t) => t.id === teamId) ?? teams?.[0] ?? null;
  useEffect(() => {
    setDraft(current ? structuredClone(current) : null);
  }, [current]);

  if (teams === null) return <p className="muted">Loading your teams…</p>;
  if (!teams.length || !draft || !current) {
    return (
      <section className="card team-empty">
        <h2>👥 No agent team yet</h2>
        <p>Pick a ready-made team or start from scratch, then shape each agent: what it knows, what it must never do, and where it works.</p>
        <button className="primary" onClick={onWizard}>
          Build my team
        </button>
      </section>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const problem = validateTeam(draft);
  const update = (patch: Partial<Team>) => setDraft({ ...draft, ...patch });
  const setAgent = (a: TeamAgent) => update({ agents: draft.agents.map((x) => (x.id === a.id ? a : x)) });
  const agent = draft.agents.find((a) => a.id === editing);

  const addAgent = (role: TeamRole) => {
    const a: TeamAgent = {
      id: newId("agent"),
      name: role === "dev" ? "New builder" : ROLE_TEXT[role].simple,
      role,
      mission: "",
      perimeter: role === "dev" ? ["**"] : [],
      attention: [],
      context: "",
      skills: [],
      guardrails: [],
      placements: [],
    };
    update({ agents: [...draft.agents, a] });
    setEditing(a.id);
  };

  return (
    <div className="team">
      <div className="atelier-bar">
        <div className="chips">
          {teams.map((t) => (
            <button key={t.id} className={t.id === current.id ? "active" : ""} onClick={() => setTeamId(t.id)}>
              {t.name}
            </button>
          ))}
          <button onClick={onWizard}>+ New team</button>
        </div>
        <div className="chips">
          {dirty && <span className="muted small">Unsaved changes</span>}
          <button className="primary" disabled={!dirty || busy || Boolean(problem)} onClick={() => teamOp({ op: "save", team: draft })} title={problem ?? ""}>
            Save the team
          </button>
        </div>
      </div>
      {problem && <div className="banner error">{problem}</div>}

      <section className="card team-head">
        <label>
          Team name
          <input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          What this team is for
          <input value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="Ships features end to end on the web app" />
        </label>
        <label className="wide">
          Shared context <span className="muted small">(every agent reads it: the product, its users, the tone, house rules)</span>
          <textarea rows={3} value={draft.context} onChange={(e) => update({ context: e.target.value })} />
        </label>
      </section>

      <div className="agent-cards team-agents">
        {draft.agents.map((a) => (
          <button key={a.id} className="agent-card team-agent" onClick={() => setEditing(a.id)}>
            <div className="agent-card-top">
              <Sprite role={a.role} activity={a.placements.length ? "working" : "idle"} size={48} />
              <div>
                <strong>{a.name}</strong>
                <span className="muted small">{simple ? ROLE_TEXT[a.role].simple : ROLE_TEXT[a.role].dev}</span>
              </div>
            </div>
            <p className="small">{a.mission || <span className="muted">No mission yet</span>}</p>
            <div className="team-agent-meta small">
              <span title="Skills">📚 {a.skills.length}</span>
              <span title="Guardrails">🛡️ {a.guardrails.length}</span>
              <span title="Islands">🏝️ {a.placements.length}</span>
            </div>
            <div className="chips small">
              {a.placements.map((p) => (
                <span key={`${p.repo}:${p.scope}`} className="tag">
                  {repoName(p.repo)}
                  {a.role === "dev" && !simple ? ` · ${p.scope}` : ""}
                </span>
              ))}
            </div>
          </button>
        ))}
        <div className="agent-card team-add">
          <strong>Add an agent</strong>
          {TEAM_ROLES.map((r) => (
            <button key={r} className="ghost small" onClick={() => addAgent(r)} title={ROLE_TEXT[r].hint}>
              + {simple ? ROLE_TEXT[r].simple : ROLE_TEXT[r].dev}
            </button>
          ))}
        </div>
      </div>

      <Deploy team={draft} saved={current} dirty={dirty} />

      <footer className="team-foot">
        <button
          className="ghost small danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete the team "${current.name}"? Files already deployed on islands stay in place.`)) teamOp({ op: "delete", id: current.id });
          }}
        >
          Delete this team
        </button>
      </footer>

      {agent && (
        <AgentEditor
          agent={agent}
          onChange={setAgent}
          onClose={() => setEditing(null)}
          onDuplicate={() => {
            const copy = duplicateAgent(agent);
            update({ agents: [...draft.agents, copy] });
            setEditing(copy.id);
          }}
          onRemove={() => {
            update({ agents: draft.agents.filter((x) => x.id !== agent.id) });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Deploy({ team, saved, dirty }: { team: Team; saved: Team; dirty: boolean }) {
  const { world, teamOp, busy, simple } = useHQ();
  const repos = [...new Set(team.agents.flatMap((a) => a.placements.map((p) => p.repo)))];
  return (
    <section className="card">
      <h2>🚢 Put the team to work</h2>
      <p className="muted small">
        {simple
          ? "Each product gets a change request with the agents' instructions. Once you approve it, the agents use them on every new request."
          : "One PR per island: .github/agents/dev-<desk>.md, review-<role>.md (your existing rules are kept) and the skill and guardrail files, plus the scope:<desk> labels."}
      </p>
      {!repos.length && <p className="muted">Open an agent and place it on an island first.</p>}
      <ul className="deploys">
        {repos.map((repo) => {
          const d = saved.deployments.find((x) => x.repo === repo);
          const here = team.agents.filter((a) => a.placements.some((p) => p.repo === repo));
          const known = world.repos.some((r) => r.fullName === repo);
          return (
            <li key={repo}>
              <div>
                <strong>🏝️ {repoName(repo)}</strong> <span className="muted small">{here.map((a) => a.name).join(", ")}</span>
                {!known && <span className="badge">not connected yet</span>}
                {d && (
                  <span className="muted small">
                    {" "}
                    · deployed {new Date(d.at).toLocaleDateString("en-GB")}
                    {d.prUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a href={d.prUrl} target="_blank" rel="noreferrer">
                          {simple ? "see the change" : "see the PR"}
                        </a>
                      </>
                    )}
                  </span>
                )}
              </div>
              <button className="primary small" disabled={busy || dirty} title={dirty ? "Save the team first" : ""} onClick={() => teamOp({ op: "deploy", id: team.id, repo })}>
                {simple ? "Send the instructions" : "Open the PR"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AgentEditor({
  agent: a,
  onChange,
  onClose,
  onDuplicate,
  onRemove,
}: {
  agent: TeamAgent;
  onChange: (a: TeamAgent) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { world, simple } = useHQ();
  const set = (patch: Partial<TeamAgent>) => onChange({ ...a, ...patch });
  const [perimeter, setPerimeter] = useState(a.perimeter.join("\n"));
  const [attention, setAttention] = useState(a.attention.join("\n"));
  useEffect(() => {
    setPerimeter(a.perimeter.join("\n"));
    setAttention(a.attention.join("\n"));
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const repos = world.repos;
  const placed = (repo: string) => a.placements.filter((p) => p.repo === repo);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal agent-editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Edit ${a.name}`}>
        <header>
          <h2>
            <Sprite role={a.role} activity="working" size={40} /> {a.name || "Agent"}
          </h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="form-grid">
          <label>
            Name
            <input value={a.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            Role
            <select value={a.role} onChange={(e) => set({ role: e.target.value as TeamRole, placements: [] })}>
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {simple ? ROLE_TEXT[r].simple : ROLE_TEXT[r].dev}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Mission <span className="muted small">(one sentence: what this agent is good at)</span>
            <input value={a.mission} onChange={(e) => set({ mission: e.target.value })} />
          </label>
          {a.role === "dev" && (
            <label className="wide">
              Files it may change <span className="muted small">(one path or pattern per line, e.g. src/components/**)</span>
              <textarea
                rows={3}
                value={perimeter}
                onChange={(e) => setPerimeter(e.target.value)}
                onBlur={() => set({ perimeter: lines(perimeter) })}
                className="mono"
              />
            </label>
          )}
          <label className="wide">
            Rules of thumb <span className="muted small">(one per line)</span>
            <textarea rows={3} value={attention} onChange={(e) => setAttention(e.target.value)} onBlur={() => set({ attention: lines(attention) })} />
          </label>
          <label className="wide">
            Context <span className="muted small">(what this agent should know on top of the team context)</span>
            <textarea rows={3} value={a.context} onChange={(e) => set({ context: e.target.value })} />
          </label>
        </div>

        <Files title="📚 Skills" hint="Know-how the agent reads before working: conventions, how-tos, examples." files={a.skills} onChange={(skills) => set({ skills })} />
        <Files
          title="🛡️ Guardrails"
          hint="What the agent must never do. If a request asks for it, the agent stops and asks you."
          files={a.guardrails}
          onChange={(guardrails) => set({ guardrails })}
        />

        <section className="editor-block">
          <h3>🏝️ Islands</h3>
          <p className="muted small">
            {a.role === "dev"
              ? "Place this agent on as many islands as you like: each one gets its own copy, at the desk you choose."
              : "This reviewer adds its rules to the review of every island you tick."}
          </p>
          {!repos.length && <p className="muted">No island connected yet.</p>}
          <ul className="placements">
            {repos.map((r) => {
              const here = placed(r.fullName);
              if (a.role !== "dev") {
                return (
                  <li key={r.fullName}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={here.length > 0}
                        onChange={(e) =>
                          set({
                            placements: e.target.checked
                              ? [...a.placements, { repo: r.fullName, scope: a.role }]
                              : a.placements.filter((p) => p.repo !== r.fullName),
                          })
                        }
                      />{" "}
                      {r.name}
                    </label>
                  </li>
                );
              }
              return (
                <li key={r.fullName}>
                  <strong>{r.name}</strong>
                  {here.map((p, i) => (
                    <span key={i} className="desk">
                      <input
                        list={`desks-${r.name}`}
                        value={p.scope}
                        aria-label={`Desk on ${r.name}`}
                        onChange={(e) =>
                          set({
                            placements: a.placements.map((x) => (x === p ? { ...x, scope: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } : x)),
                          })
                        }
                      />
                      <button className="ghost small" aria-label="Remove" onClick={() => set({ placements: a.placements.filter((x) => x !== p) })}>
                        ✕
                      </button>
                    </span>
                  ))}
                  <datalist id={`desks-${r.name}`}>
                    {r.scopes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <button
                    className="ghost small"
                    onClick={() => set({ placements: [...a.placements, { repo: r.fullName, scope: here.length ? `${slug(a.name)}-${here.length + 1}` : (r.scopes.find((s) => s !== "general") ?? slug(a.name)) }] })}
                  >
                    + {here.length ? "another desk" : "place here"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <footer>
          <button className="ghost danger" onClick={onRemove}>
            Remove from the team
          </button>
          <button className="ghost" onClick={onDuplicate} title="A copy you can train differently">
            Duplicate
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function Files({ title, hint, files, onChange }: { title: string; hint: string; files: AgentFile[]; onChange: (f: AgentFile[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const names = useMemo(() => new Set(files.map((f) => f.name)), [files]);
  const unique = (name: string) => {
    let n = name;
    for (let i = 2; names.has(n); i++) n = name.replace(/(\.\w+)?$/, `-${i}$1`);
    return n;
  };
  const upload = async (list: FileList | null) => {
    if (!list) return;
    const added: AgentFile[] = [];
    for (const f of Array.from(list).slice(0, 10)) {
      if (f.size > 50_000) continue;
      added.push({ name: unique(f.name.replace(/[^\w.-]/g, "-")), content: await f.text() });
    }
    onChange([...files, ...added]);
  };
  return (
    <section className="editor-block">
      <h3>{title}</h3>
      <p className="muted small">{hint}</p>
      <ul className="files">
        {files.map((f, i) => (
          <li key={i}>
            <div className="row">
              <input
                className="mono"
                value={f.name}
                aria-label="File name"
                onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/[^\w.-]/g, "-") } : x)))}
              />
              <button className="ghost small" onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? "Close" : "Edit"}
              </button>
              <button className="ghost small" aria-label="Delete file" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            {open === i && (
              <textarea rows={8} className="mono" value={f.content} onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} />
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          className="ghost small"
          onClick={() => {
            onChange([...files, { name: unique("new-file.md"), content: "# Title\n\n- \n" }]);
            setOpen(files.length);
          }}
        >
          + Write a file
        </button>
        <label className="ghost small upload">
          ⬆ Upload .md files
          <input type="file" accept=".md,.txt,text/markdown,text/plain" multiple onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
    </section>
  );
}
