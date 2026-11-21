import { describe, expect, it } from "vitest";
import { worldToArcade } from "@/lib/arcade-adapter";
import { demoRawData } from "@/lib/demo";
import { assembleWorld } from "@/lib/world";

describe("worldToArcade", () => {
  const world = assembleWorld(demoRawData(), "demo", "demo");

  it("crée une pièce par repo avec ses cinq zones", () => {
    const snap = worldToArcade(world);
    expect(snap.rooms.map((r) => r.id)).toEqual(world.repos.map((r) => r.fullName));
    for (const room of snap.rooms) expect(room.zones.map((z) => z.slot)).toEqual(["main", "side", "corner", "bottom", "bottomCorner"]);
  });

  it("place chaque agent du repo une seule fois", () => {
    const snap = worldToArcade(world);
    const ids = snap.rooms.flatMap((r) =>
      r.zones.flatMap((z) => (z.kind === "desks" ? z.desks.flatMap((d) => d.agents) : z.kind === "agents" ? z.agents : [])).map((a) => a.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(world.agents.length);
  });

  it("filtre sur un repo", () => {
    const repo = world.repos[0].fullName;
    expect(worldToArcade(world, repo).rooms).toHaveLength(1);
  });
});
