"use client";

import { useState } from "react";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";
import { word } from "./words";

export function Archipel() {
  const { world, act, busy, simple } = useHQ();
  const w = (k: Parameters<typeof word>[0]) => word(k, simple);
  const [name, setName] = useState("");

  return (
    <div className="archipel">
      <div className="islands">
        {world.repos.map((r) => {
          const quests = world.quests.filter((q) => q.repo === r.fullName);
          const merged = quests.filter((q) => q.pr?.state === "merged");
          const scopes = [...(r.scopes.length ? r.scopes : []), "general"];
          return (
            <section key={r.fullName} className="island">
              <header>
                <h2>{simple ? "" : "🏝️ "}{r.name}</h2>
                <a href={r.url} target="_blank" rel="noreferrer" className="muted small">
                  {r.fullName}
                </a>
              </header>
              <div className="agent-cards">
                {scopes.map((s) => {
                  const mine = merged.filter((q) => (q.scope ?? "general") === s);
                  const firstTry = mine.filter((q) => q.pr?.verdict === "ok").length;
                  const delays = mine.map((q) => Date.parse(q.pr!.createdAt) - Date.parse(q.createdAt)).filter((d) => d > 0);
                  const avg = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
                  const level = 1 + Math.floor(mine.length / 3);
                  return (
                    <article key={s} className="agent-card">
                      <div className="agent-card-top">
                        <Sprite role="dev" activity={mine.length ? "working" : "idle"} size={56} />
                        {!simple && <span className="card-level">Lvl {level}</span>}
                      </div>
                      <h3>{simple ? (s === "general" ? "Builder" : `Builder · ${s}`) : `Dev ${s}`}</h3>
                      <dl>
                        <dt>{simple ? "Shipped" : "Quests completed"}</dt>
                        <dd>{mine.length}</dd>
                        <dt>First try</dt>
                        <dd>{mine.length ? `${Math.round((firstTry / mine.length) * 100)} %` : "—"}</dd>
                        <dt>{simple ? "Time to first version" : "Issue → PR"}</dt>
                        <dd>{avg ? `${Math.round(avg / 3_600_000)} h` : "—"}</dd>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section className="island fog">
          <h2>{w("connect")}</h2>
          <p className="muted">{w("connectHint")}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await act({ type: "onboard", repo: name.trim() })).ok) setName("");
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={w("repoPlaceholder")} />
            <button className="primary" disabled={busy || !name.trim()}>
              {w("connectButton")}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
