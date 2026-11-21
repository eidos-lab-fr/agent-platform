"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { load, teamOf } from "@/lib/board/engine";
import { MAX_CLONES } from "@/lib/board/model";
import { Avatar } from "./Avatar";
import { slugOf, useBoard } from "./store";

/** Logo, project picker (⌘K), team picker, load of each agent, and the main action. */
export function TopBar({ project, onNewIdea }: { project?: string; onNewIdea?: () => void }) {
  const { state, demo } = useBoard();
  const current = project === "all" ? { id: "all", name: "All projects", color: "#8a8fa8" } : state.projects.find((p) => p.id === project);
  return (
    <header className="topbar">
      <Link href="/?home=1" className="brand" title="All my projects">
        <span className="brand-mark">◆</span> Agent HQ
      </Link>
      {demo && <span className="badge">demo</span>}
      {current && <ProjectPicker current={current.id} />}
      {current && current.id !== "all" && <TeamPicker project={current.id} />}
      <div className="grow" />
      {current && <Gauges project={current.id} />}
      <Link href="/teams" className="ghost-link" title="Agent teams">
        Teams
      </Link>
      <Link href="/settings" className="ghost-link" title="AI settings">
        ⚙ AI
      </Link>
      {onNewIdea && (
        <button className="primary" onClick={onNewIdea}>
          + New idea
        </button>
      )}
    </header>
  );
}

function ProjectPicker({ current }: { current: string }) {
  const { state } = useBoard();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const options = useMemo(
    () => [{ id: "all", name: "All projects", color: "#8a8fa8" }, ...state.projects].filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [state.projects, q],
  );
  const [i, setI] = useState(0);
  const cur = options.find((p) => p.id === current) ?? [{ id: "all", name: "All projects", color: "#8a8fa8" }, ...state.projects].find((p) => p.id === current);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    router.push(`/${slugOf(id)}`);
  };

  return (
    <div className="picker">
      <button className="picker-button" onClick={() => setOpen(!open)} title="Switch project (⌘K)">
        <span className="dot" style={{ background: cur?.color }} />
        <strong>{cur?.name}</strong>
        <span className="muted small">⌘K ▾</span>
      </button>
      {open && (
        <div className="menu" role="listbox">
          <input
            ref={input}
            value={q}
            placeholder="Find a project"
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setI((x) => Math.min(x + 1, options.length - 1));
              if (e.key === "ArrowUp") setI((x) => Math.max(x - 1, 0));
              if (e.key === "Enter" && options[i]) go(options[i].id);
            }}
          />
          {options.map((p, k) => (
            <button key={p.id} className={`menu-item ${k === i ? "active" : ""} ${p.id === current ? "current" : ""}`} onClick={() => go(p.id)} onMouseEnter={() => setI(k)}>
              <span className="dot" style={{ background: p.color }} /> {p.name}
            </button>
          ))}
          <Link className="menu-item muted" href="/?home=1">
            + Add a project
          </Link>
        </div>
      )}
    </div>
  );
}

function TeamPicker({ project }: { project: string }) {
  const { state, act } = useBoard();
  const [open, setOpen] = useState(false);
  const team = teamOf(state, project);
  return (
    <div className="picker">
      <button className="picker-button team-pill" onClick={() => setOpen(!open)} title="Agent team of this project">
        <span className="muted small">Team</span>
        <strong>{team.name}</strong>
        <span className="team-dots">
          {team.agents.map((a) => (
            <span key={a.id} className="dot" style={{ background: a.color }} title={`${a.name}: ${a.specialty}`} />
          ))}
        </span>
        <span className="muted small">▾</span>
      </button>
      {open && (
        <div className="menu">
          {state.teams.map((t) => (
            <button
              key={t.id}
              className={`menu-item ${t.id === team.id ? "current" : ""}`}
              onClick={() => {
                act({ type: "setTeam", project, teamId: t.id });
                setOpen(false);
              }}
            >
              <span className="team-dots">
                {t.agents.map((a) => (
                  <span key={a.id} className="dot" style={{ background: a.color }} />
                ))}
              </span>
              {t.name}
            </button>
          ))}
          <Link className="menu-item muted" href="/teams">
            Manage teams…
          </Link>
        </div>
      )}
    </div>
  );
}

/** One gauge per builder agent: clones at work out of MAX_CLONES. Agents walk out from here. */
function Gauges({ project }: { project: string }) {
  const { state } = useBoard();
  if (project === "all") return null;
  return (
    <div className="gauges" aria-label="Agents at work">
      {load(state, project).map((g) => (
        <span key={g.agentId} className="gauge" data-dock={g.agentId} title={`${g.name}: ${g.used} of ${MAX_CLONES} clones at work`}>
          <Avatar color={g.color} icon={g.icon} size={20} />
          <span className="gauge-name">{g.name}</span>
          <span className="gauge-bar">
            {Array.from({ length: MAX_CLONES }, (_, k) => (
              <i key={k} style={k < g.used ? { background: g.color } : undefined} />
            ))}
          </span>
          <span className="muted small">
            {g.used}/{MAX_CLONES}
          </span>
        </span>
      ))}
    </div>
  );
}
