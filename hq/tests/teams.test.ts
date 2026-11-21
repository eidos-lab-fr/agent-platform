import { describe, expect, it } from "vitest";
import { filesForRepo, mergeReviewFile, renderDevFile, renderReviewBlock } from "@/lib/team-deploy";
import { teamFromTemplate } from "@/lib/team-templates";
import { duplicateAgent, validateTeam, type Team } from "@/lib/teams";

function squad(): Team {
  const t = teamFromTemplate("web-app", "Squad");
  const [pixel, bolt] = t.agents;
  pixel.placements = [
    { repo: "o/notula", scope: "front" },
    { repo: "o/site", scope: "site" },
  ];
  bolt.placements = [{ repo: "o/notula", scope: "api" }];
  t.agents.find((a) => a.role === "securite")!.placements = [{ repo: "o/notula", scope: "securite" }];
  return t;
}

describe("team files", () => {
  it("writes dev files in the onboard.md format", () => {
    const t = squad();
    const md = renderDevFile(t, t.agents[0], "front");
    expect(md).toMatch(/^# Agent dev — front \(Pixel : /);
    expect(md).toContain("## Périmètre (seuls fichiers modifiables)\n\n- src/app/**");
    expect(md).toContain("## Points d'attention");
    expect(md).toContain("`.github/agents/team/pixel/skills/ui-conventions.md`");
    expect(md).toContain("`.github/agents/team/pixel/guardrails/small-diffs.md`");
  });

  it("places one trained agent on several islands", () => {
    const t = squad();
    const notula = filesForRepo(t, "o/notula").map((f) => f.path);
    const site = filesForRepo(t, "o/site").map((f) => f.path);
    expect(notula).toContain(".github/agents/dev-front.md");
    expect(notula).toContain(".github/agents/dev-api.md");
    expect(notula).toContain(".github/agents/review-securite.md");
    expect(site).toEqual([".github/agents/dev-site.md", ".github/agents/team/pixel/skills/ui-conventions.md", ".github/agents/team/pixel/guardrails/small-diffs.md"]);
  });

  it("keeps existing review rules and replaces only its own block", () => {
    const t = squad();
    const guard = t.agents.find((a) => a.role === "securite")!;
    const once = mergeReviewFile("# Règles du repo\n\n- Pas d'eval.\n", renderReviewBlock(t, guard));
    expect(once).toContain("- Pas d'eval.");
    guard.mission = "New mission";
    const twice = mergeReviewFile(once, renderReviewBlock(t, guard));
    expect(twice.match(/agent-hq:team:start/g)).toHaveLength(1);
    expect(twice).toContain("New mission");
    expect(twice).toContain("- Pas d'eval.");
  });
});

describe("validateTeam", () => {
  it("accepts a template and refuses two dev agents on one desk", () => {
    const t = squad();
    expect(validateTeam(t)).toBeNull();
    t.agents[1].placements = [{ repo: "o/notula", scope: "front" }];
    expect(validateTeam(t)).toMatch(/share the "front" desk/);
  });

  it("refuses file names that could escape the agent folder", () => {
    const t = squad();
    t.agents[0].skills.push({ name: "../../workflows/x.yml", content: "" });
    expect(validateTeam(t)).toMatch(/Invalid file name/);
  });

  it("duplicates an agent without its islands", () => {
    const a = squad().agents[0];
    const copy = duplicateAgent(a);
    expect(copy.id).not.toBe(a.id);
    expect(copy.placements).toEqual([]);
    expect(copy.skills).toEqual(a.skills);
  });
});
