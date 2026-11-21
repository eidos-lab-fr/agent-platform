// Without an OAuth App, Agent HQ acts with the GitHub CLI token of the machine it runs on:
// it must then only answer to that machine. The dev and start scripts bind to 127.0.0.1;
// this check also refuses requests whose Host is not a loopback name (DNS rebinding).

import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function middleware(req: NextRequest) {
  const oauth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) || process.env.HQ_AUTH === "oauth";
  if (oauth || process.env.HQ_AUTH === "demo") return NextResponse.next();
  if (!LOOPBACK.test(req.headers.get("host") ?? "")) {
    return new NextResponse("Agent HQ in local mode only answers on 127.0.0.1. Set up an OAuth App to host it.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = { runtime: "nodejs", matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
