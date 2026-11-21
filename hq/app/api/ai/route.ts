import { NextResponse } from "next/server";
import { aiSettings, pickProvider, providerStatus, resetCliCache, saveAiSettings, type SettingsPatch } from "@/lib/ai";
import { failure, guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

/** What each provider needs, which one is used, and whether you may change it from here. */
export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  resetCliCache();
  const hosted = g.mode === "oauth";
  const s = await aiSettings();
  const [providers, active] = await Promise.all([providerStatus(s, { hosted }), pickProvider(s, { hosted })]);
  return NextResponse.json({ ok: true, choice: s.provider, active, providers, ollamaUrl: s.ollamaUrl, editable: !hosted });
}

/** Saves the settings to .hq/ai.json. Only when HQ runs on your computer: keys never leave it. */
export async function PUT(req: Request) {
  const g = await guard(req, { write: true });
  if ("error" in g) return g.error;
  if (g.mode === "oauth") return NextResponse.json({ ok: false, message: "On a hosted HQ, set the keys in the server environment." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as SettingsPatch | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, message: "Nothing to save." }, { status: 400 });
  try {
    await saveAiSettings(body);
    return NextResponse.json({ ok: true, message: "Saved." });
  } catch (e) {
    return failure(e);
  }
}
