"use client";

import { useState } from "react";
import { teamOf } from "@/lib/board/engine";
import { COLUMN_TEXT, MAX_CLONES, ZONES, ZONE_IDS, type Card, type Spec } from "@/lib/board/model";
import { PROVIDER_TEXT } from "@/lib/ai-names";
import { Avatar } from "./Avatar";
import { useBoard } from "./store";

/** Everything about a card, or about one agent on it when opened from its avatar. */
export function CardPanel({ card, workerId, onClose }: { card: Card; workerId?: string; onClose: () => void }) {
  const { state, act, demo } = useBoard();
  const team = teamOf(state, card.project);
  const worker = card.workers.find((w) => w.id === workerId);
  const agent = worker ? team.agents.find((a) => a.id === worker.agentId) : undefined;
  const open = card.messages.find((m) => m.open);
  const [reply, setReply] = useState("");
  const [change, setChange] = useState("");
  const steps = (card.plan?.steps ?? []).filter((s) => !worker || s.zone === worker.zone);
  const blocker = card.plan && !card.plan.verdict.parallel && card.plan.verdict.blockedBy ? state.cards.find((c) => c.id === (card.plan!.verdict as { blockedBy: string }).blockedBy) : undefined;

  return (
    <aside className="panel" role="dialog" aria-label={card.title}>
      <header>
        <span className="muted small">
          #{card.number} · {COLUMN_TEXT[card.column].name}
          {card.url && (
            <>
              {" · "}
              <a href={card.url} target="_blank" rel="noreferrer">
                issue on GitHub
              </a>
            </>
          )}
        </span>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      {worker && agent && (
        <section className="agent-head">
          <Avatar color={agent.color} icon={agent.icon} size={52} clone={worker.clone} mood={open ? "asking" : "working"} />
          <div>
            <h2>
              {agent.name}
              {worker.clone > 1 ? ` #${worker.clone}` : ""}
            </h2>
            <p className="muted small">
              {agent.specialty} · clone {worker.clone} of {MAX_CLONES} max, same skills and rules as the others
            </p>
            <p className="small">
              Branch <code>{worker.branch}</code> · zone <ZoneChip zone={worker.zone} />
            </p>
          </div>
        </section>
      )}

      <h2 className="panel-title">{card.title}</h2>
      <p className="need">{card.need}</p>

      <section className="block">
        <h3>Zones</h3>
        <div className="zone-row">
          {(card.column === "idea" || card.column === "specified" ? ZONE_IDS : card.zones).map((z) => {
            const on = card.zones.includes(z);
            const editable = card.column === "idea" || card.column === "specified";
            return (
              <button
                key={z}
                className={`zone-toggle ${on ? "on" : ""}`}
                style={{ ["--c" as string]: ZONES[z].color }}
                disabled={!editable}
                onClick={() => act({ type: "setZones", id: card.id, zones: on ? card.zones.filter((x) => x !== z) : [...card.zones, z] })}
              >
                {ZONES[z].name}
              </button>
            );
          })}
        </div>
        {(card.column === "idea" || card.column === "specified") && <p className="muted small">Guessed from your words. Click to correct.</p>}
      </section>

      {!worker && <SpecBlock card={card} />}

      {card.column === "specified" && (
        <section className="block">
          <h3>Plan</h3>
          <p className="muted small">The planner reads the spec, lists the files each zone will touch and checks what can run at the same time.</p>
          <button className="primary" onClick={() => act({ type: "plan", id: card.id })}>
            Send to the planner
          </button>
        </section>
      )}

      {card.plan && (
        <section className="block">
          <h3>{worker ? "What it does" : "Development plan"}</h3>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.id} className={s.status}>
                <span className="step-dot" style={{ background: s.status === "todo" ? undefined : ZONES[s.zone].color, borderColor: ZONES[s.zone].color }} />
                {s.text}
                <span className="muted small">{s.status === "done" ? "done" : s.status === "doing" ? (open ? "paused" : "in progress") : "to do"}</span>
              </li>
            ))}
          </ol>
          {!worker && (
            <details>
              <summary className="muted small">Files touched</summary>
              <ul className="files">
                {Object.entries(card.plan.files).map(([z, fs]) =>
                  fs.map((f) => (
                    <li key={f}>
                      <span className="dot" style={{ background: ZONES[z as keyof typeof ZONES].color }} /> <code>{f}</code>
                    </li>
                  )),
                )}
              </ul>
            </details>
          )}
          {(card.column === "planned" || card.column === "waiting") && (
            <div className={`verdict ${card.plan.verdict.parallel ? "good" : "bad"}`}>
              {card.plan.verdict.parallel ? (
                <>✓ Can run in parallel with the work in progress.</>
              ) : (
                <>
                  ⛔ {blocker ? `Waits for #${blocker.number} “${blocker.title}”: ` : ""}
                  {card.plan.verdict.reason}
                </>
              )}
            </div>
          )}
          {card.column === "planned" && (
            <button className="primary" onClick={() => act({ type: "launch", id: card.id })}>
              {card.plan.verdict.parallel ? "Launch" : "Launch when free"}
            </button>
          )}
          {(card.column === "planned" || card.column === "waiting") && (
            <div className="row small">
              <span className="muted">Override:</span>
              <button className={`ghost small ${card.plan.override === "force" ? "on" : ""}`} onClick={() => act({ type: "override", id: card.id, value: card.plan!.override === "force" ? null : "force" })}>
                Run in parallel anyway
              </button>
              <button className={`ghost small ${card.plan.override === "hold" ? "on" : ""}`} onClick={() => act({ type: "override", id: card.id, value: card.plan!.override === "hold" ? null : "hold" })}>
                Hold
              </button>
            </div>
          )}
        </section>
      )}

      {card.live && (
        <p className={`live small ${card.live.failed ? "status bad" : ""}`}>
          <span className="live-dot" /> {card.live.text}
          {card.live.url && (
            <>
              {" · "}
              <a href={card.live.url} target="_blank" rel="noreferrer">
                {card.live.url.includes("/actions/") ? "watch the run" : "open on GitHub"}
              </a>
            </>
          )}
        </p>
      )}

      {card.column === "in_progress" && !worker && (
        <section className="block">
          <h3>Agents on it</h3>
          <ul className="workers">
            {card.workers.map((w) => {
              const a = team.agents.find((x) => x.id === w.agentId);
              return (
                <li key={w.id}>
                  {a && <Avatar color={a.color} icon={a.icon} size={26} clone={w.clone} mood="working" />} {a?.name}
                  {w.clone > 1 ? ` #${w.clone}` : ""} <span className="muted small">on {ZONES[w.zone].name}, branch {w.branch}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(card.column === "in_progress" || card.messages.length > 0) && (
        <section className="block">
          <h3>Conversation</h3>
          {!card.messages.length && <p className="muted small">No message yet. Ask the agents anything about their work.</p>}
          <ul className="messages">
            {card.messages.map((m) => {
              const a = m.agentId ? team.agents.find((x) => x.id === m.agentId) : undefined;
              return (
                <li key={m.id} className={`msg ${m.from} ${m.open ? "open" : ""}`}>
                  {m.from === "agent" && a ? <Avatar color={a.color} icon={a.icon} size={22} /> : <span className="you">You</span>}
                  <span>{m.text}</span>
                </li>
              );
            })}
          </ul>
          {card.column === "in_progress" && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) return;
                act(open ? { type: "answer", id: card.id, text: reply } : { type: "ask", id: card.id, text: reply });
                setReply("");
              }}
            >
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={open ? "Your answer: the agent resumes right after" : demo ? "Ask the agents a question" : "Leave a note on the issue: the agent reads it when it starts"} autoFocus={Boolean(open)} />
              <button className={open ? "primary" : ""} disabled={!reply.trim()}>
                {open ? "Answer" : "Ask"}
              </button>
            </form>
          )}
        </section>
      )}

      {card.column === "review" && (
        <section className="block">
          <h3>The change</h3>
          {card.change && (
            <p className="small">
              {card.change.files} files · <span className="add">+{card.change.additions}</span> <span className="del">−{card.change.deletions}</span>
            </p>
          )}
          {card.pr ? (
            <>
              <p className="small">
                <a href={card.pr.url} target="_blank" rel="noreferrer">
                  Pull request #{card.pr.number}
                </a>
                {card.pr.reviews.map((r) => (
                  <span key={r.role} className={`rv ${r.result}`}>
                    {r.role} {r.result === "passed" ? "✓" : r.result === "failed" ? "✕" : "…"}
                  </span>
                ))}
              </p>
              <p className="muted small">
                {card.pr.verdict === "ok"
                  ? "The reviewers approved it. Have a look, then ship it: HQ merges the pull request."
                  : card.pr.verdict === "changes"
                    ? "The reviewers asked for changes. Ask for a change, or wait for the fix."
                    : "The reviewers are still checking it."}
              </p>
            </>
          ) : (
            <p className="muted small">The reviewers of the team approved it. Have a look, then ship it.</p>
          )}
          <button className="primary" disabled={Boolean(card.pr && card.pr.verdict !== "ok")} onClick={() => act({ type: "ship", id: card.id })}>
            Approve and ship
          </button>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!change.trim()) return;
              act({ type: "requestChange", id: card.id, text: change });
              setChange("");
            }}
          >
            <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Something to change? Say it in your words" />
            <button disabled={!change.trim()}>Ask for a change</button>
          </form>
        </section>
      )}

      {(card.column === "idea" || card.column === "specified") && !worker && (
        <footer className="panel-foot">
          <button
            className="ghost small danger"
            onClick={() => {
              act({ type: "delete", id: card.id });
              onClose();
            }}
          >
            Delete this card
          </button>
        </footer>
      )}
    </aside>
  );
}

