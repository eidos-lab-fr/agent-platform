// Live stream (Server-Sent Events): the world is sent again whenever it changes.
// GitHub is polled every 10 s while an agent is at work, every 30 s otherwise, to keep
// well under the 5,000 requests per hour of your token.

import { guard } from "@/lib/route-guard";
import { getWorld, isBusy } from "@/lib/world";

export const dynamic = "force-dynamic";

const BUSY = 10_000;
const QUIET = 30_000;
const DEMO = 2_000;

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { session, mode } = g;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const send = (event: string, data: string) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      const tick = async () => {
        if (closed) return;
        let interval = session ? QUIET : DEMO;
        try {
          const world = await getWorld(session, mode);
          if (session && isBusy(world)) interval = BUSY;
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
