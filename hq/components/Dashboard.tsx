"use client";

import { useState } from "react";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";
import { agentName, ago, repoName } from "./util";
import { word } from "./words";

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

/**
 * Home. Simple mode keeps only what waits for you (answer, approve) and what is being built;
 * Dev mode adds achievements and the activity feed.
 */
export function Dashboard({ onWorkshop }: { onWorkshop: () => void }) {
  const { world, act, openQuest, busy, simple } = useHQ();
  const w = (k: Parameters<typeof word>[0]) => word(k, simple);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const working = world.agents.filter((a) => ["working", "reviewing", "preparing", "queued"].includes(a.activity));
  const blocked = world.quests.filter((q) => q.stage === "bloque");
  const toMerge = world.quests.filter((q) => q.stage === "revue_humaine");
  const p = world.progress;

  return (
    <div className="dashboard">
      <section className="tiles">
        <div className={`tile ${blocked.length ? "alert" : ""}`}>
          <span className="tile-value">{blocked.length}</span>
          <span className="tile-label">{w("blockedTile")}</span>
        </div>
        <div className={`tile ${toMerge.length ? "gold" : ""}`}>
          <span className="tile-value">{toMerge.length}</span>
          <span className="tile-label">{w("toMergeTile")}</span>
        </div>
        <button className="tile" onClick={onWorkshop} title="Watch the agents work">
          <span className="tile-value">{working.length}</span>
          <span className="tile-label">{w("atWorkTile")} ▸</span>
        </button>
        <div className="tile">
          <span className="tile-value">{p.merged}</span>
          <span className="tile-label">{w("completedTile")}</span>
        </div>
        {!simple && (
          <div className="tile">
            <span className="tile-value">{p.streakDays} 🔥</span>
            <span className="tile-label">day streak</span>
          </div>
        )}
      </section>

      <div className={`columns ${simple ? "single" : ""}`}>
        <div className="col">
          <section className="card">
            <h2>{w("blocked")}</h2>
            {blocked.length === 0 && <p className="muted">{w("blockedEmpty")}</p>}
            {blocked.map((q) => (
              <div key={q.id} className="question">
                <div className="question-head">
                  <Sprite role="dev" activity="blocked" size={36} />
                  <button className="link" onClick={() => openQuest(q.id)}>
                    {repoName(q.repo)}
                    {!simple && ` #${q.number}`} · {q.title}
                  </button>
                </div>
                <blockquote>{q.question ?? "The agent added needs-human. Read its comment on GitHub."}</blockquote>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act({ type: "answer", repo: q.repo, number: q.number, text: answers[q.id] ?? "" });
                    if (r.ok) setAnswers({ ...answers, [q.id]: "" });
                  }}
                >
                  <textarea
                    placeholder="Your answer: it is added to the issue and the agent restarts"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    rows={2}
                  />
                  <button disabled={busy || !(answers[q.id] ?? "").trim()}>Answer and restart</button>
                </form>
              </div>
            ))}
          </section>

          <section className="card">
            <h2>{w("toMerge")}</h2>
            {toMerge.length === 0 && <p className="muted">{w("toMergeEmpty")}</p>}
            {toMerge.map((q) => (
              <div key={q.id} className="parcel">
                <span>📦</span>
                <button className="link" onClick={() => openQuest(q.id)}>
                  {repoName(q.repo)}
                  {!simple && ` · PR #${q.pr?.number}`} · {q.title}
                </button>
                <span className="badge ok">{w("approved")}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>{w("atWork")}</h2>
            {working.length === 0 && <p className="muted">{w("atWorkEmpty")}</p>}
            <ul className="workers">
              {working.map((a) => (
                <li key={a.id} onClick={() => a.questId && openQuest(a.questId)} className={a.questId ? "clickable" : ""}>
                  <Sprite role={a.role} activity={a.activity} size={40} />
                  <div>
                    <strong>{a.questTitle ?? "No quest"}</strong>
                    <span className="muted">
                      {repoName(a.repo)} · {agentName(a.role, a.scope)} · {a.step} · {ago(a.startedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {working.length > 0 && (
              <button className="ghost small" onClick={onWorkshop}>
                Watch them work ▸
              </button>
            )}
          </section>
        </div>

        {!simple && (
          <div className="col">
            <section className="card">
              <h2>Achievements</h2>
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
                {p.xp} XP · 100 per completed quest, +50 if the PR passes review on the first try, +10 per quest created.
              </p>
            </section>

            <section className="card">
              <h2>Activity feed</h2>
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
        )}
      </div>
    </div>
  );
}
