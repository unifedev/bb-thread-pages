// The `RouteTable` under `base()` for both strategies (05 §Routes, R-S10; DESIGN §F.1, DR-17).
import type { RouteTable } from "../host/serving.ts";
import { attachRoute } from "./attach-route.ts";
import { bridgeRoute } from "./bridge-route.ts";
import { chromeActionRoute } from "./chrome-action-route.ts";
import type { Dispatcher, ServingContext } from "./context.ts";
import { documentRoute, prefixDocumentRoute } from "./document-route.ts";
import { documentSessionRoute } from "./document-session-route.ts";
import { homeDocumentRoute, homeRoute } from "./home-route.ts";
import { shellRoute } from "./shell-route.ts";
import { submitRoute } from "./submit-route.ts";
import { transcribeRoute } from "./transcribe-route.ts";
import { uploadRoute } from "./upload-route.ts";

/**
 * Every route, relative to `base()`. The document route is `/page/*` in the
 * prefix strategy (document-path tails only; the host's `files` route takes
 * the rest) and `/document` in the exact one, where it also serves the
 * carried strategy's file variant. 05 §Routes; DESIGN §F.1
 */
export function createRoutes(ctx: ServingContext, dispatcher: Dispatcher): RouteTable {
  const document = ctx.strategy.kind === "by-url" ? { method: "GET" as const, path: "/page/*", handler: prefixDocumentRoute(ctx) } : { method: "GET" as const, path: "/document", handler: documentRoute(ctx) };
  return [
    { method: "GET", path: "/page", handler: shellRoute(ctx) },
    document,
    { method: "GET", path: "/home", handler: homeRoute(ctx) },
    { method: "GET", path: "/home-document", handler: homeDocumentRoute(ctx) },
    { method: "POST", path: "/submit", handler: submitRoute(ctx) },
    { method: "POST", path: "/upload", handler: uploadRoute(ctx) },
    { method: "POST", path: "/bridge", handler: bridgeRoute(ctx, dispatcher) },
    { method: "POST", path: "/chrome-action", handler: chromeActionRoute(ctx) },
    { method: "POST", path: "/document-session", handler: documentSessionRoute(ctx) },
    { method: "POST", path: "/transcribe", handler: transcribeRoute(ctx) },
    { method: "POST", path: "/attach", handler: attachRoute(ctx) },
  ];
}
