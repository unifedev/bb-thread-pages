import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createDispatcher } from "./bridge/dispatcher.ts";
import { ALL_HANDLERS } from "./bridge/handlers/index.ts";
import { bridgeRoute } from "./bridge-route.ts";
import type { ServingContext } from "./context.ts";
import { documentRoute } from "./document-route.ts";
import { homeRoute } from "./home-route.ts";
import { shellRoute } from "./shell-route.ts";
import { submitRoute } from "./submit-route.ts";
import { uploadRoute } from "./upload-route.ts";

/**
 * The route table. spec 02 §Routes
 *
 * Every route uses the host's "local" auth: the reader's existing session
 * with bb, plus the action token where an effect is possible.
 */
export function registerRoutes(bb: BbPluginApi, serving: ServingContext): void {
  const dispatch = createDispatcher(serving, ALL_HANDLERS);
  bb.http.route("GET", "/page", shellRoute(serving), { auth: "local" });
  bb.http.route("GET", "/document", documentRoute(serving), { auth: "local" });
  bb.http.route("GET", "/home", homeRoute(serving), { auth: "local" });
  bb.http.route("POST", "/submit", submitRoute(serving), { auth: "local" });
  bb.http.route("POST", "/upload", uploadRoute(serving), { auth: "local" });
  bb.http.route("POST", "/bridge", bridgeRoute(dispatch), { auth: "local" });
}
