import { NextResponse } from "next/server";
import { runAction, runDemoAction, validate, type Action } from "@/lib/actions";
import { GitHubError } from "@/lib/github";
import { guard } from "@/lib/route-guard";
import { invalidateWorld } from "@/lib/world";

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const action = (await req.json().catch(() => null)) as Action | null;
  const problem = validate(action as Action);
  if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });
  if (!g.session) return NextResponse.json(runDemoAction(action!));
  try {
    const result = await runAction(g.session, action!);
    invalidateWorld(g.session.login);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: status >= 400 ? status : 500 });
  }
}
