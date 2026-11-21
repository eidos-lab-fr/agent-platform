"use client";

import { useState } from "react";
import { STAGE_LABELS, type Quest, type ReviewResult, type Stage } from "@/lib/types";
import { useHQ } from "./HQ";
import { Sprite } from "./arcade/Sprite";
import { agentName, ago, repoName } from "./util";

export const SIMPLE_STAGE: Record<Stage, string> = {
  backlog: "Backlog",
  spec_en_cours: "Being specified",
  spec_prete: "Specified",
  a_developper: "About to start",
  en_developpement: "Being built",
  pr_ouverte: "Being reviewed",
  revue_humaine: "Waiting for your OK",
  done: "Live",
  bloque: "Needs your answer",
};

const JOURNEY: Stage[] = ["backlog", "a_developper", "en_developpement", "pr_ouverte", "revue_humaine", "done"];

export function QuestPanel({ quest: q, onClose }: { quest: Quest; onClose: () => void }) {
  const { world, act, busy, simple } = useHQ();
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
          {repoName(q.repo)}
          <span className="dev-only"> #{q.number}</span> · {simple ? SIMPLE_STAGE[q.stage] : STAGE_LABELS[q.stage]}
        </span>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <h2>{q.title}</h2>

      <ol className="journey">
        {JOURNEY.map((s, i) => (
          <li key={s} className={i < reached ? "past" : i === reached ? (q.stage === "bloque" ? "now blocked" : "now") : ""}>
            {simple ? SIMPLE_STAGE[s] : STAGE_LABELS[s]}
          </li>
        ))}
      </ol>

      {agents.length > 0 && (
        <div className="panel-agents">
          {agents.map((a) => (
            <div key={a.id} className="panel-agent">
              <Sprite role={a.role} activity={a.activity} size={40} />
              <span>
                <strong>{agentName(a.role, a.scope)}</strong> · {a.step} · {ago(a.startedAt)}
                {a.runUrl && (
                  <>
                    {" "}
                    · <a href={a.runUrl} target="_blank" rel="noreferrer">see the run</a>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {q.stage === "bloque" && (
        <section className="panel-block">
          <h3>✋ The agent asks</h3>
          <blockquote>{q.question ?? "Read its latest comment on GitHub."}</blockquote>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={async () => (await act({ type: "answer", repo: q.repo, number: q.number, text })).ok && setText("")}
          >
            Answer and restart the agent
          </button>
        </section>
      )}

      {canLaunch && (
        <section className="panel-block">
          <h3>🚀 {simple ? "Start building" : "Hand to an agent"}</h3>
          <div className="row">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="dev-only">
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s} desk
                </option>
              ))}
              <option value="general">general</option>
            </select>
            <button className="primary" disabled={busy} onClick={() => act({ type: "launch", repo: q.repo, number: q.number, scope })}>
              {simple ? "Send to the team" : "Launch"}
            </button>
          </div>
          <p className="muted small dev-only">Adds scope:{scope}, then ready-for-dev, with your account: the dev agent starts.</p>
        </section>
      )}

      {q.pr && <Review quest={q} />}

      {q.state === "open" && !(q.pr?.state === "open") && !simple && (
        <section className="panel-block">
          <h3>✨ Ask @claude</h3>
          <textarea rows={2} value={q.stage === "bloque" ? "" : text} onChange={(e) => setText(e.target.value)} placeholder="Fix the failing test on…" disabled={q.stage === "bloque"} />
          <button disabled={busy || !text.trim() || q.stage === "bloque"} onClick={async () => (await act({ type: "claude", repo: q.repo, number: q.number, text })).ok && setText("")}>
            Send to the issue
          </button>
        </section>
      )}

      <section className="panel-block">
        <h3>📜 {simple ? "The request" : "Description"}</h3>
        <pre className="body">{q.body || "No description."}</pre>
        <a href={q.url} target="_blank" rel="noreferrer">
          Open on GitHub
        </a>
      </section>
    </aside>
  );
}

const REVIEWER_TEXT: Record<ReviewResult["role"], { simple: string; dev: string }> = {
  spec: { simple: "Does what was asked", dev: "spec" },
  securite: { simple: "Safe", dev: "security" },
  tests: { simple: "Tested", dev: "tests" },
};
const RESULT_ICON: Record<ReviewResult["result"] | "none", string> = { passed: "✅", failed: "❌", running: "⏳", queued: "🕒", none: "·" };

/** The change an agent proposes: size, each reviewer's result, then ship it or ask for changes. */
function Review({ quest: q }: { quest: Quest }) {
  const { act, busy, simple } = useHQ();
  const [feedback, setFeedback] = useState("");
  const pr = q.pr!;
  const open = pr.state === "open";
  const results = (["spec", "securite", "tests"] as const).map((role) => ({ role, result: (pr.reviews.find((r) => r.role === role)?.result ?? "none") as ReviewResult["result"] | "none" }));
  return (
    <section className="panel-block review-block">
      <h3>
        📦 {simple ? "The proposed change" : `PR #${pr.number}`}{" "}
        {pr.state === "merged" ? (
          <span className="badge ok">{simple ? "live" : "merged"}</span>
        ) : pr.verdict === "ok" ? (
          <span className="badge ok">{simple ? "approved by the reviewers" : "review:ok"}</span>
        ) : pr.verdict === "changes" ? (
          <span className="badge ko">{simple ? "changes asked" : "review:changes"}</span>
        ) : open ? (
          <span className="badge">{simple ? "under review" : "pending"}</span>
        ) : null}
      </h3>
      <p>
        <a href={pr.url} target="_blank" rel="noreferrer">
          {pr.title}
        </a>
        <span className="dev-only">
          {" "}
          · branch <code>{pr.branch}</code>
        </span>
      </p>
      {pr.stats && (
        <p className="pr-stats small">
          <span>
            {pr.stats.files} file{pr.stats.files > 1 ? "s" : ""}
          </span>
          <span className="add">+{pr.stats.additions}</span>
          <span className="del">−{pr.stats.deletions}</span>
          <span className="dev-only">
            {pr.stats.commits} commit{pr.stats.commits > 1 ? "s" : ""}
          </span>
          <span className="sizebar" title="Size of the change">
            <span className="add-bar" style={{ flex: pr.stats.additions || 1 }} />
            <span className="del-bar" style={{ flex: pr.stats.deletions }} />
          </span>
        </p>
      )}
      <ul className="reviewers">
        {results.map((r) => (
          <li key={r.role} className={`rv rv-${r.result}`}>
            <span>{RESULT_ICON[r.result]}</span> {simple ? REVIEWER_TEXT[r.role].simple : `Reviewer ${REVIEWER_TEXT[r.role].dev}`}
            <span className="muted small"> {r.result === "none" ? "not run yet" : r.result}</span>
          </li>
        ))}
      </ul>

      {open && (
        <>
          {q.stage === "revue_humaine" ? (
            <div className="ship">
              <p className="muted small">
                {simple
                  ? "The reviewers approved it. Have a look, then ship it: it goes live on the product."
                  : "Read the diff before merging: a human always merges, and that human is you."}{" "}
                <a href={`${pr.url}/files`} target="_blank" rel="noreferrer">
                  {simple ? "See what changed" : "Open the diff"}
                </a>
              </p>
              <button className="gold-btn" disabled={busy} onClick={() => act({ type: "merge", repo: q.repo, prNumber: pr.number })}>
                {simple ? "Approve and ship" : "Squash and merge"}
              </button>
            </div>
          ) : (
            <p className="muted small">{simple ? "You can ship once the three reviewers agree." : "Merge unlocks with review:ok."}</p>
          )}
          <div className="request-changes">
            <label className="small">
              {simple ? "Something to change? Say it in your own words" : "Request changes (posted as @claude on the PR)"}
              <textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="The button should be on the right, and say “Export”." />
            </label>
            <button
              disabled={busy || !feedback.trim()}
              onClick={async () => (await act({ type: "claude", repo: q.repo, number: pr.number, text: `Please make these changes before merge:\n\n${feedback.trim()}` })).ok && setFeedback("")}
            >
              Ask for changes
            </button>
          </div>
        </>
      )}
    </section>
  );
}
