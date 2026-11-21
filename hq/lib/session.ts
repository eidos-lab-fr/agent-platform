// Session encrypted in a cookie (AES-256-GCM). The GitHub token never leaves the server in clear.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const SESSION_COOKIE = "hq_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export interface Session {
  login: string;
  token: string;
  exp: number;
}

// Without SESSION_SECRET, a random key per server process: sessions end when the server restarts,
// which is fine on your machine. Set SESSION_SECRET on a hosted setup (`npm run setup` writes one).
const processSecret = randomBytes(32).toString("hex");
let warned = false;
const key = () => {
  if (!config.sessionSecret && !warned) {
    warned = true;
    console.warn("[agent-hq] SESSION_SECRET is not set: using a temporary key, you will be signed out when the server restarts.");
  }
  return createHash("sha256").update(config.sessionSecret || processSecret).digest();
};

export function seal(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal(value: string): Session | null {
  try {
    const buf = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    const s = JSON.parse(json) as Session;
    if (!s.login || !s.token || s.exp < Date.now()) return null;
    if (!config.allowedLogins.includes(s.login.toLowerCase())) return null;
    return s;
  } catch {
    return null;
  }
}

/** The OAuth session from the cookie (see lib/auth.ts for local mode). */
export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get(SESSION_COOKIE);
  return c ? unseal(c.value) : null;
}

export function sessionCookie(login: string, token: string, secure: boolean) {
  return {
    name: SESSION_COOKIE,
    value: seal({ login, token, exp: Date.now() + MAX_AGE * 1000 }),
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}
