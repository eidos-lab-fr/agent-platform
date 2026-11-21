// How Agent HQ gets a GitHub token.
//
// - local (default on your machine): the token of the GitHub CLI (`gh auth token`) or GITHUB_TOKEN.
//   No OAuth App, no session secret, no callback URL. The server only answers on 127.0.0.1.
// - oauth (hosted): a GitHub OAuth App; the token is sealed in an httpOnly cookie.
// - demo: a simulated world, when no token can be found, or with HQ_AUTH=demo.
//
// Either way Agent HQ acts with *your* token: agent-platform workflows only start when the sender
// is an allowed user.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config, hasOAuth } from "./config";
import { getSession, type Session } from "./session";

export type AuthMode = "local" | "oauth" | "demo";

export interface AuthState {
  mode: AuthMode;
  /** Why the app is not fully set up, in words for the user. Null when everything is fine. */
  problem: string | null;
  /** How to fix it, as a command or a step. */
  fix: string | null;
}

const run = promisify(execFile);

interface LocalIdentity {
  token: string;
  login: string;
  scopes: string[];
}

let local: { at: number; value: Promise<LocalIdentity | { error: string; fix: string }> } | null = null;
const LOCAL_TTL = 5 * 60_000;

async function cliToken(): Promise<string | null> {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  try {
    const { stdout } = await run("gh", ["auth", "token"], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveLocal(): Promise<LocalIdentity | { error: string; fix: string }> {
  const token = await cliToken();
  if (!token) {
    return {
      error: "No GitHub token found: the GitHub CLI is not installed or not signed in.",
      fix: "Install the GitHub CLI (https://cli.github.com), run `gh auth login -s repo,workflow`, then reload this page.",
    };
  }
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "agent-hq" },
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { error: "GitHub could not be reached.", fix: "Check your connection, then reload this page." };
  if (res.status === 401) return { error: "The GitHub CLI token has expired.", fix: "Run `gh auth login -s repo,workflow`, then reload this page." };
  if (!res.ok) return { error: `GitHub answered ${res.status} when checking your token.`, fix: "Run `npm run doctor` for details." };
  const login = ((await res.json()) as { login?: string }).login ?? "";
  // Fine-grained tokens send no scope header: they are checked when used.
  const header = res.headers.get("x-oauth-scopes");
  const scopes = (header ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (header !== null && !scopes.includes("repo")) {
    return { error: "Your GitHub token cannot write to repos (the `repo` scope is missing).", fix: "Run `gh auth refresh -s repo,workflow`, then reload this page." };
  }
  return { token, login, scopes };
}

function localIdentity() {
  if (!local || Date.now() - local.at > LOCAL_TTL) {
    const value = resolveLocal();
    local = { at: Date.now(), value };
    // A failure is retried on the next request instead of being cached for five minutes.
    value.then((v) => {
      if ("error" in v) local = null;
    });
  }
  return local.value;
}

/** Which mode the app runs in, and what is missing if it is not fully set up. */
export async function authState(): Promise<AuthState> {
  const forced = config.auth;
  if (forced === "demo") return { mode: "demo", problem: null, fix: null };
  const partialOAuth = Boolean(config.clientId) !== Boolean(config.clientSecret);
  if (forced === "oauth" || (forced === "auto" && (hasOAuth() || partialOAuth))) {
    if (!hasOAuth()) {
      return {
        mode: "oauth",
        problem: `The GitHub OAuth App is half configured: ${config.clientId ? "GITHUB_CLIENT_SECRET" : "GITHUB_CLIENT_ID"} is empty.`,
        fix: "Fill it in .env.local, or remove both GITHUB_CLIENT_* lines to sign in with the GitHub CLI instead.",
      };
    }
    if (!config.allowedLogins.length) {
      return { mode: "oauth", problem: "ALLOWED_LOGINS is empty, so nobody can sign in.", fix: "Set ALLOWED_LOGINS=<your GitHub login> in .env.local." };
    }
    return { mode: "oauth", problem: null, fix: null };
  }
  const id = await localIdentity();
  if ("error" in id) return { mode: "demo", problem: id.error, fix: id.fix };
  return { mode: "local", problem: null, fix: null };
}

/** The signed-in user, or null (demo mode, or OAuth without a session). */
export async function currentSession(): Promise<Session | null> {
  const state = await authState();
  if (state.mode === "oauth") return state.problem ? null : getSession();
  if (state.mode === "local") {
    const id = await localIdentity();
    if ("error" in id) return null;
    return { login: id.login, token: id.token, exp: Number.MAX_SAFE_INTEGER };
  }
  return null;
}

/**
 * Public origin of the app: APP_URL if set (hosted behind a proxy), else the Host the browser
 * used. Whatever port Next picked, the origin check and the OAuth callback then match it.
 */
export function appOrigin(req: Request): string {
  if (config.appUrl) return new URL(config.appUrl).origin;
  const url = new URL(req.url);
  const host = req.headers.get("host");
  return host ? `${url.protocol}//${host}` : url.origin;
}

/** For tests. */
export function resetLocalIdentity() {
  local = null;
}
