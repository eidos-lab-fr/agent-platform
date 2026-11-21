import { describe, expect, it } from "vitest";
import { levelOf, streakOf, xpForLevel } from "@/lib/progress";

describe("levels", () => {
  it("levels up at the thresholds", () => {
    expect(levelOf(0)).toBe(1);
    expect(xpForLevel(2)).toBe(150);
    expect(levelOf(149)).toBe(1);
    expect(levelOf(150)).toBe(2);
    expect(levelOf(450)).toBe(3);
  });
});

describe("streak", () => {
  const now = new Date("2026-11-21T15:00:00Z");
  it("counts consecutive days in Paris", () => {
    expect(streakOf(["2026-11-21T09:00:00Z", "2026-11-20T09:00:00Z", "2026-11-19T22:30:00Z"], now)).toBe(3);
  });
  it("keeps the streak if the last merge was yesterday", () => {
    expect(streakOf(["2026-11-20T09:00:00Z"], now)).toBe(1);
  });
  it("breaks the streak after a day without a merge", () => {
    expect(streakOf(["2026-11-19T09:00:00Z"], now)).toBe(0);
  });
});
