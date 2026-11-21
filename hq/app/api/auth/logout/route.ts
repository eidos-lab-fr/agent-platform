import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const origin = appOrigin(req);
  // A form post from another site must not sign you out.
  if (req.headers.get("origin") !== origin) return NextResponse.json({ ok: false, message: "Origin refused." }, { status: 403 });
  const res = NextResponse.redirect(`${origin}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
