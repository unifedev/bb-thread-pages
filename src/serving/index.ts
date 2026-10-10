// createBbServingHost(bb): ServingHost over bb.http (DESIGN §C). `files` absent (R-S7 is core on bb, D-bb-4);
// `surface` absent (D-bb-18).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ServingHost } from "../../core/src/host/index.ts";
import { mountRoutes } from "./mount.ts";
import { createOrigin, createOwnOrigins } from "./origin.ts";

export function routeBase(pluginId: string): string {
  return `/api/v1/plugins/${pluginId}/http`;
}

export function createBbServingHost(bb: BbPluginApi): ServingHost {
  const base = routeBase(bb.pluginId);
  return {
    mount: (routes) => mountRoutes(bb, routes),
    base: () => base,
    origin: createOrigin(bb),
    ownOrigins: createOwnOrigins(bb),
  };
}
