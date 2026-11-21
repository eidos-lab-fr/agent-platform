"use client";

// The agents, live on the board. Each clone at work walks out of its gauge in the top bar to
// its card, works on it, and walks back when the card is done. Click one to see what it does.

import { useEffect, useRef, useState } from "react";
import { teamOf } from "@/lib/board/engine";
import type { Card } from "@/lib/board/model";
import { Avatar } from "./Avatar";
import { useBoard } from "./store";

interface Sprite {
  id: string;
  cardId: string;
  agentId: string;
  clone: number;
  color: string;
  icon: string;
  name: string;
  asking: boolean;
  /** Index among the workers of its card, to stand side by side. */
  seat: number;
  leaving: boolean;
}

const WALK_MS = 1600;
const SIZE = 30;

function rectOf(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

export function AgentLayer({ cards, onOpen }: { cards: Card[]; onOpen: (cardId: string, workerId: string) => void }) {
  const { state } = useBoard();
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [, setFrame] = useState(0);
  const arrived = useRef(new Map<string, number>());
  const [instant, setInstant] = useState(false);

  // Who should be on the board now.
  const wanted: Sprite[] = cards
    .filter((c) => c.column === "in_progress")
    .flatMap((c) => {
      const team = teamOf(state, c.project);
      const asking = c.messages.some((m) => m.open);
      return c.workers.map((w, seat) => {
        const a = team.agents.find((x) => x.id === w.agentId);
        return { id: w.id, cardId: c.id, agentId: w.agentId, clone: w.clone, color: a?.color ?? "#999", icon: a?.icon ?? "?", name: a?.name ?? w.agentId, asking, seat, leaving: false };
      });
    });
  const wantedKey = wanted.map((w) => `${w.id}:${w.asking}`).join("|");

  useEffect(() => {
    setSprites((prev) => {
      const now = Date.now();
      const next = wanted.map((w) => {
        if (!arrived.current.has(w.id)) arrived.current.set(w.id, now + 60);
        return w;
      });
      // Agents whose card is finished walk back to their gauge, then disappear.
      for (const p of prev) {
        if (!next.some((n) => n.id === p.id)) {
          next.push({ ...p, leaving: true, asking: false });
          setTimeout(() => {
            setSprites((s) => s.filter((x) => !(x.id === p.id && x.leaving)));
            arrived.current.delete(p.id);
          }, WALK_MS + 100);
        }
      }
      return next.filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  // Re-measure: cards move, the page scrolls, agents arrive.
  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setInstant(true);
      setFrame((f) => f + 1);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => setInstant(false), 120);
    };
    const id = setInterval(() => setFrame((f) => f + 1), 250);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  const now = Date.now();
  return (
    <div className="agent-layer" aria-label="Agents at work">
      {sprites.map((s) => {
        const dock = rectOf(`[data-dock="${s.agentId}"]`);
        const card = rectOf(`[data-card="${s.cardId}"]`);
        const start = arrived.current.get(s.id) ?? 0;
        const atDock = s.leaving || now < start || !card;
        let x: number;
        let y: number;
        if (atDock) {
          if (!dock) return null;
          x = dock.left + 2;
          y = dock.top - 4;
        } else {
          x = card!.right - SIZE - 6 - s.seat * (SIZE - 4);
          y = card!.bottom - SIZE * 1.15 + 6;
        }
        const walking = s.leaving || now < start + WALK_MS;
        const mood = walking ? "walking" : s.asking ? "asking" : "working";
        const hidden = s.leaving && now > start && !dock;
        return (
          <button
            key={s.id}
            className={`sprite ${instant ? "instant" : ""} ${atDock && !s.leaving ? "at-dock" : ""}`}
            style={{ transform: `translate(${x}px, ${y}px)`, opacity: hidden ? 0 : 1, transitionDuration: instant ? "0ms" : `${WALK_MS}ms` }}
            onClick={() => !s.leaving && onOpen(s.cardId, s.id)}
            title={`${s.name}${s.clone > 1 ? ` #${s.clone}` : ""}: click to see what it does`}
          >
            <Avatar color={s.color} icon={s.icon} size={SIZE} clone={s.clone} mood={mood} />
          </button>
        );
      })}
    </div>
  );
}
