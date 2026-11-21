"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Action, ActionResult } from "@/lib/actions";
import type { Quest, World } from "@/lib/types";
import { Archipel } from "./Archipel";
import { Atelier } from "./Atelier";
import { Dashboard } from "./Dashboard";
import { QuestPanel } from "./QuestPanel";
import { Quests } from "./Quests";

type Tab = "qg" | "atelier" | "quetes" | "archipel";
const TABS: { id: Tab; label: string }[] = [
  { id: "qg", label: "QG" },
  { id: "atelier", label: "L'Atelier" },
  { id: "quetes", label: "Quêtes" },
  { id: "archipel", label: "Archipel" },
];

interface HQContext {
  world: World;
  act: (a: Action) => Promise<ActionResult>;
  openQuest: (id: string) => void;
  busy: boolean;
}
const Ctx = createContext<HQContext | null>(null);
export const useHQ = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHQ hors de HQ");
  return c;
};

export function HQ({ initial }: { initial: World | null }) {
  const [world, setWorld] = useState<World | null>(initial);
  const [tab, setTab] = useState<Tab>("qg");
  const [questId, setQuestId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sober, setSober] = useState(false);
  // Les durées (« il y a 3 min ») dépendent de l'heure du navigateur : rendu côté client seulement.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hq-tab") as Tab | null;
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
      setSober(localStorage.getItem("hq-sober") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("hq-tab", tab);
      localStorage.setItem("hq-sober", sober ? "1" : "0");
    } catch {}
  }, [tab, sober]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("world", (e) => {
      setWorld(JSON.parse((e as MessageEvent).data));
      setProblem(null);
      setLive(true);
    });
    es.addEventListener("ping", () => setLive(true));
    es.addEventListener("problem", (e) => setProblem(JSON.parse((e as MessageEvent).data).message));
    es.onerror = () => setLive(false);
    return () => es.close();
  }, []);

  const act = useCallback(async (a: Action) => {
    setBusy(true);
    try {
      const res = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
      const result = (await res.json()) as ActionResult;
      setToast({ text: result.message, ok: result.ok });
      setTimeout(() => setToast(null), 5000);
      const w = await fetch("/api/world").then((r) => (r.ok ? r.json() : null));
      if (w) setWorld(w);
      return result;
    } catch (e) {
      const result = { ok: false, message: (e as Error).message };
      setToast({ text: result.message, ok: false });
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  if (!world || !mounted) {
    return (
      <main className="loading">
        <p>Le QG se réveille…</p>
        {problem && <p className="error">{problem}</p>}
      </main>
    );
  }

  const quest: Quest | undefined = world.quests.find((q) => q.id === questId);
  const p = world.progress;
  const blocked = world.quests.filter((q) => q.stage === "bloque").length;

  return (
    <Ctx.Provider value={{ world, act, openQuest: setQuestId, busy }}>
      <div className={`app ${sober ? "sober" : ""}`}>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">◆</span> Agent HQ
            {world.mode === "demo" && <span className="badge demo">démo</span>}
          </div>
          <nav className="tabs" aria-label="Onglets">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "qg" && blocked > 0 && <span className="dot" aria-label={`${blocked} agents attendent`}>{blocked}</span>}
              </button>
            ))}
          </nav>
          <div className="player">
            <div className="level" title={`${p.xp} XP`}>
              <span className="lvl">Niv. {p.level}</span>
              <span className="xpbar">
                <span style={{ width: `${Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100)}%` }} />
              </span>
            </div>
            <span className={`live ${live ? "on" : ""}`} title={live ? "En direct" : "Hors ligne"} />
            <button className="ghost small" onClick={() => setSober(!sober)} title="Mode sobre : moins d'animations">
              {sober ? "Mode jeu" : "Mode sobre"}
            </button>
            {world.mode === "github" ? (
              <form action="/api/auth/logout" method="post">
                <button className="ghost small">{world.login} · sortir</button>
              </form>
            ) : null}
          </div>
        </header>

        {problem && <div className="banner error">GitHub ne répond pas comme prévu : {problem}</div>}

        <main className="content">
          {tab === "qg" && <Dashboard onTab={(t) => setTab(t as Tab)} />}
          {tab === "atelier" && <Atelier />}
          {tab === "quetes" && <Quests />}
          {tab === "archipel" && <Archipel />}
        </main>

        {quest && <QuestPanel quest={quest} onClose={() => setQuestId(null)} />}
        {toast && (
          <div className={`toast ${toast.ok ? "ok" : "ko"}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
