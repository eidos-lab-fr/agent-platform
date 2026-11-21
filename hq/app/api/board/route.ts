import { NextResponse } from "next/server";
import { failure, guard } from "@/lib/route-guard";
import { getBoard, runBoardAction, type GitHubAction } from "@/lib/board/github-sync";

export const dynamic = "force-dynamic";

const TYPES = new Set(["addIdea", "setSpec", "approveSpec", "plan", "launch", "override", "setZones", "answer", "ask", "ship", "requestChange", "delete", "setTeam", "saveTeam", "deleteTeam", "addProject"]);

/** The board read from GitHub. In demo mode the board lives in the browser: nothing to send. */
export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  if (!g.session) return NextResponse.json({ ok: true, mode: "demo" });
  try {
    return NextResponse.json({ ok: true, mode: "github", login: g.session.login, state: await getBoard(g.session) });
  } catch (e) {
    return failure(e);
  }
}

/** One move of the board, run on GitHub with your token. */
export async function POST(req: Request) {
  const g = await guard(req, { write: true });
  if ("error" in g) return g.error;
  if (!g.session) return NextResponse.json({ ok: false, message: "Demo: the board runs in your browser." }, { status: 400 });
  const a = (await req.json().catch(() => null)) as GitHubAction | null;
  if (!a || typeof a !== "object" || !TYPES.has(a.type)) return NextResponse.json({ ok: false, message: "Unknown move." }, { status: 400 });
  for (const k of ["title", "need", "text"] as const) {
    const v = (a as Record<string, unknown>)[k];
    if (v !== undefined && (typeof v !== "string" || v.length > 8000)) return NextResponse.json({ ok: false, message: `Invalid ${k}.` }, { status: 400 });
  }
  if ((a.type === "answer" || a.type === "ask" || a.type === "requestChange") && !a.text.trim()) return NextResponse.json({ ok: false, message: "The message is empty." }, { status: 400 });
  try {
    const r = await runBoardAction(g.session, a);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return failure(e);
  }
}
