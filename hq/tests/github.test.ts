import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEtags, gh } from "@/lib/github";
import { fakeGitHub } from "./fake-github";

afterEach(() => {
  vi.unstubAllGlobals();
  clearEtags();
});

describe("conditional requests", () => {
  it("sends the ETag back and reuses the cached body on 304", async () => {
    const { calls } = fakeGitHub((c) => (c.headers["if-none-match"] === '"v1"' ? { status: 304 } : { body: [{ number: 1 }], headers: { etag: '"v1"' } }));
    expect(await gh("tok", "/repos/o/r/issues")).toEqual([{ number: 1 }]);
    expect(await gh("tok", "/repos/o/r/issues")).toEqual([{ number: 1 }]);
    expect(calls[0].headers["if-none-match"]).toBeUndefined();
    expect(calls[1].headers["if-none-match"]).toBe('"v1"');
  });

  it("keeps the cache per token and never for writes", async () => {
    const { calls } = fakeGitHub(() => ({ body: {}, headers: { etag: '"v1"' } }));
    await gh("alice", "/x");
    await gh("bob", "/x");
    await gh("alice", "/x", { method: "POST", body: "{}" });
    expect(calls.map((c) => c.headers["if-none-match"])).toEqual([undefined, undefined, undefined]);
  });
});
