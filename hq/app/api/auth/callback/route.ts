import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { sessionCookie } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("hq_oauth_state")?.value;
  const fail = (reason: string) => NextResponse.redirect(`${config.appUrl}/?erreur=${encodeURIComponent(reason)}`);
  if (!code || !state || state !== expected) return fail("Connexion GitHub refusée (état invalide).");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${config.appUrl}/api/auth/callback`,
    }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) return fail("GitHub n'a pas renvoyé de jeton.");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "agent-hq" },
  });
  const login = ((await userRes.json()) as { login?: string }).login;
  if (!login || !config.allowedLogins.includes(login.toLowerCase())) {
    return fail("Ce compte GitHub n'est pas autorisé sur ce QG.");
  }
  const res = NextResponse.redirect(`${config.appUrl}/`);
  res.cookies.set(sessionCookie(login, token));
  res.cookies.delete("hq_oauth_state");
  return res;
}
