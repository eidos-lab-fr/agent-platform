import { NextResponse } from "next/server";
import { failure, guard } from "@/lib/route-guard";
import { draftSpec } from "@/lib/spec-ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { prompt?: string; repo?: string; scopes?: string[] } | null;
  const prompt = body?.prompt?.trim() ?? "";
  if (prompt.length < 8) return NextResponse.json({ ok: false, message: "Describe the need in a sentence or two." }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ ok: false, message: "Keep it under 4,000 characters." }, { status: 400 });
  const scopes = (body?.scopes ?? []).filter((s) => typeof s === "string" && /^[\w-]{1,40}$/.test(s)).slice(0, 20);
  try {
    const draft = await draftSpec({ prompt, scopes, repo: String(body?.repo ?? "").slice(0, 100) }, { hosted: g.mode === "oauth" });
    return NextResponse.json({ ok: true, message: "", draft });
  } catch (e) {
    return failure(e);
  }
}
