import { NextResponse } from "next/server";
import { aiSettings, completeJson, PROVIDERS, type ProviderId } from "@/lib/ai";
import { failure, guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

const SCHEMA = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };

/** Sends one tiny question to a provider, to check that it answers. */
export async function POST(req: Request) {
  const g = await guard(req, { write: true });
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { provider?: ProviderId } | null;
  const provider = body?.provider;
  if (!provider || !PROVIDERS.includes(provider)) return NextResponse.json({ ok: false, message: "Unknown provider." }, { status: 400 });
  if (provider === "rules") return NextResponse.json({ ok: true, message: "Rules always work." });
  if (provider === "claude-code" && g.mode === "oauth") return NextResponse.json({ ok: false, message: "Only when HQ runs on your computer." }, { status: 400 });
  const started = Date.now();
  try {
    const r = (await completeJson(provider, await aiSettings(), { system: "Answer in JSON.", user: 'Reply with {"answer":"ok"}.', schema: SCHEMA })) as { answer?: string };
    return NextResponse.json({ ok: true, message: `Answered “${String(r.answer ?? "").slice(0, 40)}” in ${((Date.now() - started) / 1000).toFixed(1)} s.` });
  } catch (e) {
    return failure(e);
  }
}
