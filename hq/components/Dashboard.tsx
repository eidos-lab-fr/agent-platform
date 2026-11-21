"use client";

import { useState } from "react";
import { STAGE_LABELS } from "@/lib/types";
import { useHQ } from "./HQ";
import { Sprite } from "./Sprite";
import { ago, repoName } from "./util";

const KIND_ICON: Record<string, string> = {
  quest: "📜",
  launch: "🚀",
  pr: "📦",
  review: "🔍",
  blocked: "✋",
  merged: "🏆",
  failed: "💥",
  claude: "✨",
};

export function Dashboard({ onTab }: { onTab: (t: string) => void }) {
  const { world, act, openQuest, busy } = useHQ();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const working = world.agents.filter((a) => ["working", "reviewing", "preparing", "queued"].includes(a.activity));
  const blocked = world.quests.filter((q) => q.stage === "bloque");
  const toMerge = world.quests.filter((q) => q.stage === "revue_humaine");
  const p = world.progress;

  return (
    <div className="dashboard">
      <section className="tiles">
        <button className="tile" onClick={() => onTab("atelier")}>
          <span className="tile-value">{working.length}</span>
          <span className="tile-label">agents au travail</span>
        </button>
        <div className={`tile ${blocked.length ? "alert" : ""}`}>
          <span className="tile-value">{blocked.length}</span>
          <span className="tile-label">mains levées</span>
        </div>
        <div className={`tile ${toMerge.length ? "gold" : ""}`}>
          <span className="tile-value">{toMerge.length}</span>
          <span className="tile-label">colis à merger</span>
        </div>
        <div className="tile">
          <span className="tile-value">{p.merged}</span>
          <span className="tile-label">quêtes livrées (60 j)</span>
        </div>
        <div className="tile">
          <span className="tile-value">{p.streakDays} 🔥</span>
          <span className="tile-label">jours de série</span>
        </div>
      </section>

      <div className="columns">
        <div className="col">
          <section className="card">
            <h2>Au travail en ce moment</h2>
            {working.length === 0 && <p className="muted">Tout le monde dort. Confie une quête depuis l'onglet Quêtes.</p>}
            <ul className="workers">
              {working.map((a) => (
                <li key={a.id} onClick={() => a.questId && openQuest(a.questId)} className={a.questId ? "clickable" : ""}>
                  <Sprite role={a.role} activity={a.activity} size={40} />
                  <div>
                    <strong>{a.questTitle ?? "Sans quête"}</strong>
                    <span className="muted">
                      {repoName(a.repo)} · {a.role === "dev" ? `dev ${a.scope}` : a.role} · {a.step} · {ago(a.startedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Mains levées</h2>
            {blocked.length === 0 && <p className="muted">Aucun agent ne t'attend.</p>}
            {blocked.map((q) => (
              <div key={q.id} className="question">
                <div className="question-head">
                  <Sprite role="dev" activity="blocked" size={36} />
                  <button className="link" onClick={() => openQuest(q.id)}>
                    {repoName(q.repo)} #{q.number} · {q.title}
                  </button>
                </div>
                <blockquote>{q.question ?? "L'agent a posé needs-human. Lis son commentaire sur GitHub."}</blockquote>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act({ type: "answer", repo: q.repo, number: q.number, text: answers[q.id] ?? "" });
                    if (r.ok) setAnswers({ ...answers, [q.id]: "" });
                  }}
                >
                  <textarea
                    placeholder="Ta réponse : elle est ajoutée au ticket et l'agent repart"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    rows={2}
                  />
                  <button disabled={busy || !(answers[q.id] ?? "").trim()}>Répondre et relancer</button>
                </form>
              </div>
            ))}
          </section>

          <section className="card">
            <h2>Colis à la porte</h2>
            {toMerge.length === 0 && <p className="muted">Aucune PR validée par les relecteurs pour l'instant.</p>}
            {toMerge.map((q) => (
              <div key={q.id} className="parcel">
                <span>📦</span>
                <button className="link" onClick={() => openQuest(q.id)}>
                  {repoName(q.repo)} · PR #{q.pr?.number} · {q.title}
                </button>
                <span className="badge ok">review:ok</span>
              </div>
            ))}
          </section>
        </div>

        <div className="col">
          <section className="card">
            <h2>Succès</h2>
            <ul className="achievements">
              {p.achievements.map((a) => (
                <li key={a.id} className={a.unlocked ? "unlocked" : ""} title={a.description}>
                  <span className="trophy">{a.unlocked ? "🏆" : "🔒"}</span>
                  <div>
                    <strong>{a.name}</strong>
                    <span className="muted">{a.description}</span>
                    {!a.unlocked && (
                      <span className="progress">
                        <span style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">
              {p.xp} XP · 100 par quête livrée, +50 si la PR passe les relecteurs du premier coup, +10 par quête créée.
            </p>
          </section>

          <section className="card">
            <h2>Fil d'activité</h2>
            <ul className="feed">
              {world.activity.slice(0, 25).map((e) => (
                <li key={e.id}>
                  <span className="feed-icon">{KIND_ICON[e.kind]}</span>
                  <span className="feed-text">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        {e.text}
                      </a>
                    ) : (
                      e.text
                    )}
                  </span>
                  <span className="muted feed-time">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <p className="muted small legend">Colonnes suivies : {Object.values(STAGE_LABELS).join(" → ")}</p>
    </div>
  );
}
