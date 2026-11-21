import { describe, expect, it } from "vitest";
import { levelOf, streakOf, xpForLevel } from "@/lib/progress";

describe("niveaux", () => {
  it("monte de niveau aux seuils", () => {
    expect(levelOf(0)).toBe(1);
    expect(xpForLevel(2)).toBe(150);
    expect(levelOf(149)).toBe(1);
    expect(levelOf(150)).toBe(2);
    expect(levelOf(450)).toBe(3);
  });
});

describe("série", () => {
  const now = new Date("2026-11-21T15:00:00Z");
  it("compte les jours consécutifs à Paris", () => {
    expect(streakOf(["2026-11-21T09:00:00Z", "2026-11-20T09:00:00Z", "2026-11-19T22:30:00Z"], now)).toBe(3);
  });
  it("garde la série si le dernier merge date d'hier", () => {
    expect(streakOf(["2026-11-20T09:00:00Z"], now)).toBe(1);
  });
  it("casse la série après un jour sans merge", () => {
    expect(streakOf(["2026-11-19T09:00:00Z"], now)).toBe(0);
  });
});
