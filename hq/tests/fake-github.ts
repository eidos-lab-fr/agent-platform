// A fake api.github.com for tests: records every call and answers from a route table.

import { vi } from "vitest";

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> };
type Route = (call: Call) => Answer | undefined;

export function fakeGitHub(route: Route) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const call: Call = {
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname + url.search,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
    };
    calls.push(call);
    const a = route(call) ?? { status: 404, body: { message: "Not Found" } };
    const status = a.status ?? 200;
    return new Response(status === 204 || status === 304 ? null : JSON.stringify(a.body ?? {}), { status, headers: a.headers });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}
