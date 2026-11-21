import { NextResponse } from "next/server";
import { failure, guard } from "@/lib/route-guard";
import { addableRepos } from "@/lib/board/github-sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  if (!g.session) return NextResponse.json({ ok: true, repos: [] });
  try {
    return NextResponse.json({ ok: true, repos: await addableRepos(g.session) });
  } catch (e) {
    return failure(e);
  }
}
