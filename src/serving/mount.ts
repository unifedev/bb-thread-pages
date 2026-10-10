// RouteTable → bb.http.route; Hono Context ↔ PagesRequest / PagesResponse (DESIGN §C.1). The one file where
// bb's request and response types appear. Exact-match routes only: `/*` entries are skipped (R-S10).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Context } from "hono";
import type { PagesRequest, PagesResponse, Route, RouteTable } from "../../core/src/host/index.ts";
import { readerOf } from "./reader.ts";

export function mountRoutes(bb: BbPluginApi, routes: RouteTable): void {
  for (const route of routes) {
    if (route.path.endsWith("/*")) continue; // the prefix strategy is off on bb; the core registers the query form beside it
    bb.http.route(route.method, route.path, async (c: Context) => toResponse(await route.handler(toRequest(c, route))), { auth: "local" });
  }
}

export function toRequest(c: Context, route: Pick<Route, "method" | "path">): PagesRequest {
  const url = new URL(c.req.url);
  let consumed = false;
  return {
    method: route.method,
    path: route.path,
    query: url.searchParams,
    headers: c.req.raw.headers, // as received: Host and X-Forwarded-* unaltered
    body: async () => {
      if (consumed) throw new Error("body read twice");
      consumed = true;
      return new Uint8Array(await c.req.raw.arrayBuffer());
    },
    reader: readerOf(),
  };
}

export function toResponse(r: PagesResponse): Response {
  return new Response(r.body as BodyInit | null, { status: r.status, headers: r.headers }); // every header is the server's (R-S9)
}
