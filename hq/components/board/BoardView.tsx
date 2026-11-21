"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { teamOf } from "@/lib/board/engine";
import { COLUMNS, COLUMN_TEXT, ZONES, type Card, type Column } from "@/lib/board/model";
import { AgentLayer } from "./AgentLayer";
import { CardPanel } from "./CardPanel";
import { NewIdea } from "./NewIdea";
import { TopBar } from "./TopBar";
import { projectBySlug, slugOf, useBoard } from "./store";

export function BoardView({ slug }: { slug: string }) {
  const { state } = useBoard();
  const project = projectBySlug(state, slug);
  const [open, setOpen] = useState<{ card: string; worker?: string } | null>(null);
  const [newIdea, setNewIdea] = useState(false);
  const [showShipped, setShowShipped] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project && project.id !== "all") {
      try {
        localStorage.setItem("hq-last-project", slugOf(project.id));
      } catch {}
    }
  }, [project]);

  if (!project) {
    return (
      <main className="page">
        <TopBar />
        <p className="empty">
          No project called “{slug}”. <Link href="/?home=1">See my projects</Link>
        </p>
      </main>
    );
  }

  const all = project.id === "all";
  const cards = state.cards.filter((c) => all || c.project === project.id);
  const shipped = cards.filter((c) => c.column === "done");
  const card = open ? state.cards.find((c) => c.id === open.card) : undefined;

  return (
    <main className="page board-page">
      <TopBar project={project.id} onNewIdea={() => setNewIdea(true)} />
      <div className="board" ref={boardRef}>
        {COLUMNS.map((col) => {
          const items = cards.filter((c) => c.column === col).sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <section key={col} className={`column col-${col}`}>
              <h2 title={COLUMN_TEXT[col].hint}>
                {COLUMN_TEXT[col].name} <span className="count">{items.length}</span>
              </h2>
              <p className="col-hint">{COLUMN_TEXT[col].hint}</p>
              <div className="cards">
                {items.map((c) => (
                  <CardTile key={c.id} card={c} showProject={all} onOpen={() => setOpen({ card: c.id })} />
                ))}
                {col === "idea" && !all && (
                  <button className="add-card" onClick={() => setNewIdea(true)}>
                    + New idea
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <footer className="board-foot">
        <button className="ghost small" onClick={() => setShowShipped(!showShipped)}>
          {shipped.length} shipped {showShipped ? "▴" : "▾"}
        </button>
        {showShipped && (
          <ul className="shipped">
            {shipped.map((c) => (
              <li key={c.id}>
                <button className="link" onClick={() => setOpen({ card: c.id })}>
                  #{c.number} {c.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </footer>
      <AgentLayer cards={cards} onOpen={(cardId, worker) => setOpen({ card: cardId, worker })} />
      {card && <CardPanel card={card} workerId={open?.worker} onClose={() => setOpen(null)} />}
      {newIdea && <NewIdea project={all ? state.projects[0]?.id : project.id} onClose={() => setNewIdea(false)} />}
    </main>
  );
}

function statusLine(card: Card, cards: Card[]): { text: string; tone: "" | "good" | "bad" | "warn" } {
  const blocker = (id: string) => cards.find((c) => c.id === id);
  switch (card.column) {
    case "idea":
      return card.spec ? { text: "Spec drafted: approve it", tone: "warn" } : { text: "Needs a spec", tone: "" };
    case "specified":
      return { text: "Ready for the planner", tone: "" };
    case "planned":
    case "waiting": {
      const v = card.plan?.verdict;
      if (card.plan?.override === "hold") return { text: "On hold", tone: "warn" };
      if (card.plan?.override === "force") return { text: "Forced to run in parallel", tone: "warn" };
      if (!v) return { text: "", tone: "" };
      if (v.parallel) return { text: card.column === "planned" ? "✓ Can run in parallel" : "Starting…", tone: "good" };
      const b = v.blockedBy ? blocker(v.blockedBy) : undefined;
      return { text: b ? `⛔ Waits for #${b.number}` : `⛔ ${v.reason}`, tone: "bad" };
    }
    case "in_progress": {
      if (card.messages.some((m) => m.open)) return { text: "✋ Has a question for you", tone: "warn" };
      if (card.live) return { text: card.live.text, tone: card.live.failed ? "bad" : "" };
      const steps = card.plan?.steps ?? [];
      return { text: `${steps.filter((s) => s.status === "done").length}/${steps.length} steps`, tone: "" };
    }
    case "review":
      if (card.pr?.verdict === "changes") return { text: "Reviewers asked for changes", tone: "warn" };
      if (card.pr && card.pr.verdict !== "ok") return { text: "Reviewers at work", tone: "" };
      return { text: card.change ? `+${card.change.additions} −${card.change.deletions} · ${card.change.files} files` : "Ready", tone: "good" };
    default:
      return { text: "", tone: "" };
  }
}

function CardTile({ card, showProject, onOpen }: { card: Card; showProject: boolean; onOpen: () => void }) {
  const { state } = useBoard();
  const status = statusLine(card, state.cards);
  const project = state.projects.find((p) => p.id === card.project);
  const asking = card.messages.some((m) => m.open);
  const colors = card.zones.map((z) => ZONES[z].color);
  const team = teamOf(state, card.project);
  const reviewers = team.agents.filter((a) => a.kind === "reviewer");
  return (
    <button
      className={`card ${asking ? "asking" : ""}`}
      data-card={card.id}
      onClick={onOpen}
      style={{ ["--stripe" as string]: colors.length > 1 ? `linear-gradient(${colors.join(", ")})` : colors[0] }}
    >
      <span className="card-top">
        {showProject && project && (
          <span className="proj">
            <span className="dot" style={{ background: project.color }} />
            {project.name}
          </span>
        )}
        <span className="num">#{card.number}</span>
        <span className="zones">
          {card.zones.map((z) => (
            <span key={z} className="zone-chip" style={{ background: ZONES[z].color }} title={ZONES[z].name} />
          ))}
        </span>
      </span>
      <strong className="card-title">{card.title}</strong>
      {card.column === "in_progress" && card.plan && (
        <span className="progress">
          {card.plan.steps.map((s) => (
            <i key={s.id} className={s.status} style={s.status !== "todo" ? { background: ZONES[s.zone].color } : undefined} />
          ))}
        </span>
      )}
      <span className={`status ${status.tone}`}>{status.text}</span>
      {card.column === "in_progress" && <span className="seats" aria-hidden />}
      {card.column === "review" && card.pr && card.pr.reviews.length > 0 && (
        <span className="reviewers">
          {card.pr.reviews.map((r) => (
            <span key={r.role} className={`rv ${r.result}`}>
              {r.role} {r.result === "passed" ? "✓" : r.result === "failed" ? "✕" : "…"}
            </span>
          ))}
        </span>
      )}
      {card.column === "review" && !card.pr && reviewers.length > 0 && (
        <span className="reviewers">
          {reviewers.map((r) => (
            <span key={r.id} className="rv" style={{ borderColor: r.color }}>
              {r.icon} {r.name} ✓
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

export type { Column };
