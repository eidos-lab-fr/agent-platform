"use client";

import { useMemo, useState } from "react";
import type { SpecDraft } from "@/lib/spec-ai";
import { useHQ } from "./HQ";

/** Clarity meter: a vague spec often ends in needs-human. */
export function clarity(f: { spec: string; perimetre: string; criteres: string; horsPerimetre: string; verification: string }) {
  const criteria = f.criteres.split("\n").map((l) => l.replace(/^[-*\s\d.)]+/, "").trim()).filter(Boolean);
  let score = 0;
  const tips: string[] = [];
  if (f.spec.trim()) score += 20;
  else tips.push("Give the path to the spec.");
  score += Math.min(criteria.length, 4) * 10;
  if (criteria.length < 2) tips.push("Add at least 2 acceptance criteria, one per line.");
  if (criteria.some((c) => c.split(" ").length < 4)) tips.push("A very short criterion is hard to test.");
  if (f.perimetre.trim()) score += 10;
  if (f.horsPerimetre.trim()) score += 20;
  else tips.push("Saying what is out of scope keeps the agent from overreaching.");
  if (f.verification.trim()) score += 10;
  return { score: Math.min(score, 100), tips, criteria: criteria.length };
}

const ENGINE_TEXT: Record<SpecDraft["engine"], string> = {
  ollama: "Rewritten by your local AI (Ollama)",
  claude: "Rewritten by Claude",
  rules: "Structured without AI (no local model found)",
};

export function Forge({ onClose, defaultRepo }: { onClose: () => void; defaultRepo?: string }) {
  const { simple } = useHQ();
  const [picked, setMode] = useState<"prompt" | "manual">("prompt");
  // Writing by hand with a spec path is a Dev mode tool: Simple mode always describes the need.
  const mode = simple ? "prompt" : picked;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal forge" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New request">
        <header>
          <h2>{simple ? "New request" : "⚒️ New quest"}</h2>
          {!simple && (
            <div className="mode-switch" role="group" aria-label="How to write it">
              <button className={mode === "prompt" ? "active" : ""} onClick={() => setMode("prompt")}>
                ✨ Describe it
              </button>
              <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
                ✍️ By hand
              </button>
            </div>
          )}
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {mode === "prompt" ? <PromptForge onClose={onClose} defaultRepo={defaultRepo} /> : <ManualForge onClose={onClose} defaultRepo={defaultRepo} />}
      </div>
    </div>
  );
}

