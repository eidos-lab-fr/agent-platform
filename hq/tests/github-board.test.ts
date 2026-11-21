import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardsToLaunch, deriveBoard, parseBody, renderBody, type RepoBoardData } from "@/lib/board/github-board";
import { clearEtags } from "@/lib/github";
import { fakeGitHub, type Call } from "./fake-github";

const R = "eidos-lab-fr/notula";
const T = "2026-11-20T10:00:00Z";
const NOW = Date.parse("2026-11-21T10:00:00Z");
const issue = (number: number, title: string, labels: string[], body = "", extra: object = {}) => ({
  number,
  title,
  html_url: `https://github.com/${R}/issues/${number}`,
  body,
  state: "open" as const,
  labels: labels.map((name) => ({ name })),
  created_at: T,
  updated_at: T,
  closed_at: null,
  ...extra,
});
const repo = (over: Partial<RepoBoardData> = {}): RepoBoardData => ({ repo: R, scopes: ["front"], issues: [], pulls: [], runs: [], jobs: {}, lastComments: {}, comments: {}, ...over });
const plan = (files: string[]) => ({ zones: ["front" as const], files: { front: files }, steps: [{ zone: "front" as const, text: "Build it" }], override: null });

describe("issue body", () => {
  it("keeps need, spec and plan through a round trip, in sections the agent reads", () => {
    const body = renderBody("Tags on notes.", { summary: "Colored tags.", criteria: ["A tag has a color", "Tags show on the note"], outOfScope: "Folders" }, plan(["src/Tag.tsx"]), "claude-code");
    expect(body).toContain("### Critères d'acceptation\n\n- A tag has a color");
    expect(body).toContain("### Plan de développement (Agent HQ)");
    const p = parseBody(body);
    expect(p.need).toBe("Tags on notes.");
    expect(p.spec).toEqual({ summary: "Colored tags.", criteria: ["A tag has a color", "Tags show on the note"], outOfScope: "Folders" });
    expect(p.engine).toBe("claude-code");
    expect(p.plan?.files.front).toEqual(["src/Tag.tsx"]);
  });

  it("reads an issue written with the agent-platform form", () => {
    const p = parseBody("### Chemin de la spec\n\ndocs/x.md\n\n### Ce que ce ticket couvre\n\nPDF export.\n\n### Critères d'acceptation\n\n- [ ] A PDF downloads\n- [ ] It has the title\n\n### Hors périmètre\n\n_No response_");
    expect(p.need).toBe("PDF export.");
    expect(p.spec?.criteria).toEqual(["A PDF downloads", "It has the title"]);
    expect(p.spec?.outOfScope).toBe("");
  });
});

describe("board from GitHub", () => {
  it("puts each issue in its column", () => {
    const s = deriveBoard(
      [
        repo({
          issues: [
            issue(1, "Idea", []),
            issue(2, "Spec", ["hq:specified"]),
            issue(3, "Plan", ["hq:planned"], renderBody("x", null, plan(["a.tsx"]))),
            issue(4, "Wait", ["hq:waiting"], renderBody("x", null, plan(["b.tsx"]))),
            issue(5, "Run", ["ready-for-dev"]),
            issue(6, "Ask", ["ready-for-dev", "needs-human"]),
            issue(7, "PR", ["ready-for-dev"]),
            issue(8, "Old", [], "", { state: "closed", closed_at: "2026-10-01T00:00:00Z" }),
            issue(9, "Dropped", ["hq:idea"], "", { state: "closed", closed_at: T, state_reason: "not_planned" }),
          ],
          pulls: [{ number: 70, title: "PR", html_url: "https://github.com/pr/70", body: "Closes #7", state: "open", merged_at: null, created_at: T, head: { ref: "agent/7-pr" }, labels: [{ name: "review:ok" }] }],
          comments: { 6: [{ id: 1, body: "Mobile too?", created_at: T, user: { login: "github-actions[bot]", type: "Bot" } }] },
        }),
      ],
      { teams: [], teamOf: {} },
      "adrien",
      NOW,
    );
    const col = (n: number) => s.cards.find((c) => c.number === n)?.column;
    expect([1, 2, 3, 4, 5, 6, 7].map(col)).toEqual(["idea", "specified", "planned", "waiting", "in_progress", "in_progress", "review"]);
    expect(col(8)).toBeUndefined();
    expect(col(9)).toBeUndefined();
    const ask = s.cards.find((c) => c.number === 6)!;
    expect(ask.messages[0]).toMatchObject({ from: "agent", open: true, text: "Mobile too?" });
    expect(s.cards.find((c) => c.number === 5)!.live?.text).toBe("Queued on GitHub");
    expect(s.cards.find((c) => c.number === 7)!.pr).toMatchObject({ number: 70, verdict: "ok" });
    // Two Front cards at work: two clones.
    expect(s.cards.filter((c) => c.column === "in_progress").map((c) => c.workers[0].clone).sort()).toEqual([1, 2]);
  });

  it("launches a waiting card only when no card in progress touches its files", () => {
    const running = issue(1, "Tags", ["ready-for-dev"], renderBody("x", null, plan(["src/Note.tsx"])));
    const waiting = issue(2, "Tag colors", ["hq:waiting"], renderBody("x", null, plan(["src/Note.tsx"])));
    const free = issue(3, "Billing", ["hq:waiting"], renderBody("x", null, plan(["src/Billing.tsx"])));
    const s = deriveBoard([repo({ issues: [running, waiting, free] })], { teams: [], teamOf: {} }, "adrien", NOW);
    expect(cardsToLaunch(s).map((c) => c.number)).toEqual([3]);
    expect(s.cards.find((c) => c.number === 2)!.plan!.verdict).toMatchObject({ parallel: false, blockedBy: `${R}#1` });
    const after = deriveBoard([repo({ issues: [{ ...running, state: "closed", closed_at: T }, waiting] })], { teams: [], teamOf: {} }, "adrien", NOW);
    expect(cardsToLaunch(after).map((c) => c.number)).toEqual([2]);
  });
});

