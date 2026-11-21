"use client";

import { useState } from "react";
import { STAGE_LABELS, type Quest, type Stage } from "@/lib/types";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";
import { agentName, ago, repoName } from "./util";

const JOURNEY: Stage[] = ["backlog", "a_developper", "en_developpement", "pr_ouverte", "revue_humaine", "done"];

export function QuestPanel({ quest: q, onClose }: { quest: Quest; onClose: () => void }) {
  const { world, act, busy } = useHQ();
  const [text, setText] = useState("");
  const scopes = world.repos.find((r) => r.fullName === q.repo)?.scopes ?? [];
  const [scope, setScope] = useState(q.scope ?? scopes[0] ?? "general");
  const agents = world.agents.filter((a) => a.questId === q.id);
  const reached = JOURNEY.indexOf(q.stage === "bloque" ? "en_developpement" : q.stage);
  const canLaunch = ["backlog", "spec_prete", "spec_en_cours", "a_developper"].includes(q.stage) && agents.every((a) => a.role !== "dev" || a.activity === "failed");

  return (
    <aside className="panel" role="dialog" aria-label={q.title}>
      <header>
        <span className="muted">
          {repoName(q.repo)} #{q.number} · {STAGE_LABELS[q.stage]}
        </span>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <h2>{q.title}</h2>

      <ol className="journey">
        {JOURNEY.map((s, i) => (
          <li key={s} className={i < reached ? "past" : i === reached ? (q.stage === "bloque" ? "now blocked" : "now") : ""}>
            {STAGE_LABELS[s]}
          </li>
        ))}
      </ol>

      {agents.length > 0 && (
        <div className="panel-agents">
          {agents.map((a) => (
            <div key={a.id} className="panel-agent">
              <Sprite role={a.role} activity={a.activity} size={40} />
              <span>
                <strong>{agentName(a.role, a.scope)}</strong> · {a.step} · {ago(a.startedAt)}
                {a.runUrl && (
                  <>
                    {" "}
                    · <a href={a.runUrl} target="_blank" rel="noreferrer">see the run</a>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {q.stage === "bloque" && (
        <section className="panel-block">
          <h3>✋ The agent asks</h3>
          <blockquote>{q.question ?? "Read its latest comment on GitHub."}</blockquote>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={async () => (await act({ type: "answer", repo: q.repo, number: q.number, text })).ok && setText("")}
          >
            Answer and restart the agent
          </button>
        </section>
      )}

      {canLaunch && (
        <section className="panel-block">
          <h3>🚀 Hand to an agent</h3>
          <div className="row">
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s} desk
                </option>
              ))}
              <option value="general">general</option>
            </select>
            <button className="primary" disabled={busy} onClick={() => act({ type: "launch", repo: q.repo, number: q.number, scope })}>
              Launch
            </button>
          </div>
          <p className="muted small">Adds scope:{scope}, then ready-for-dev, with your account: the dev agent starts.</p>
        </section>
      )}

      {q.pr && (
        <section className="panel-block">
          <h3>📦 PR #{q.pr.number}</h3>
          <p>
            <a href={q.pr.url} target="_blank" rel="noreferrer">
              {q.pr.title}
            </a>{" "}
            · branch <code>{q.pr.branch}</code>
          </p>
          <p>
            Reviewer verdict:{" "}
            {q.pr.verdict === "ok" ? (
              <span className="badge ok">review:ok</span>
            ) : q.pr.verdict === "changes" ? (
              <span className="badge ko">review:changes</span>
            ) : (
              <span className="badge">pending</span>
            )}
          </p>
          {q.stage === "revue_humaine" && (
            <>
              <p className="muted small">
                Read the diff on GitHub before merging: a human always merges, and that human is you.{" "}
                <a href={`${q.pr.url}/files`} target="_blank" rel="noreferrer">
                  Open the diff
                </a>
              </p>
              <button className="gold-btn" disabled={busy} onClick={() => act({ type: "merge", repo: q.repo, prNumber: q.pr!.number })}>
                Merge and complete the quest
              </button>
            </>
          )}
        </section>
      )}

      {q.state === "open" && (
        <section className="panel-block">
          <h3>✨ Ask @claude</h3>
          <textarea rows={2} value={q.stage === "bloque" ? "" : text} onChange={(e) => setText(e.target.value)} placeholder="Fix the failing test on…" disabled={q.stage === "bloque"} />
          <button
            disabled={busy || !text.trim() || q.stage === "bloque"}
            onClick={async () =>
              (await act({ type: "claude", repo: q.repo, number: q.pr?.state === "open" ? q.pr.number : q.number, text })).ok && setText("")
            }
          >
            Send to {q.pr?.state === "open" ? `PR #${q.pr.number}` : "the issue"}
          </button>
        </section>
      )}

      <section className="panel-block">
        <h3>📜 Description</h3>
        <pre className="body">{q.body || "No description."}</pre>
        <a href={q.url} target="_blank" rel="noreferrer">
          Open on GitHub
        </a>
      </section>
    </aside>
  );
}
