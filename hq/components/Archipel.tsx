"use client";

import { useState } from "react";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";

export function Archipel() {
  const { world, act, busy } = useHQ();
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
                <h2>🏝️ {r.name}</h2>
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
                        <span className="card-level">Niv. {level}</span>
                      </div>
                      <h3>Dev {s}</h3>
                      <dl>
                        <dt>Quêtes livrées</dt>
                        <dd>{mine.length}</dd>
                        <dt>Du premier coup</dt>
                        <dd>{mine.length ? `${Math.round((firstTry / mine.length) * 100)} %` : "—"}</dd>
                        <dt>Ticket → PR</dt>
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
          <h2>🌫️ Île inconnue</h2>
          <p className="muted">
            Brancher un nouveau repo lance le workflow « Onboarder un repo » d'agent-platform : labels, secrets, board, puis une PR
            de configuration à merger.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await act({ type: "onboard", repo: name.trim() })).ok) setName("");
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nom-du-repo (sans l'org)" />
            <button className="primary" disabled={busy || !name.trim()}>
              Explorer l'île
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
