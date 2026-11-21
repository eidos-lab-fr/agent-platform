import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import { sessionCookie } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("hq_oauth_state")?.value;
  const origin = appOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?error=${encodeURIComponent(reason)}`);
  if (!code || !state || state !== expected) return fail("GitHub sign-in refused (invalid state).");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) return fail("GitHub did not return a token.");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "agent-hq" },
  });
  const login = ((await userRes.json()) as { login?: string }).login;
  if (!login || !config.allowedLogins.includes(login.toLowerCase())) {
    return fail("This GitHub account is not allowed in this HQ.");
  }
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set(sessionCookie(login, token, origin.startsWith("https://")));
  res.cookies.delete("hq_oauth_state");
  return res;
}