/** A PM writes the need in plain words; an AI (local first) turns it into a request the agents can work from. */
function PromptForge({ onClose, defaultRepo }: { onClose: () => void; defaultRepo?: string }) {
  const { world, act, busy, simple, notify } = useHQ();
  const [repo, setRepo] = useState(defaultRepo ?? world.repos[0]?.fullName ?? "");
  const scopes = world.repos.find((r) => r.fullName === repo)?.scopes ?? [];
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [d, setD] = useState<(Omit<SpecDraft, "criteres"> & { criteres: string }) | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  const rewrite = async () => {
    setThinking(true);
    try {
      const res = await fetch("/api/spec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, repo, scopes }) });
      const r = (await res.json()) as { ok: boolean; message: string; draft?: SpecDraft };
      if (!r.ok || !r.draft) return notify(r.message || "The rewrite failed.", false);
      setD({ ...r.draft, criteres: r.draft.criteres.join("\n") });
      setAnswers(r.draft.questions.map(() => ""));
    } catch (e) {
      notify((e as Error).message, false);
    } finally {
      setThinking(false);
    }
  };

  const summary = d
    ? [
        d.summary,
        ...d.questions.map((q, i) => (answers[i]?.trim() ? `**${q}** ${answers[i].trim()}` : "")).filter(Boolean),
        "",
        `_Original request:_ ${prompt.trim()}`,
      ]
        .join("\n\n")
        .trim()
    : "";
  const c = clarity({ spec: summary, perimetre: d?.perimetre ?? "", criteres: d?.criteres ?? "", horsPerimetre: d?.horsPerimetre ?? "", verification: d?.verification ?? "" });
  const open = d ? d.questions.filter((_, i) => !answers[i]?.trim()).length : 0;
  const set = (k: "title" | "scope" | "summary" | "perimetre" | "criteres" | "horsPerimetre" | "verification") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    d && setD({ ...d, [k]: e.target.value });

  const submit = async (launch: boolean) => {
    if (!d) return;
    const criteres = d.criteres.split("\n").map((l) => l.replace(/^[-*\s]+/, "").trim()).filter(Boolean).map((l) => `- ${l}`).join("\n");
    const r = await act({ type: "create", repo, title: d.title, scope: d.scope || "general", spec: "", summary, perimetre: d.perimetre, criteres, horsPerimetre: d.horsPerimetre, verification: d.verification, launch });
    if (r.ok) onClose();
  };

  return (
    <>
      <div className="form-grid">
        <label className={simple ? "wide" : ""}>
          Product
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            {world.repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          What do you want? <span className="muted small">Say it like you would to a colleague. No technical detail needed.</span>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="People should be able to export a note as a PDF from the note page, with the title and the date at the top. Not for whole folders for now."
          />
        </label>
      </div>
      <div className="row">
        <button className={d ? "" : "primary"} disabled={thinking || prompt.trim().length < 8} onClick={rewrite}>
          {thinking ? "Rewriting…" : d ? "↻ Rewrite again" : "✨ Turn it into a request"}
        </button>
        {d && <span className="muted small">{ENGINE_TEXT[d.engine]}</span>}
      </div>

      {d && (
        <div className="draft">
          <div className="form-grid">
            <label className="wide">
              Title
              <input value={d.title} onChange={set("title")} />
            </label>
            {!simple && (
              <label>
                Desk (scope)
                <select value={d.scope} onChange={set("scope")}>
                  {[...scopes.filter((s) => s !== "general"), "general"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="wide">
              The need
              <textarea rows={3} value={d.summary} onChange={set("summary")} />
            </label>
            <label className="wide">
              Done when… <span className="muted small">(one per line)</span>
              <textarea rows={4} value={d.criteres} onChange={set("criteres")} />
            </label>
            <label>
              Not part of it
              <textarea rows={2} value={d.horsPerimetre} onChange={set("horsPerimetre")} />
            </label>
            <label>
              How you will check it
              <textarea rows={2} value={d.verification} onChange={set("verification")} />
            </label>
          </div>
          {d.questions.length > 0 && (
            <div className="questions">
              <h3>🤔 Before the agents start</h3>
              <p className="muted small">Answering now saves an agent getting stuck halfway. You can leave a question blank.</p>
              {d.questions.map((q, i) => (
                <label key={i}>
                  {q}
                  <input value={answers[i] ?? ""} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
                </label>
              ))}
            </div>
          )}
          <div className="clarity">
            <span>Clarity</span>
            <span className="meter">
              <span style={{ width: `${c.score}%` }} className={c.score >= 70 ? "good" : c.score >= 40 ? "mid" : "low"} />
            </span>
            <strong>{c.score}%</strong>
          </div>
          <footer>
            <button className="ghost" disabled={busy || !d.title.trim()} onClick={() => submit(false)}>
              Add to the backlog
            </button>
            <button className="primary" disabled={busy || !d.title.trim() || !c.criteria} onClick={() => submit(true)} title={open ? `${open} question(s) unanswered` : ""}>
              Create and start building
            </button>
          </footer>
        </div>
      )}
    </>
  );
}

function ManualForge({ onClose, defaultRepo }: { onClose: () => void; defaultRepo?: string }) {
  const { world, act, busy } = useHQ();
  const [repo, setRepo] = useState(defaultRepo ?? world.repos[0]?.fullName ?? "");
  const scopes = world.repos.find((r) => r.fullName === repo)?.scopes ?? [];
  const [f, setF] = useState({ title: "", scope: "", spec: "", perimetre: "", criteres: "", horsPerimetre: "", verification: "" });
  const c = useMemo(() => clarity(f), [f]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async (launch: boolean) => {
    const r = await act({ type: "create", repo, ...f, scope: f.scope || scopes[0] || "general", launch });
    if (r.ok) onClose();
  };

  return (
    <>
        <div className="form-grid">
          <label>
            Island (repo)
            <select value={repo} onChange={(e) => setRepo(e.target.value)}>
              {world.repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scope (agent desk)
            <select value={f.scope} onChange={set("scope")}>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="general">general (no scope)</option>
            </select>
          </label>
          <label className="wide">
            Title
            <input value={f.title} onChange={set("title")} placeholder="Export a note as PDF" />
          </label>
          <label className="wide">
            Spec path
            <input value={f.spec} onChange={set("spec")} placeholder="specs/001-nom/spec.md" />
          </label>
          <label className="wide">
            What this issue covers
            <textarea value={f.perimetre} onChange={set("perimetre")} rows={2} />
          </label>
          <label className="wide">
            Acceptance criteria (one per line, each checkable by a test)
            <textarea value={f.criteres} onChange={set("criteres")} rows={4} />
          </label>
          <label>
            Out of scope
            <textarea value={f.horsPerimetre} onChange={set("horsPerimetre")} rows={2} />
          </label>
          <label>
            Manual check before merge
            <textarea value={f.verification} onChange={set("verification")} rows={2} />
          </label>
        </div>
        <div className="clarity">
          <span>Quest clarity</span>
          <span className="meter">
            <span style={{ width: `${c.score}%` }} className={c.score >= 70 ? "good" : c.score >= 40 ? "mid" : "low"} />
          </span>
          <strong>{c.score}%</strong>
        </div>
        {c.tips.length > 0 && (
          <ul className="tips">
            {c.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <footer>
          <button className="ghost" disabled={busy || !f.title} onClick={() => submit(false)}>
            Add to the backlog
          </button>
          <button className="primary" disabled={busy || !f.title || !f.spec || !c.criteria} onClick={() => submit(true)}>
            Create and hand to an agent
          </button>
        </footer>
    </>
  );
}
