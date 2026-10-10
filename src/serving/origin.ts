// origin(): the Connect status RPC → BB_APP_URL → the loopback origin (DESIGN §C.3, D-bb-16); ownOrigins()
// (§C.5). Only a remote answer is cached, so a link is never stale long after Connect comes up.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { asRecord } from "../provider/errors.ts";

const passThrough = { parse: (value: unknown) => value } as never;

export function createOrigin(bb: BbPluginApi, cacheMs = 30_000, now: () => number = Date.now): () => Promise<string | null> {
  let cached: { at: number; origin: string } | null = null;
  return async () => {
    if (cached && now() - cached.at < cacheMs) return cached.origin;
    const remote = (await connectOrigin(bb)) ?? appUrlOrigin(bb);
    cached = remote ? { at: now(), origin: remote } : null;
    return remote ?? loopbackOrigin(bb); // DR-29, 04 R6.7: the loopback URL where it reports none
  };
}

export async function connectStatus(bb: BbPluginApi): Promise<Record<string, unknown> | null> {
  try {
    return asRecord(await bb.sdk.plugins.callRpc({ pluginId: "connect", method: "status", input: null, outputSchema: passThrough }));
  } catch {
    return null; // Connect absent, disabled or unpaired: a normal local-only answer
  }
}

export async function connectOrigin(bb: BbPluginApi): Promise<string | null> {
  const status = await connectStatus(bb);
  return status && status.state === "connected" && typeof status.url === "string" ? originOf(status.url) : null;
}

/** `<handle>--<port>.getbb.app` for each shared port the Connect status lists, when it does (shape unverified: O-10). */
export function connectPortShareOrigins(status: Record<string, unknown> | null): string[] {
  const ports = status?.sharedPorts ?? status?.ports;
  return (Array.isArray(ports) ? ports : []).map((p) => asRecord(p)?.url).filter((u): u is string => typeof u === "string").map(originOf).filter((o): o is string => o !== null);
}

export function appUrlOrigin(bb: BbPluginApi): string | null {
  return originOf(bb.server.experimental_appUrl);
}

export function loopbackOrigin(bb: BbPluginApi): string | null {
  try {
    return originOf(bb.server.loopbackBaseUrl); // bind-gated: read inside the call, never at load
  } catch {
    return null;
  }
}

/** The loopback origin under each name the same server answers to: `127.0.0.1`, `localhost`, `[::1]` (BB-8). */
export function loopbackAliases(origin: string | null): string[] {
  if (!origin) return [];
  try {
    const url = new URL(origin);
    return [...new Set(["127.0.0.1", "localhost", "[::1]"].map((host) => `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`))];
  } catch {
    return [origin];
  }
}

export function createOwnOrigins(bb: BbPluginApi): () => Promise<string[]> {
  return async () => {
    const status = await connectStatus(bb);
    const connect = status && status.state === "connected" && typeof status.url === "string" ? originOf(status.url) : null;
    return [...new Set([...loopbackAliases(loopbackOrigin(bb)), appUrlOrigin(bb), connect, ...connectPortShareOrigins(status)].filter((o): o is string => o !== null))];
  };
}

export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