function ZoneChip({ zone }: { zone: keyof typeof ZONES }) {
  return (
    <span className="zone-inline" style={{ ["--c" as string]: ZONES[zone].color }}>
      {ZONES[zone].name}
    </span>
  );
}

/** Ideas get a spec written by the AI (local model first), which you edit and approve. */
function SpecBlock({ card }: { card: Card }) {
  const { act } = useBoard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<string | null>(null);
  const spec = card.spec;

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `${card.title}. ${card.need}`, repo: card.project, scopes: [] }),
      });
      const r = (await res.json()) as { ok: boolean; message: string; draft?: { title: string; summary: string; criteres: string[]; horsPerimetre: string; engine: Spec["engine"] } };
      if (!r.ok || !r.draft) throw new Error(r.message || "The spec could not be written.");
      act({ type: "setSpec", id: card.id, title: r.draft.title, spec: { summary: r.draft.summary || card.need, criteria: r.draft.criteres, outOfScope: r.draft.horsPerimetre, engine: r.draft.engine } });
      setCriteria(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (card.column !== "idea" && !spec) return null;
  return (
    <section className="block">
      <h3>Spec</h3>
      {!spec && (
        <>
          <p className="muted small">The AI turns your words into a spec the agents can work from: acceptance criteria and what is out of scope.</p>
          <button className="primary" disabled={busy} onClick={write}>
            {busy ? "Writing…" : "✨ Write the spec"}
          </button>
        </>
      )}
      {spec && (
        <>
          <p>{spec.summary}</p>
          {card.column === "idea" ? (
            <label className="small">
              Done when… (one per line)
              <textarea
                rows={Math.max(3, spec.criteria.length + 1)}
                value={criteria ?? spec.criteria.join("\n")}
                onChange={(e) => setCriteria(e.target.value)}
                onBlur={() => criteria !== null && act({ type: "setSpec", id: card.id, spec: { ...spec, criteria: criteria.split("\n").map((l) => l.trim()).filter(Boolean) } })}
              />
            </label>
          ) : (
            <ul className="criteria">
              {spec.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {spec.outOfScope && <p className="muted small">Not part of it: {spec.outOfScope}</p>}
          <p className="muted small">{spec.engine === "rules" ? "Structured without AI" : `Written with ${PROVIDER_TEXT[spec.engine].name}`}</p>
          {card.column === "idea" && (
            <div className="row">
              <button className="primary" onClick={() => act({ type: "approveSpec", id: card.id })}>
                Approve the spec
              </button>
              <button className="ghost" disabled={busy} onClick={write}>
                {busy ? "Writing…" : "↻ Rewrite"}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
