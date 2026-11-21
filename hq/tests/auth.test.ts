import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub } from "./fake-github";

const KEYS = ["HQ_AUTH", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "ALLOWED_LOGINS", "GITHUB_TOKEN", "SESSION_SECRET"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

const load = () => import("@/lib/auth");

describe("auth mode", () => {
  it("uses the local token, with no OAuth App and no secret", async () => {
    process.env.GITHUB_TOKEN = "gho_local";
    fakeGitHub(() => ({ body: { login: "adrien" }, headers: { "x-oauth-scopes": "repo, workflow" } }));
    const { authState, currentSession } = await load();
    expect(await authState()).toEqual({ mode: "local", problem: null, fix: null });
    expect(await currentSession()).toMatchObject({ login: "adrien", token: "gho_local" });
  });

  it("says why it falls back to the demo when the token lacks the repo scope", async () => {
    process.env.GITHUB_TOKEN = "gho_local";
    fakeGitHub(() => ({ body: { login: "adrien" }, headers: { "x-oauth-scopes": "read:org" } }));
    const s = await (await load()).authState();
    expect(s.mode).toBe("demo");
    expect(s.problem).toMatch(/repo/);
    expect(s.fix).toMatch(/gh auth refresh/);
  });

  it("reports a half configured OAuth App instead of showing the demo", async () => {
    process.env.GITHUB_CLIENT_ID = "abc";
    const s = await (await load()).authState();
    expect(s.mode).toBe("oauth");
    expect(s.problem).toMatch(/GITHUB_CLIENT_SECRET/);
  });

  it("no longer needs SESSION_SECRET for OAuth", async () => {
    process.env.GITHUB_CLIENT_ID = "abc";
    process.env.GITHUB_CLIENT_SECRET = "def";
    process.env.ALLOWED_LOGINS = "adrien";
    expect((await (await load()).authState()).problem).toBeNull();
  });

  it("can be forced into the demo", async () => {
    process.env.HQ_AUTH = "demo";
    process.env.GITHUB_TOKEN = "gho_local";
    expect((await (await load()).authState()).mode).toBe("demo");
  });

  it("takes the public origin from the request when APP_URL is not set", async () => {
    const { appOrigin } = await load();
    expect(appOrigin(new Request("http://127.0.0.1:4318/api/actions"))).toBe("http://127.0.0.1:4318");
  });
});
