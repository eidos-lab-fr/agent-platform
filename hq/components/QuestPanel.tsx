"use client";

import { useState } from "react";
import { STAGE_LABELS, type Quest, type Stage } from "@/lib/types";
import { useHQ } from "./HQ";
import { Sprite } from "./Sprite";
import { ago, repoName } from "./util";

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
        <button className="ghost" onClick={onClose} aria-label="Fermer">
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
                <strong>{a.role === "dev" ? `Dev ${a.scope}` : a.role}</strong> · {a.step} · {ago(a.startedAt)}
                {a.runUrl && (
                  <>
                    {" "}
                    · <a href={a.runUrl} target="_blank" rel="noreferrer">voir le run</a>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {q.stage === "bloque" && (
        <section className="panel-block">
          <h3>✋ L'agent te demande</h3>
          <blockquote>{q.question ?? "Lis son dernier commentaire sur GitHub."}</blockquote>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ta réponse" />
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={async () => (await act({ type: "answer", repo: q.repo, number: q.number, text })).ok && setText("")}
          >
            Répondre et relancer l'agent
          </button>
        </section>
      )}

      {canLaunch && (
        <section className="panel-block">
          <h3>🚀 Confier à un agent</h3>
          <div className="row">
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  bureau {s}
                </option>
              ))}
              <option value="general">général</option>
            </select>
            <button className="primary" disabled={busy} onClick={() => act({ type: "launch", repo: q.repo, number: q.number, scope })}>
              Lancer
            </button>
          </div>
          <p className="muted small">Pose scope:{scope} puis ready-for-dev avec ton compte : l'agent dev démarre.</p>
        </section>
      )}

      {q.pr && (
        <section className="panel-block">
          <h3>📦 PR #{q.pr.number}</h3>
          <p>
            <a href={q.pr.url} target="_blank" rel="noreferrer">
              {q.pr.title}
            </a>{" "}
            · branche <code>{q.pr.branch}</code>
          </p>
          <p>
            Verdict des relecteurs :{" "}
            {q.pr.verdict === "ok" ? (
              <span className="badge ok">review:ok</span>
            ) : q.pr.verdict === "changes" ? (
              <span className="badge ko">review:changes</span>
            ) : (
              <span className="badge">en attente</span>
            )}
          </p>
          {q.stage === "revue_humaine" && (
            <>
              <p className="muted small">
                Relis le diff sur GitHub avant de merger : un humain merge toujours, et c'est toi.{" "}
                <a href={`${q.pr.url}/files`} target="_blank" rel="noreferrer">
                  Ouvrir le diff
                </a>
              </p>
              <button className="gold-btn" disabled={busy} onClick={() => act({ type: "merge", repo: q.repo, prNumber: q.pr!.number })}>
                Merger et livrer la quête
              </button>
            </>
          )}
        </section>
      )}

      {q.state === "open" && (
        <section className="panel-block">
          <h3>✨ Demander à @claude</h3>
          <textarea rows={2} value={q.stage === "bloque" ? "" : text} onChange={(e) => setText(e.target.value)} placeholder="Corrige le test qui échoue sur…" disabled={q.stage === "bloque"} />
          <button
            disabled={busy || !text.trim() || q.stage === "bloque"}
            onClick={async () =>
              (await act({ type: "claude", repo: q.repo, number: q.pr?.state === "open" ? q.pr.number : q.number, text })).ok && setText("")
            }
          >
            Envoyer sur {q.pr?.state === "open" ? `la PR #${q.pr.number}` : "le ticket"}
          </button>
        </section>
      )}

      <section className="panel-block">
        <h3>📜 Description</h3>
        <pre className="body">{q.body || "Pas de description."}</pre>
        <a href={q.url} target="_blank" rel="noreferrer">
          Ouvrir sur GitHub
        </a>
      </section>
    </aside>
  );
}
