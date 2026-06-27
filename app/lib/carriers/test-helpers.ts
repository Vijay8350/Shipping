import type { FetchImpl } from "./types";

/**
 * Build a stub `fetch` that returns recorded fixtures based on URL substring match
 * (CLAUDE.md §7: adapters are tested against recorded fixture responses, no network).
 */
export interface StubRoute {
  match: string; // substring of the URL
  status?: number;
  body: unknown; // object -> JSON, string -> raw
}

export function makeFetchStub(routes: StubRoute[]): {
  fetchImpl: FetchImpl;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      return new Response(JSON.stringify({ error: "no stub for " + url }), {
        status: 404,
      });
    }
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200 });
  }) as FetchImpl;

  return { fetchImpl, calls };
}
