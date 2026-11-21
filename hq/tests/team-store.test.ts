import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEtags } from "@/lib/github";
import { githubStore } from "@/lib/team-store";
import { teamFromTemplate } from "@/lib/team-templates";
import { fakeGitHub } from "./fake-github";

afterEach(() => {
  vi.unstubAllGlobals();
  clearEtags();
});

describe("team storage", () => {
  it("saves on the hq-data branch, created from main, never on main", async () => {
    let branch = false;
    const { calls } = fakeGitHub((c) => {
      if (c.path.endsWith("/branches/hq-data")) return branch ? { body: {} } : { status: 404 };
      if (c.path === "/repos/eidos-lab-fr/agent-platform") return { body: { default_branch: "main" } };
      if (c.path.endsWith("/git/ref/heads/main")) return { body: { object: { sha: "abc" } } };
      if (c.method === "POST" && c.path.endsWith("/git/refs")) {
        branch = true;
        return { status: 201, body: {} };
      }
      if (c.method === "PUT") return { status: 201, body: {} };
      return undefined;
    });
    const team = teamFromTemplate("web-app", "Squad");
    await githubStore("tok").save(team);
    expect(calls.find((c) => c.path.endsWith("/git/refs"))?.body).toEqual({ ref: "refs/heads/hq-data", sha: "abc" });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe(`/repos/eidos-lab-fr/agent-platform/contents/teams/${team.id}.json`);
    expect((put.body as { branch: string }).branch).toBe("hq-data");
  });
});