describe("moves on GitHub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearEtags();
  });

  it("takes an idea through spec, plan and launch, and starts the next card when the first is shipped", async () => {
    process.env.HQ_BOARD_FILE = join(await mkdtemp(join(tmpdir(), "hq-board-")), "board.json");
    const issues: ReturnType<typeof issue>[] = [];
    const base = `/repos/${R}`;
    const find = (n: number) => issues.find((i) => i.number === n)!;
    const { calls } = fakeGitHub((c: Call) => {
      const p = c.path.split("?")[0];
      if (p === "/orgs/eidos-lab-fr/repos") return { body: [{ full_name: R, archived: false }] };
      if (p === `${base}/contents/.github/workflows/agent-dev.yml`) return { body: {} };
      if (p === `${base}/contents/.github/agents`) return { body: [{ name: "dev-front.md" }] };
      if (p === `${base}/pulls`) return { body: [] };
      if (p === `${base}/actions/runs`) return { body: { workflow_runs: [] } };
      if (p === `${base}/labels`) return { status: 201, body: {} };
      if (p === `${base}/issues` && c.method === "GET") return { body: issues };
      if (p === `${base}/issues` && c.method === "POST") {
        const b = c.body as { title: string; body: string; labels: string[] };
        const i = issue(issues.length + 1, b.title, b.labels, b.body);
        issues.push(i);
        return { status: 201, body: i };
      }
      let m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(p);
      if (m && c.method === "GET") return { body: find(Number(m[1])) };
      if (m && c.method === "PATCH") {
        Object.assign(find(Number(m[1])), c.body);
        return { body: find(Number(m[1])) };
      }
      m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels(?:\/(.+))?$/.exec(p);
      if (m) {
        const i = find(Number(m[1]));
        if (c.method === "DELETE") {
          const name = decodeURIComponent(m[2]);
          if (!i.labels.some((l) => l.name === name)) return { status: 404 };
          i.labels = i.labels.filter((l) => l.name !== name);
          return { body: [] };
        }
        for (const name of (c.body as { labels: string[] }).labels) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
        return { body: [] };
      }
      if (/\/comments$/.test(p)) return { body: [] };
      return undefined;
    });
    const { runBoardAction, getBoard } = await import("@/lib/board/github-sync");
    const session = { login: "adrien", token: "tok", exp: Number.MAX_SAFE_INTEGER };
    const spec = { summary: "Tags", criteria: ["A tag has a color"], outOfScope: "", engine: "rules" as const };

    const walk = async (title: string) => {
      expect((await runBoardAction(session, { type: "addIdea", project: R, title, need: "On the note page", at: 0 })).ok).toBe(true);
      const id = `${R}#${issues.length}`;
      for (const a of [{ type: "setSpec", spec }, { type: "approveSpec" }, { type: "plan" }, { type: "launch" }] as const) {
        const r = await runBoardAction(session, { ...a, id, at: 0 } as never);
        expect(r.message).toBeTruthy();
        expect(r.ok).toBe(true);
      }
      return find(issues.length);
    };

    const first = await walk("Colored tags on notes");
    expect(first.labels.map((l) => l.name).sort()).toEqual(["ready-for-dev", "scope:front", "zone:front"]);
    expect(first.body).toContain("### Critères d'acceptation");
    expect(first.body).toContain("<!-- hq:");

    const second = await walk("Tag colors on the note list");
    expect(second.labels.map((l) => l.name)).toContain("hq:waiting");
    expect(second.labels.map((l) => l.name)).not.toContain("ready-for-dev");

    // The first one is shipped: the next look at the board starts the second.
    Object.assign(first, { state: "closed", closed_at: new Date().toISOString() });
    const { invalidateBoard } = await import("@/lib/board/github-sync");
    invalidateBoard("adrien");
    const board = await getBoard(session);
    expect(second.labels.map((l) => l.name)).toContain("ready-for-dev");
    expect(board.cards.find((c) => c.number === 2)!.column).toBe("in_progress");
    // Every write went through the user's own token.
    expect(calls.filter((c) => c.method !== "GET").every((c) => c.headers.authorization === "Bearer tok")).toBe(true);
  });
});
