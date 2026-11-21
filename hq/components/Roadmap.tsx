"use client";

import { useState } from "react";
import type { Quest, Stage } from "@/lib/types";
import { Forge } from "./Forge";
import { useHQ } from "./HQ";
import { ago, repoName } from "./util";

// Product view: what is live on main, what is being built (one branch per request), what comes next.

const MILESTONES = ["Started", "Built", "Reviewed", "Live"];
const STEP_OF: Partial<Record<Stage, number>> = { a_developper: 0, en_developpement: 1, bloque: 1, pr_ouverte: 2, revue_humaine: 3, done: 4 };
const IN_PROGRESS: Stage[] = ["a_developper", "en_developpement", "bloque", "pr_ouverte", "revue_humaine"];
const BACKLOG: Stage[] = ["backlog", "spec_en_cours", "spec_prete"];

export function statusText(q: Quest, simple: boolean): string {
  switch (q.stage) {
    case "a_developper":
      return simple ? "About to start" : "ready-for-dev, waiting for a runner";
    case "en_developpement":
      return simple ? "Being built" : "Dev agent at work";
    case "bloque":
      return simple ? "Needs your answer" : "needs-human";
    case "pr_ouverte":
      return q.pr?.verdict === "changes" ? (simple ? "Being fixed after review" : "review:changes") : simple ? "Being reviewed" : "PR open, reviewers at work";
    case "revue_humaine":
      return simple ? "Ready: waiting for your OK" : "review:ok, waiting for your merge";
    default:
      return "";
  }
}

export function Roadmap() {
  const { world, openQuest, simple } = useHQ();
  const [repo, setRepo] = useState("all");
  const [forge, setForge] = useState(false);
  const quests = world.quests.filter((q) => repo === "all" || q.repo === repo);
  const live = quests.filter((q) => q.stage === "done").sort((a, b) => Date.parse(b.pr?.mergedAt ?? b.closedAt ?? b.updatedAt) - Date.parse(a.pr?.mergedAt ?? a.closedAt ?? a.updatedAt));
  const building = quests.filter((q) => IN_PROGRESS.includes(q.stage)).sort((a, b) => (STEP_OF[b.stage] ?? 0) - (STEP_OF[a.stage] ?? 0));
  const next = quests.filter((q) => BACKLOG.includes(q.stage));
  const recent = live.filter((q) => Date.now() - Date.parse(q.pr?.mergedAt ?? q.updatedAt) < 3 * 86_400_000).slice(0, 3);
  const waiting = building.filter((q) => q.stage === "revue_humaine" || q.stage === "bloque").length;

  return (
    <div className="roadmap">
      <div className="atelier-bar">
        <div className="chips">
          <button className={repo === "all" ? "active" : ""} onClick={() => setRepo("all")}>
            All products
          </button>
          {world.repos.map((r) => (
            <button key={r.fullName} className={repo === r.fullName ? "active" : ""} onClick={() => setRepo(r.fullName)}>
              {r.name}
            </button>
          ))}
        </div>
        <button className="primary" onClick={() => setForge(true)}>
          + New request
        </button>
      </div>

      <div className="roadmap-cols">
        <section className="card roadmap-col live-col">
          <h2>
            🟢 Live <span className="muted small">{simple ? "in production" : "merged on main"}</span>
          </h2>
          {!live.length && <p className="muted">Nothing shipped in the last 60 days.</p>}
          <ul className="roadmap-list">
            {live.slice(0, 20).map((q) => (
              <li key={q.id}>
                <button className="link" onClick={() => openQuest(q.id)}>
                  {q.title}
                </button>
                <span className="muted small">
                  {repo === "all" && `${repoName(q.repo)} · `}shipped {ago(q.pr?.mergedAt ?? q.closedAt ?? q.updatedAt)} ago
                  <span className="dev-only">{q.pr ? ` · PR #${q.pr.number}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card roadmap-col build-col">
          <h2>
            🛠️ In progress <span className="muted small">{simple ? "one branch per request" : "agent/* branches"}</span>
            {waiting > 0 && <span className="badge gold">{waiting} need you</span>}
          </h2>
          <div className="branches">
            <div className="branch-main">
              <span className="branch-main-dot" />
              <strong>{simple ? "Live product" : "main"}</strong>
            </div>
            {building.map((q) => (
              <Branch key={q.id} q={q} showRepo={repo === "all"} />
            ))}
            {recent.map((q) => (
              <Branch key={q.id} q={q} showRepo={repo === "all"} />
            ))}
            {!building.length && <p className="muted branch-empty">No request in progress. Pick one from the backlog.</p>}
          </div>
          <div className="branch-legend muted small">
            {MILESTONES.map((m, i) => (
              <span key={m}>
                <i className={`ms ms-${i}`} /> {m}
              </span>
            ))}
          </div>
        </section>

        <section className="card roadmap-col backlog-col">
          <h2>
            📋 Backlog <span className="muted small">{next.length}</span>
          </h2>
          {!next.length && <p className="muted">Empty. Describe the next thing you want.</p>}
          <ul className="roadmap-list">
            {next.map((q) => (
              <li key={q.id}>
                <button className="link" onClick={() => openQuest(q.id)}>
                  {q.title}
                </button>
                <span className="muted small">
                  {repo === "all" && `${repoName(q.repo)} · `}added {ago(q.createdAt)} ago
                  <span className="dev-only">{q.scope ? ` · ${q.scope}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {forge && <Forge onClose={() => setForge(false)} defaultRepo={repo === "all" ? undefined : repo} />}
    </div>
  );
}

function Branch({ q, showRepo }: { q: Quest; showRepo: boolean }) {
  const { openQuest, simple } = useHQ();
  const step = STEP_OF[q.stage] ?? 0;
  const merged = q.stage === "done";
  const xs = [52, 92, 132, 172];
  const color = q.stage === "bloque" ? "var(--bad)" : merged ? "var(--good)" : "var(--blue)";
  return (
    <button className={`branch ${merged ? "merged" : ""} stage-${q.stage}`} onClick={() => openQuest(q.id)}>
      <svg width="190" height="44" viewBox="0 0 190 44" aria-hidden>
        <line x1="10" y1="0" x2="10" y2="44" className="branch-trunk" />
        <path d={merged ? `M10 4 C 10 22, 30 22, 40 22 L 172 22 C 182 22, 186 14, 186 4` : "M10 4 C 10 22, 30 22, 40 22 L 186 22"} fill="none" stroke={color} strokeWidth="3" opacity={merged ? 0.6 : 1} />
        {xs.map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy="22"
            r={i + 1 === step && !merged ? 7 : 5}
            className={i + 1 < step || merged ? "ms-done" : i + 1 === step ? `ms-now ${q.stage === "bloque" ? "ms-blocked" : ""}` : "ms-todo"}
            style={i + 1 <= step || merged ? { fill: color } : undefined}
          />
        ))}
      </svg>
      <span className="branch-text">
        <strong>{q.title}</strong>
        <span className="small">
          {showRepo && <span className="muted">{repoName(q.repo)} · </span>}
          <span className={q.stage === "revue_humaine" ? "gold-text" : q.stage === "bloque" ? "bad-text" : "muted"}>{merged ? "Live" : statusText(q, simple)}</span>
          {!simple && q.pr && (
            <span className="muted">
              {" "}
              · <code>{q.pr.branch}</code> · #{q.pr.number}
              {q.pr.stats && (
                <>
                  {" "}
                  · <span className="add">+{q.pr.stats.additions}</span> <span className="del">−{q.pr.stats.deletions}</span>
                </>
              )}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
