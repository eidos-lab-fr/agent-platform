"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { teamOf } from "@/lib/board/engine";
import { DEMO_REPOS } from "@/lib/board/demo-seed";
import type { Card } from "@/lib/board/model";
import { TopBar } from "./TopBar";
import { slugOf, useBoard } from "./store";

const PALETTE = ["#4f8cff", "#2fbf71", "#a06cf0", "#f2c94c", "#ff9f43", "#ff5c6c", "#3dd6d0"];

function counts(cards: Card[]) {
  return {
    building: cards.filter((c) => c.column === "in_progress").length,
    toApprove: cards.filter((c) => c.column === "review").length,
    questions: cards.filter((c) => c.messages.some((m) => m.open)).length,
  };
}

/** My projects: one card per repo, plus All projects. Opens the last project directly. */
export function Home() {
  const { state, act, reset } = useBoard();
  const router = useRouter();
  const params = useSearchParams();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.get("home")) return;
    try {
      const last = localStorage.getItem("hq-last-project");
      if (last && !sessionStorage.getItem("hq-opened")) {
        sessionStorage.setItem("hq-opened", "1");
        router.replace(`/${last}`);
      }
    } catch {}
  }, [params, router]);

  const all = counts(state.cards);
  const addable = DEMO_REPOS.filter((r) => !state.projects.some((p) => p.id === r));

  return (
    <main className="page">
      <TopBar />
      <div className="home">
        <h1>My projects</h1>
        <div className="project-grid">
          <Link href="/all" className="project-card all">
            <span className="dot" style={{ background: "#8a8fa8" }} />
            <strong>All projects</strong>
            <Counts {...all} />
          </Link>
          {state.projects.map((p) => {
            const c = counts(state.cards.filter((x) => x.project === p.id));
            const team = teamOf(state, p.id);
            return (
              <Link key={p.id} href={`/${slugOf(p.id)}`} className="project-card" style={{ ["--c" as string]: p.color }}>
                <span className="dot" style={{ background: p.color }} />
                <strong>{p.name}</strong>
                <span className="muted small">
                  {team.name}{" "}
                  <span className="team-dots">
                    {team.agents.map((a) => (
                      <span key={a.id} className="dot" style={{ background: a.color }} />
                    ))}
                  </span>
                </span>
                <Counts {...c} />
              </Link>
            );
          })}
          <div className="project-card add">
            {!adding ? (
              <button className="ghost" onClick={() => setAdding(true)}>
                + Add a project
              </button>
            ) : (
              <>
                <strong>Add a project</strong>
                {!addable.length && <p className="muted small">Every repo is already here.</p>}
                {addable.map((r, i) => (
                  <button
                    key={r}
                    className="menu-item"
                    onClick={() => {
                      act({ type: "addProject", project: { id: r, name: r.split("/")[1], color: PALETTE[(state.projects.length + i) % PALETTE.length] } });
                      setAdding(false);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
        <p className="muted small home-foot">
          Demo: nothing is sent to GitHub. <button className="link" onClick={reset}>Reset the demo</button>
        </p>
      </div>
    </main>
  );
}

function Counts({ building, toApprove, questions }: { building: number; toApprove: number; questions: number }) {
  return (
    <span className="counts">
      <span>
        <b>{building}</b> in progress
      </span>
      <span className={toApprove ? "good" : ""}>
        <b>{toApprove}</b> to approve
      </span>
      <span className={questions ? "warn" : ""}>
        <b>{questions}</b> question{questions === 1 ? "" : "s"}
      </span>
    </span>
  );
}
