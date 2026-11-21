"use client";

import { useMemo, useState } from "react";
import { useHQ } from "./HQ";

/** Jauge de clarté : une spec floue finit souvent en needs-human. */
export function clarity(f: { spec: string; perimetre: string; criteres: string; horsPerimetre: string; verification: string }) {
  const criteria = f.criteres.split("\n").map((l) => l.replace(/^[-*\s\d.)]+/, "").trim()).filter(Boolean);
  let score = 0;
  const tips: string[] = [];
  if (f.spec.trim()) score += 20;
  else tips.push("Indique le chemin de la spec.");
  score += Math.min(criteria.length, 4) * 10;
  if (criteria.length < 2) tips.push("Ajoute au moins 2 critères d'acceptation, un par ligne.");
  if (criteria.some((c) => c.split(" ").length < 4)) tips.push("Un critère trop court est difficile à tester.");
  if (f.perimetre.trim()) score += 10;
  if (f.horsPerimetre.trim()) score += 20;
  else tips.push("Dire ce qui est hors périmètre évite que l'agent déborde.");
  if (f.verification.trim()) score += 10;
  return { score: Math.min(score, 100), tips, criteria: criteria.length };
}

export function Forge({ onClose, defaultRepo }: { onClose: () => void; defaultRepo?: string }) {
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
    <div className="overlay" onClick={onClose}>
      <div className="modal forge" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Forger une quête">
        <header>
          <h2>⚒️ Forger une quête</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="form-grid">
          <label>
            Île (repo)
            <select value={repo} onChange={(e) => setRepo(e.target.value)}>
              {world.repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scope (bureau de l'agent)
            <select value={f.scope} onChange={set("scope")}>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="general">général (sans scope)</option>
            </select>
          </label>
          <label className="wide">
            Titre
            <input value={f.title} onChange={set("title")} placeholder="Exporter une note en PDF" />
          </label>
          <label className="wide">
            Chemin de la spec
            <input value={f.spec} onChange={set("spec")} placeholder="specs/001-nom/spec.md" />
          </label>
          <label className="wide">
            Ce que ce ticket couvre
            <textarea value={f.perimetre} onChange={set("perimetre")} rows={2} />
          </label>
          <label className="wide">
            Critères d'acceptation (un par ligne, vérifiable par un test)
            <textarea value={f.criteres} onChange={set("criteres")} rows={4} />
          </label>
          <label>
            Hors périmètre
            <textarea value={f.horsPerimetre} onChange={set("horsPerimetre")} rows={2} />
          </label>
          <label>
            Vérification manuelle avant merge
            <textarea value={f.verification} onChange={set("verification")} rows={2} />
          </label>
        </div>
        <div className="clarity">
          <span>Clarté de la quête</span>
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
            Créer dans le Backlog
          </button>
          <button className="primary" disabled={busy || !f.title || !f.spec || !c.criteria} onClick={() => submit(true)}>
            Créer et confier à un agent
          </button>
        </footer>
      </div>
    </div>
  );
}
