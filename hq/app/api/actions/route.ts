import { NextResponse } from "next/server";
import { runAction, runDemoAction, validate, type Action } from "@/lib/actions";
import { config, isDemo } from "@/lib/config";
import { GitHubError } from "@/lib/github";
import { getSession } from "@/lib/session";
import { invalidateWorld } from "@/lib/world";

export async function POST(req: Request) {
  // Protection CSRF : la requête doit venir de l'application elle-même.
  const origin = req.headers.get("origin");
  if (!isDemo() && origin !== new URL(config.appUrl).origin) {
    return NextResponse.json({ ok: false, message: "Origine refusée." }, { status: 403 });
  }
  const action = (await req.json().catch(() => null)) as Action | null;
  const problem = validate(action as Action);
  if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });

  const session = await getSession();
  if (!session) {
    if (isDemo()) return NextResponse.json(runDemoAction(action!));
    return NextResponse.json({ ok: false, message: "Non connecté." }, { status: 401 });
  }
  try {
    const result = await runAction(session, action!);
    invalidateWorld(session.login);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: status >= 400 ? status : 500 });
  }
}
