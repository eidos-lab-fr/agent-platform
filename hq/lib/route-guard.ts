// Shared checks for the API routes.

import { NextResponse } from "next/server";
import { appOrigin, authState, currentSession, type AuthMode } from "./auth";
import type { Session } from "./session";

export type Guarded = { session: Session | null; mode: AuthMode };

/**
 * Session check, plus a CSRF origin check for requests that change things.
 * Returns the session (null in demo mode) or an error response.
 */
export async function guard(req: Request, opts: { write?: boolean } = {}): Promise<Guarded | { error: NextResponse }> {
  if (opts.write ?? req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin !== appOrigin(req)) {
      return { error: NextResponse.json({ ok: false, message: "Origin refused." }, { status: 403 }) };
    }
  }
  const { mode } = await authState();
  const session = await currentSession();
  if (!session && mode !== "demo") return { error: NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 }) };
  return { session, mode };
}

export function failure(e: unknown) {
  const status = (e as { status?: number }).status;
  return NextResponse.json({ ok: false, message: (e as Error).message }, { status: status && status >= 400 ? status : 500 });
}
