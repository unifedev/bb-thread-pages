import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * The origin a reader can reach this bb at from anywhere: the Connect
 * plugin's public URL when paired, else the operator-configured app URL,
 * else nothing (local-only). Only a positive answer is cached, so a link is
 * never stale for long after Connect comes up. spec R6.7, R8.15
 */
export function createPublicOrigin(bb: BbPluginApi, cacheMs = 30_000): () => Promise<string | null> {
  let cached: { at: number; origin: string } | null = null;
  return async () => {
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.origin;
    const origin = (await connectOrigin(bb)) ?? configuredOrigin(bb);
    cached = origin ? { at: now, origin } : null;
    return origin;
  };
}

async function connectOrigin(bb: BbPluginApi): Promise<string | null> {
  try {
    const status = (await bb.sdk.plugins.callRpc({
      pluginId: "connect",
      method: "status",
      input: null,
      // Connect validates its own output; we read two fields.
      outputSchema: { parse: (value: unknown) => value } as never,
    })) as { state?: unknown; url?: unknown } | null;
    if (status && status.state === "connected" && typeof status.url === "string") {
      return new URL(status.url).origin;
    }
  } catch {
    // Connect absent, disabled or unpaired: a normal local-only answer.
  }
  return null;
}

function configuredOrigin(bb: BbPluginApi): string | null {
  try {
    const url = bb.server.experimental_appUrl;
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}
