import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { config, isDemo } from "@/lib/config";

export async function GET() {
  if (isDemo()) return NextResponse.redirect(`${config.appUrl}/`);
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/callback`);
  // repo : lire et étiqueter les tickets, merger. workflow : lancer l'onboarding d'un repo.
  url.searchParams.set("scope", "repo workflow");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("hq_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: config.appUrl.startsWith("https://") });
  return res;
}
