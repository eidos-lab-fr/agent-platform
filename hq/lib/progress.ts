// XP, niveaux, séries et succès. Les points récompensent les quêtes livrées, jamais le nombre
// d'agents lancés : chaque lancement coûte des crédits Anthropic.

import type { Achievement, Progress, Quest, Repo } from "./types";

export const XP_MERGE = 100;
export const XP_FIRST_TRY = 50;
export const XP_QUEST = 10;

/** XP cumulée nécessaire pour atteindre un niveau (niveau 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 75 * (level - 1) * level;
}

export function levelOf(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Jour calendaire à Paris, au format AAAA-MM-JJ. */
export function parisDay(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Jours consécutifs avec au moins un merge, en finissant aujourd'hui ou hier. */
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
      a("premier-colis", "Premier colis", "Merger une première PR d'agent", merged.length, 1),
      a("sans-faute", "Sans faute", "5 PR mergées avec review:ok du premier coup", firstTry.length, 5),
      a("spec-de-cristal", "Spec de cristal", "10 quêtes livrées sans que l'agent lève la main", blockedNever.length, 10),
      a("dizaine", "Dizaine", "10 quêtes livrées", merged.length, 10),
      a("archipel", "Archipel", "3 repos branchés sur la plateforme", repos.length, 3),
      a("nuit-blanche", "Nuit blanche", "Une PR déposée par un agent entre minuit et 6 h", nightOwl.length, 1),
      a("serie", "En série", "Merger au moins une PR 5 jours d'affilée", streakDays, 5),
    ],
  };
}
