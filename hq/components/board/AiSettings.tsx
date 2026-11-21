"use client";

import { useCallback, useEffect, useState } from "react";
import { PROVIDER_TEXT, type ProviderId } from "@/lib/ai-names";
import { TopBar } from "./TopBar";

interface Status {
  id: ProviderId;
  ready: boolean;
  detail: string;
  model: string;
  keyHint?: string;
}
interface Loaded {
  choice: ProviderId | "auto";
  active: ProviderId;
  providers: Status[];
  ollamaUrl: string;
  editable: boolean;
}

const KEYED: ProviderId[] = ["anthropic", "openai", "deepseek"];

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return (await res.json()) as { ok: boolean; message?: string } & Partial<Loaded>;
}

/** Where the AI of HQ comes from: your Claude Code subscription, an API key, or a local model. */
export function AiSettings() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [note, setNote] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await call("/api/ai", "GET");
    if (!r.ok) return setError(r.message ?? "Could not read the settings.");
    setData(r as unknown as Loaded);
    setModels(Object.fromEntries((r.providers ?? []).map((p) => [p.id, p.model])));
    setOllamaUrl(r.ollamaUrl ?? "");
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (patch: Record<string, unknown>, id: string) => {
    setBusy(id);
    const r = await call("/api/ai", "PUT", patch);
    setBusy(null);
    setNote((n) => ({ ...n, [id]: { ok: r.ok, text: r.ok ? "Saved." : (r.message ?? "Not saved.") } }));
    if (r.ok) {
      setKeys((k) => ({ ...k, [id]: "" }));
      await refresh();
    }
  };
  const test = async (id: ProviderId) => {
    setBusy(id);
    setNote((n) => ({ ...n, [id]: { ok: true, text: "Asking…" } }));
    const r = await call("/api/ai/test", "POST", { provider: id });
    setBusy(null);
    setNote((n) => ({ ...n, [id]: { ok: r.ok, text: r.message ?? "" } }));
  };

  return (
    <main className="page">
      <TopBar />
      <div className="teams settings">
        <h1>AI settings</h1>
        <p className="muted">
          The AI writes the specs of your ideas (and soon the plans). Pick where it comes from. Keys are saved in <code>.hq/ai.json</code> on this computer, readable by you only,
          and never sent back to the page.
        </p>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="loading">Loading…</p>}
        {data && (
          <>
            {!data.editable && <p className="status warn">This HQ is hosted: set the keys in the server environment (see the README).</p>}
            <div className="chips choice">
              {(["auto", ...data.providers.map((p) => p.id)] as const).map((id) => (
                <button
                  key={id}
                  className={`chip ${data.choice === id ? "active" : ""}`}
                  disabled={!data.editable || busy !== null}
                  onClick={() => save({ provider: id }, "choice")}
                >
                  {id === "auto" ? "Automatic" : PROVIDER_TEXT[id].name}
                </button>
              ))}
            </div>
            <p className="muted small">
              {data.choice === "auto" ? "Automatic uses the first ready one: Ollama, Claude Code, then the API keys. " : ""}
              In use now: <strong>{PROVIDER_TEXT[data.active].name}</strong>.
            </p>
            <div className="team-grid">
              {data.providers.map((p) => (
                <section key={p.id} className={`team-card provider ${data.active === p.id ? "in-use" : ""}`}>
                  <header>
                    <span className="dot" style={{ background: p.ready ? "var(--good)" : "var(--line)" }} />
                    <h2>{PROVIDER_TEXT[p.id].name}</h2>
                    {data.active === p.id && <span className="badge">in use</span>}
                  </header>
                  <p className="muted small">{PROVIDER_TEXT[p.id].blurb}</p>
                  <p className={`small ${p.ready ? "status good" : "muted"}`}>
                    {p.detail}
                    {p.keyHint ? ` (${p.keyHint})` : ""}
                  </p>
                  {p.id === "claude-code" && !p.ready && data.editable && (
                    <p className="small muted">
                      Install it with <code>npm i -g @anthropic-ai/claude-code</code>, run <code>claude</code> once to sign in with your Claude account, then reload this page.
                    </p>
                  )}
                  {p.id === "ollama" && data.editable && (
                    <label className="small">
                      Address
                      <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} onBlur={() => ollamaUrl !== data.ollamaUrl && save({ ollamaUrl }, p.id)} />
                    </label>
                  )}
                  {KEYED.includes(p.id) && data.editable && (
                    <form
                      className="row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (keys[p.id]?.trim()) void save({ keys: { [p.id]: keys[p.id] } }, p.id);
                      }}
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        className="grow"
                        value={keys[p.id] ?? ""}
                        onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                        placeholder={p.keyHint ? `Replace the key ${p.keyHint}` : "Paste the API key"}
                      />
                      <button disabled={!keys[p.id]?.trim() || busy !== null}>Save</button>
                      {p.keyHint && (
                        <button type="button" className="ghost small danger" disabled={busy !== null} onClick={() => save({ keys: { [p.id]: "" } }, p.id)}>
                          Remove
                        </button>
                      )}
                    </form>
                  )}
                  {p.id !== "rules" && data.editable && (
                    <label className="small">
                      Model {p.id === "claude-code" && <span className="muted">(empty: the default of your plan)</span>}
                      <input value={models[p.id] ?? ""} onChange={(e) => setModels({ ...models, [p.id]: e.target.value })} onBlur={() => models[p.id] !== p.model && save({ models: { [p.id]: models[p.id] } }, p.id)} />
                    </label>
                  )}
                  {p.id !== "rules" && (
                    <div className="row">
                      <button className="ghost small" disabled={!p.ready || busy !== null} onClick={() => test(p.id)}>
                        Test
                      </button>
                      {note[p.id] && <span className={`small ${note[p.id].ok ? "muted" : "error"}`}>{note[p.id].text}</span>}
                    </div>
                  )}
                </section>
              ))}
            </div>
            {note.choice && !note.choice.ok && <p className="error small">{note.choice.text}</p>}
          </>
        )}
      </div>
    </main>
  );
}
