"use client";

// Board state in the browser.
// - GitHub mode (you are signed in): the board comes from /api/board every 10 seconds, and each
//   move is sent there. The move is shown at once (same engine as the demo), then GitHub's
//   answer replaces it.
// - Demo mode: the demo engine, a one-second clock, and a copy in localStorage.

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { demoState } from "@/lib/board/demo-seed";
import { reduce, type BoardAction, type BoardState } from "@/lib/board/engine";

const KEY = "hq-board-v1";
const POLL_MS = 10_000;

type Act = DistributiveOmit<BoardAction, "at">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K & keyof T> : never;

interface Ctx {
  state: BoardState;
  act: (a: Act) => void;
  reset: () => void;
  demo: boolean;
  login: string | null;
}
const BoardContext = createContext<Ctx | null>(null);

export const useBoard = () => {
  const c = useContext(BoardContext);
  if (!c) throw new Error("useBoard outside BoardProvider");
  return c;
};

function loadDemo(): BoardState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BoardState;
  } catch {}
  return demoState();
}

type Mode = "loading" | "demo" | "github";
type Notice = { ok: boolean; text: string; url?: string } | null;

export function BoardProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [login, setLogin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [state, dispatch] = useReducer((s: BoardState, a: BoardAction | { type: "replace"; state: BoardState }) => (a.type === "replace" ? a.state : reduce(s, a)), null, () => demoState());
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = (await (await fetch("/api/board", { cache: "no-store" })).json()) as { ok: boolean; mode?: "demo" | "github"; state?: BoardState; login?: string; message?: string };
      if (!r.ok) throw new Error(r.message || "GitHub did not answer.");
      if (r.mode === "github" && r.state) {
        // A move on its way: its answer brings a fresher board.
        if (pending.current === 0) dispatch({ type: "replace", state: r.state });
        setLogin(r.login ?? null);
        setError(null);
      }
      return r.mode ?? "demo";
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  // Which mode: the server knows.
  useEffect(() => {
    void refresh().then((m) => {
      if (m === "demo") dispatch({ type: "replace", state: loadDemo() });
      setMode(m ?? "github");
    });
  }, [refresh]);

  // Demo: keep a copy, run the clock.
  useEffect(() => {
    if (mode !== "demo") return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, mode]);
  useEffect(() => {
    if (mode !== "demo") return;
    const id = setInterval(() => dispatch({ type: "tick", at: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [mode]);

  // GitHub: poll while the page is visible.
  useEffect(() => {
    if (mode !== "github") return;
    const id = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [mode, refresh]);

  const act = useCallback(
    (a: Act) => {
      const action = { ...a, at: Date.now() } as BoardAction;
      if (mode !== "github") return dispatch(action);
      // Shown at once, except the moves whose result only GitHub knows.
      if (a.type !== "ship" && a.type !== "addProject") dispatch(action);
      pending.current++;
      void fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) })
        .then((res) => res.json() as Promise<{ ok: boolean; message: string; url?: string }>)
        .then((r) => setNotice({ ok: r.ok, text: r.message, url: r.url }))
        .catch((e: Error) => setNotice({ ok: false, text: e.message }))
        .finally(() => {
          pending.current--;
          void refresh();
        });
    },
    [mode, refresh],
  );
  const reset = useCallback(() => dispatch({ type: "replace", state: demoState() }), []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.ok ? 4000 : 9000);
    return () => clearTimeout(id);
  }, [notice]);

  if (mode === "loading") return <main className="loading">HQ is waking up…</main>;
  if (mode === "github" && error && !state.projects.length)
    return (
      <main className="loading">
        <p className="error">{error}</p>
        <p className="muted">Check `gh auth status`, then reload. `npm run doctor` tells what is missing.</p>
      </main>
    );
  return (
    <BoardContext.Provider value={{ state, act, reset, demo: mode === "demo", login }}>
      {children}
      {(notice || error) && (
        <div className={`toast ${notice && !notice.ok ? "bad" : error && !notice ? "bad" : ""}`} role="status">
          {notice ? notice.text : `GitHub: ${error}`}
          {notice?.url && (
            <a href={notice.url} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          )}
        </div>
      )}
    </BoardContext.Provider>
  );
}

/** URL slug of a project: the repo name, or "all". */
export const slugOf = (projectId: string) => (projectId === "all" ? "all" : (projectId.split("/")[1] ?? projectId));

export function projectBySlug(state: BoardState, slug: string) {
  if (slug === "all") return { id: "all", name: "All projects", color: "#8a8fa8" };
  return state.projects.find((p) => slugOf(p.id) === slug) ?? null;
}
