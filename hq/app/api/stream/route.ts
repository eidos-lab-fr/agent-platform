// Flux en direct (Server-Sent Events) : le monde est renvoyé dès qu'il change.

import { isDemo } from "@/lib/config";
import { getSession } from "@/lib/session";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session && !isDemo()) return new Response("Non connecté", { status: 401 });
  const interval = session ? 10_000 : 2_000;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const send = (event: string, data: string) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      const tick = async () => {
        if (closed) return;
        try {
          const world = await getWorld(session);
          const { generatedAt, ...rest } = world;
          const fingerprint = JSON.stringify(rest);
          if (fingerprint !== last) {
            last = fingerprint;
            send("world", JSON.stringify(world));
          } else {
            send("ping", generatedAt);
          }
        } catch (e) {
          send("problem", JSON.stringify({ message: (e as Error).message }));
        }
        timer = setTimeout(tick, interval);
      };
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      });
      await tick();
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
