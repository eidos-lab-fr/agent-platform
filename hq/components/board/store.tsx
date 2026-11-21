"use client";

// Board state in the browser: the demo engine, a one-second clock, and a copy in
// localStorage so the board survives a reload.

import { createContext, useCallback, useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import { demoState } from "@/lib/board/demo-seed";
import { reduce, type BoardAction, type BoardState } from "@/lib/board/engine";

const KEY = "hq-board-v1";

type Act = DistributiveOmit<BoardAction, "at">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K & keyof T> : never;

interface Ctx {
  state: BoardState;
  act: (a: Act) => void;
  reset: () => void;
  demo: boolean;
}
const BoardContext = createContext<Ctx | null>(null);

export const useBoard = () => {
  const c = useContext(BoardContext);
  if (!c) throw new Error("useBoard outside BoardProvider");
  return c;
};

function load(): BoardState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BoardState;
  } catch {}
  return demoState();
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, dispatch] = useReducer((s: BoardState, a: BoardAction | { type: "replace"; state: BoardState }) => (a.type === "replace" ? a.state : reduce(s, a)), null, () => demoState());

  useEffect(() => {
    dispatch({ type: "replace", state: load() });
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick", at: Date.now() }), 1000);
    return () => clearInterval(id);
  }, []);

  const act = useCallback((a: Act) => dispatch({ ...a, at: Date.now() } as BoardAction), []);
  const reset = useCallback(() => dispatch({ type: "replace", state: demoState() }), []);

  if (!ready) return <main className="loading">HQ is waking up…</main>;
  return <BoardContext.Provider value={{ state, act, reset, demo: true }}>{children}</BoardContext.Provider>;
}

/** URL slug of a project: the repo name, or "all". */
export const slugOf = (projectId: string) => (projectId === "all" ? "all" : (projectId.split("/")[1] ?? projectId));

export function projectBySlug(state: BoardState, slug: string) {
  if (slug === "all") return { id: "all", name: "All projects", color: "#8a8fa8" };
  return state.projects.find((p) => slugOf(p.id) === slug) ?? null;
}
