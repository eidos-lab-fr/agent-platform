"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Action, ActionResult } from "@/lib/actions";
import type { Team } from "@/lib/teams";
import type { Quest, World } from "@/lib/types";
import { Archipel } from "./Archipel";
import { Atelier } from "./Atelier";
import { Dashboard } from "./Dashboard";
import { QuestPanel } from "./QuestPanel";
import { Quests } from "./Quests";
import { Roadmap } from "./Roadmap";
import { TeamTab } from "./Team";
import { TeamWizard } from "./TeamWizard";

export type Tab = "qg" | "atelier" | "roadmap" | "quetes" | "equipe" | "archipel";
// Simple mode speaks product; Dev mode speaks GitHub.
const TABS: { id: Tab; simple: string; dev: string }[] = [
  { id: "qg", simple: "Home", dev: "HQ" },
  { id: "roadmap", simple: "Roadmap", dev: "Roadmap" },
  { id: "atelier", simple: "Workshop", dev: "Workshop" },
  { id: "quetes", simple: "Board", dev: "Quests" },
  { id: "equipe", simple: "Team", dev: "Team" },
  { id: "archipel", simple: "Products", dev: "Archipelago" },
];

export type TeamOp =
  | { op: "create"; template: string | null; name?: string }
  | { op: "save"; team: Team }
  | { op: "delete"; id: string }
  | { op: "deploy"; id: string; repo: string };
export interface TeamOpResult extends ActionResult {
  team?: Team;
}

interface HQContext {
  world: World;
  act: (a: Action) => Promise<ActionResult>;
  openQuest: (id: string) => void;
  busy: boolean;
  /** Simple (product) mode hides GitHub vocabulary. */
  simple: boolean;
  setTab: (t: Tab) => void;
  teams: Team[] | null;
  teamOp: (op: TeamOp) => Promise<TeamOpResult>;
  notify: (text: string, ok: boolean) => void;
}
const Ctx = createContext<HQContext | null>(null);
export const useHQ = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHQ used outside HQ");
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
  const [simple, setSimple] = useState(true);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [wizard, setWizard] = useState(false);
  // Durations ("3 min ago") depend on the browser clock: render on the client only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hq-tab") as Tab | null;
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
      setSober(localStorage.getItem("hq-sober") === "1");
      setSimple(localStorage.getItem("hq-mode") !== "dev");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("hq-tab", tab);
      localStorage.setItem("hq-sober", sober ? "1" : "0");
      localStorage.setItem("hq-mode", simple ? "simple" : "dev");
    } catch {}
  }, [tab, sober, simple]);

  // Teams: a new user with no team is offered the wizard once.
  useEffect(() => {
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((d: { teams: Team[] }) => {
        setTeams(d.teams);
        let seen = false;
        try {
          seen = localStorage.getItem("hq-team-wizard") === "seen";
        } catch {}
        if (!d.teams.length && !seen) setWizard(true);
      })
      .catch(() => setTeams([]));
  }, []);

  const notify = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const teamOp = useCallback(
    async (op: TeamOp): Promise<TeamOpResult> => {
      setBusy(true);
      try {
        const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
        const result = (await res.json()) as TeamOpResult;
        if (result.message) notify(result.message, result.ok);
        if (result.ok) {
          if (op.op === "delete") setTeams((ts) => (ts ?? []).filter((t) => t.id !== op.id));
          else if (result.team) {
            const saved = result.team;
            setTeams((ts) => [...(ts ?? []).filter((t) => t.id !== saved.id), saved].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
          }
        }
        return result;
      } catch (e) {
        notify((e as Error).message, false);
        return { ok: false, message: (e as Error).message };
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const closeWizard = () => {
    setWizard(false);
    try {
      localStorage.setItem("hq-team-wizard", "seen");
    } catch {}
  };

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
        <p>HQ is waking up…</p>
        {problem && <p className="error">{problem}</p>}
      </main>
    );
  }

  const quest: Quest | undefined = world.quests.find((q) => q.id === questId);
  const p = world.progress;
  const blocked = world.quests.filter((q) => q.stage === "bloque").length;

  return (
    <Ctx.Provider value={{ world, act, openQuest: setQuestId, busy, simple, setTab, teams, teamOp, notify }}>
      <div className={`app ${sober ? "sober" : ""} ${simple ? "simple" : "dev"}`}>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">◆</span> Agent HQ
            {world.mode === "demo" && <span className="badge demo">demo</span>}
          </div>
          <nav className="tabs" aria-label="Tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {simple ? t.simple : t.dev}
                {t.id === "qg" && blocked > 0 && <span className="dot" aria-label={`${blocked} agents waiting`}>{blocked}</span>}
              </button>
            ))}
          </nav>
          <div className="player">
            <div className="level" title={`${p.xp} XP`}>
              <span className="lvl">Lvl {p.level}</span>
              <span className="xpbar">
                <span style={{ width: `${Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100)}%` }} />
              </span>
            </div>
            <span className={`live ${live ? "on" : ""}`} title={live ? "Live" : "Offline"} />
            <div className="mode-switch" role="group" aria-label="Interface mode">
              <button className={simple ? "active" : ""} onClick={() => setSimple(true)} title="Product words, no GitHub jargon">
                Simple
              </button>
              <button className={!simple ? "active" : ""} onClick={() => setSimple(false)} title="Branches, labels, runs and PR numbers">
                Dev
              </button>
            </div>
            <button className="ghost small" onClick={() => setSober(!sober)} title="Calm mode: fewer animations">
              {sober ? "Game mode" : "Calm mode"}
            </button>
            {world.mode === "github" ? (
              <form action="/api/auth/logout" method="post">
                <button className="ghost small">{world.login} · sign out</button>
              </form>
            ) : null}
          </div>
        </header>

        {problem && <div className="banner error">GitHub is not responding as expected: {problem}</div>}

        <main className="content">
          {tab === "qg" && <Dashboard onTab={(t) => setTab(t as Tab)} />}
          {tab === "atelier" && <Atelier />}
          {tab === "roadmap" && <Roadmap />}
          {tab === "quetes" && <Quests />}
          {tab === "equipe" && <TeamTab onWizard={() => setWizard(true)} />}
          {tab === "archipel" && <Archipel />}
        </main>

        {quest && <QuestPanel quest={quest} onClose={() => setQuestId(null)} />}
        {wizard && (
          <TeamWizard
            onClose={closeWizard}
            onDone={() => {
              closeWizard();
              setTab("equipe");
            }}
          />
        )}
        {toast && (
          <div className={`toast ${toast.ok ? "ok" : "ko"}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
