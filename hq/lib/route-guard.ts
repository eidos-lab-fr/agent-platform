// Shared checks for the JSON routes that change things.

import { NextResponse } from "next/server";
import { config, isDemo } from "./config";
import { getSession, type Session } from "./session";

/** CSRF origin check plus session. Returns the session (null in demo mode) or an error response. */
export async function guard(req: Request): Promise<{ session: Session | null } | { error: NextResponse }> {
  const origin = req.headers.get("origin");
  if (!isDemo() && origin !== new URL(config.appUrl).origin) {
    return { error: NextResponse.json({ ok: false, message: "Origin refused." }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session && !isDemo()) return { error: NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 }) };
  return { session };
}

export function failure(e: unknown) {
  const status = (e as { status?: number }).status;
  return NextResponse.json({ ok: false, message: (e as Error).message }, { status: status && status >= 400 ? status : 500 });
}
