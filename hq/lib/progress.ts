// XP, levels, streaks and achievements. Points reward completed quests, never the number
// of agents launched: every launch costs Anthropic credits.

import type { Achievement, Progress, Quest, Repo } from "./types";

export const XP_MERGE = 100;
export const XP_FIRST_TRY = 50;
export const XP_QUEST = 10;

/** Total XP needed to reach a level (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 75 * (level - 1) * level;
}

export function levelOf(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Calendar day in Paris, as YYYY-MM-DD. */
export function parisDay(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days with at least one merge, ending today or yesterday. */
export function streakOf(mergeDates: string[], now: Date = new Date()): number {
  const days = new Set(mergeDates.map(parisDay));
  let day = parisDay(now);
  if (!days.has(day)) day = previousDay(day);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

function parisHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date(iso)),
  );
}

export function computeProgress(quests: Quest[], repos: Repo[], now: Date = new Date()): Progress {
  const merged = quests.filter((q) => q.pr?.state === "merged" && q.pr.mergedAt);
  const firstTry = merged.filter((q) => q.pr?.verdict === "ok");
  const nightOwl = merged.filter((q) => {
    const h = parisHour(q.pr!.createdAt);
    return h >= 0 && h < 6;
  });
  const blockedNever = merged.filter((q) => !q.labels.includes("needs-human"));
  const xp = quests.length * XP_QUEST + merged.length * XP_MERGE + firstTry.length * XP_FIRST_TRY;
  const level = levelOf(xp);
  const streakDays = streakOf(merged.map((q) => q.pr!.mergedAt!), now);

  const a = (id: string, name: string, description: string, progress: number, goal: number): Achievement => ({
    id,
    name,
    description,
    progress: Math.min(progress, goal),
    goal,
    unlocked: progress >= goal,
  });

  return {
    xp,
    level,
    xpIntoLevel: xp - xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1) - xpForLevel(level),
    merged: merged.length,
    firstTry: firstTry.length,
    streakDays,
    achievements: [
      a("first-parcel", "First parcel", "Merge your first agent PR", merged.length, 1),
      a("flawless", "Flawless", "Merge 5 PRs that got review:ok on the first try", firstTry.length, 5),
      a("crystal-spec", "Crystal spec", "Complete 10 quests without an agent raising its hand", blockedNever.length, 10),
      a("ten", "Into double digits", "Complete 10 quests", merged.length, 10),
      a("archipelago", "Archipelago", "Connect 3 repos to the platform", repos.length, 3),
      a("night-owl", "Night owl", "Get an agent PR between midnight and 6 AM", nightOwl.length, 1),
      a("streak", "On a roll", "Merge at least one PR 5 days in a row", streakDays, 5),
    ],
  };
}
