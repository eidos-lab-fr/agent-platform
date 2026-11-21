import { NextResponse } from "next/server";
import { guard } from "@/lib/route-guard";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    return NextResponse.json(await getWorld(g.session, g.mode));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
