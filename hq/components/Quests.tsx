"use client";

import { useState } from "react";
import { STAGES, type Stage } from "@/lib/types";
import { Forge } from "./Forge";
import { useHQ } from "./HQ";
import { ago, repoName } from "./util";
import { stageText, word } from "./words";

// The board as a path, Blocked on the side.
const PATH: Stage[] = STAGES.filter((s) => s !== "bloque");

export function Quests() {
  const { world, openQuest, simple } = useHQ();
  const [repo, setRepo] = useState("tous");
  const [forge, setForge] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const quests = world.quests.filter((q) => repo === "tous" || q.repo === repo);
  const cols: Stage[] = [...PATH.filter((s) => s !== "done" || showDone), "bloque"];

  return (
    <div className="quests">
      <div className="atelier-bar">
        <div className="chips">
          <button className={repo === "tous" ? "active" : ""} onClick={() => setRepo("tous")}>
            {word("allRepos", simple)}
          </button>
          {world.repos.map((r) => (
            <button key={r.fullName} className={repo === r.fullName ? "active" : ""} onClick={() => setRepo(r.fullName)}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="chips">
          <label className="muted small check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> completed
          </label>
          <button className="primary" onClick={() => setForge(true)}>
            {word("newQuest", simple)}
          </button>
        </div>
      </div>

      <div className="board">
        {cols.map((stage) => {
          const items = quests.filter((q) => q.stage === stage);
          return (
            <section key={stage} className={`lane lane-${stage}`}>
              <h3>
                {stageText(stage, simple)} <span className="muted">{items.length}</span>
              </h3>
              {items.map((q) => (
                <button key={q.id} className="quest-card" onClick={() => openQuest(q.id)}>
                  <span className="quest-repo">
                    {repoName(q.repo)} <span className="num">#{q.number}</span>
                    {q.scope && <span className="tag">{q.scope}</span>}
                  </span>
                  <strong>{q.title}</strong>
                  <span className="muted small">updated {ago(q.updatedAt)} ago</span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      {forge && <Forge onClose={() => setForge(false)} defaultRepo={repo !== "tous" ? repo : undefined} />}
    </div>
  );
}
