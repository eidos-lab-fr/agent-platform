"use client";

import { useState } from "react";
import { ZONES } from "@/lib/board/model";
import { guessZones } from "@/lib/board/planner";
import { useBoard } from "./store";

export function NewIdea({ project, onClose }: { project?: string; onClose: () => void }) {
  const { state, act } = useBoard();
  const [target, setTarget] = useState(project ?? state.projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [need, setNeed] = useState("");
  const zones = title || need ? guessZones(`${title} ${need}`) : [];

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          act({ type: "addIdea", project: target, title, need: need || title });
          onClose();
        }}
      >
        <header>
          <h2>New idea</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {!project && (
          <label>
            Project
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          In a few words
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Export a note as PDF" />
        </label>
        <label>
          What do you want? <span className="muted small">Like you would say it to a colleague.</span>
          <textarea rows={4} value={need} onChange={(e) => setNeed(e.target.value)} placeholder="From the note page, with the title and the date at the top. Not for whole folders for now." />
        </label>
        {zones.length > 0 && (
          <p className="small">
            Touches{" "}
            {zones.map((z) => (
              <span key={z} className="zone-inline" style={{ ["--c" as string]: ZONES[z].color }}>
                {ZONES[z].name}
              </span>
            ))}{" "}
            <span className="muted">(you can correct it on the card)</span>
          </p>
        )}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!title.trim()}>
            Add to Ideas
          </button>
        </footer>
      </form>
    </div>
  );
}
