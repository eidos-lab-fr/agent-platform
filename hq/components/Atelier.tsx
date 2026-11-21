"use client";

import { useMemo, useState } from "react";
import { worldToArcade } from "@/lib/arcade-adapter";
import { Arcade } from "./arcade/Arcade";
import { useHQ } from "./HQ";

/** The Workshop tab: Agent Arcade wired to the Agent HQ world. */
export function Atelier() {
  const { world, openQuest } = useHQ();
  const [filter, setFilter] = useState<string>("tous");
  const snapshot = useMemo(() => worldToArcade(world, filter === "tous" ? undefined : filter), [world, filter]);

  return (
    <div className="atelier">
      <div className="atelier-bar">
        <div className="chips">
          <button className={filter === "tous" ? "active" : ""} onClick={() => setFilter("tous")}>
            All islands
          </button>
          {world.repos.map((r) => (
            <button key={r.fullName} className={filter === r.fullName ? "active" : ""} onClick={() => setFilter(r.fullName)}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
      {world.repos.length === 0 ? (
        <p className="muted">No connected repo yet. Onboard one from the Archipelago tab.</p>
      ) : (
        <Arcade snapshot={snapshot} onSelect={openQuest} />
      )}
    </div>
  );
}
