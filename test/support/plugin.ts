import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createPlugin } from "../../src/plugin.ts";
import type { ServingContext } from "../../src/serving/context.ts";
import { createFakeHost, type FakeHostState } from "./fake-host.ts";

export const ROUTE_BASE = "/api/v1/plugins/thread-pages/http";

export interface PluginFixture {
  bb: ReturnType<typeof createFakePluginHost>["bb"];
  harness: ReturnType<typeof createFakePluginHost>["harness"];
  state: FakeHostState;
  serving: ServingContext;
  clock: { now: number };
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
  cli(argv: string[], threadId?: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  dispose(): Promise<void>;
}

export async function loadPlugin(settings: Record<string, string | number | boolean> = {}): Promise<PluginFixture> {
  const fake = createFakePluginHost({ pluginId: "thread-pages", settings });
  const { host, state } = createFakeHost();
  const clock = { now: 1_700_000_000_000 };
  const serving = await createPlugin(fake.bb, { host, now: () => clock.now });
  return {
    bb: fake.bb,
    harness: fake.harness,
    state,
    serving,
    clock,
    // The fake host routes by the path under the plugin's base; links the plugin emits carry the base.
    get: (path, headers) => fake.harness.behavior.fetchHttp("GET", subPath(path), headers ? { headers } : undefined),
    post: (path, body) =>
      fake.harness.behavior.fetchHttp("POST", subPath(path), {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    cli: async (argv, threadId) => {
      const result = await fake.harness.behavior.runCli(argv, threadId ? { threadId } : {});
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },
    dispose: () => fake.harness.lifecycle.dispose(),
  };
}

function subPath(path: string): string {
  return path.startsWith(ROUTE_BASE) ? path.slice(ROUTE_BASE.length) : path;
}

export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Test page</title></head>
<body><h1>Test page</h1>
<form data-title="Test form"><label>Anything<textarea name="anything"></textarea></label><button name="action" value="Go">Go</button></form>
</body></html>`;
