import { NextResponse } from "next/server";
import { isDemo } from "@/lib/config";
import { getSession } from "@/lib/session";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session && !isDemo()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await getWorld(session));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
