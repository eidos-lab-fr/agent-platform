import { afterEach, describe, expect, it, vi } from "vitest";
import { runAction } from "@/lib/actions";
import { clearEtags } from "@/lib/github";
import { fakeGitHub } from "./fake-github";

const session = { login: "adrien", token: "t0ken", exp: Number.MAX_SAFE_INTEGER };

afterEach(() => {
  vi.unstubAllGlobals();
  clearEtags();
});

describe("actions on GitHub", () => {
  it("answers a blocked agent with a comment, then restarts it", async () => {
    const { calls } = fakeGitHub((c) => (c.method === "DELETE" ? { status: 204 } : { body: {} }));
    const r = await runAction(session, { type: "answer", repo: "o/notula", number: 12, text: " Use the A4 format " });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /repos/o/notula/issues/12/comments",
      "DELETE /repos/o/notula/issues/12/labels/needs-human",
      "DELETE /repos/o/notula/issues/12/labels/ready-for-dev",
      "POST /repos/o/notula/issues/12/labels",
    ]);
    expect((calls[0].body as { body: string }).body).toMatch(/^Use the A4 format\n/);
    // The issue body is no longer rewritten.
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(calls[3].body).toEqual({ labels: ["ready-for-dev"] });
  });

  it("launches with the desk label first", async () => {
    const { calls } = fakeGitHub((c) => (c.method === "DELETE" ? { status: 404 } : { body: {} }));
    await runAction(session, { type: "launch", repo: "o/notula", number: 3, scope: "front" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /repos/o/notula/issues/3/labels",
      "DELETE /repos/o/notula/issues/3/labels/ready-for-dev",
      "POST /repos/o/notula/issues/3/labels",
    ]);
    expect(calls[0].body).toEqual({ labels: ["scope:front"] });
  });

  it("refuses to merge without review:ok", async () => {
    const { calls } = fakeGitHub(() => ({ body: { labels: [{ name: "review:changes" }], head: { ref: "agent/3-x" }, title: "X" } }));
    const r = await runAction(session, { type: "merge", repo: "o/notula", prNumber: 9 });
    expect(r.ok).toBe(false);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("refuses to merge a branch that is not an agent's", async () => {
    fakeGitHub(() => ({ body: { labels: [{ name: "review:ok" }], head: { ref: "feature/x" }, title: "X" } }));
    expect((await runAction(session, { type: "merge", repo: "o/notula", prNumber: 9 })).ok).toBe(false);
  });
});
