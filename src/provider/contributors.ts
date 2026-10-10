// plugins.list + plugins.callRpc: `threadPagesContributions` / `threadPagesInvoke` (DESIGN §B.8, 07 §Discovery).
// The wire shape is byte-identical to 1.9.0's (R-X1); the namespace is the plugin id (R8.32).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ContributorAnswer, ContributorHost, ContributorWorkspace } from "../../core/src/host/index.ts";
import { asRecord, errorText, httpStatus, providerError, sdkCall } from "./errors.ts";

export const CONTRIBUTIONS_RPC = "threadPagesContributions";
export const INVOKE_RPC = "threadPagesInvoke";
const DECLARATION_TIMEOUT_MS = 5_000;

// callRpc only calls `parse` on the schema; the declaration is checked by the core.
const passThrough = { parse: (value: unknown) => value } as never;

export interface InstalledPluginRow { id: string; enabled: boolean; status: string }

export interface ContributorsDeps {
  log: { warn(message: string): void };
}

export function pluginRows(listed: unknown): InstalledPluginRow[] {
  const plugins = asRecord(listed)?.plugins;
  return (Array.isArray(plugins) ? plugins : [])
    .map(asRecord)
    .filter((p): p is Record<string, unknown> => p !== null && typeof p.id === "string")
    .map((p) => ({ id: p.id as string, enabled: p.enabled === true, status: typeof p.status === "string" ? p.status : "" }));
}

export function createBbContributors(bb: BbPluginApi, deps: ContributorsDeps): ContributorHost {
  const folders = new Map<string, { workspace: ContributorWorkspace | null; at: number }>();
  return {
    async list() {
      const plugins = pluginRows(await sdkCall("contributors.list", () => bb.sdk.plugins.list()));
      const candidates = plugins.filter((p) => p.id !== bb.pluginId && p.enabled && p.status === "running");
      const answers = await Promise.all(
        candidates.map(async (plugin) => {
          try {
            const declaration = await withTimeout(DECLARATION_TIMEOUT_MS, bb.sdk.plugins.callRpc({ pluginId: plugin.id, method: CONTRIBUTIONS_RPC, outputSchema: passThrough }));
            return { id: plugin.id, declaration: declaration as unknown };
          } catch (error) {
            // A 404 is a plugin that contributes nothing, the common case; anything else is worth the operator's eye.
            if (!is404(error)) deps.log.warn(`contributors: ${plugin.id} did not declare: ${errorText(error)}`);
            return null;
          }
        }),
      );
      return answers.filter((entry): entry is { id: string; declaration: unknown } => entry !== null);
    },

    async invoke(contributorId, call) {
      const answer = await sdkCall("contributors.invoke", () =>
        bb.sdk.plugins.callRpc({
          pluginId: contributorId,
          method: INVOKE_RPC,
          input: { method: call.method, params: call.params, caller: call.caller, requestId: call.requestId } as never,
          outputSchema: passThrough,
        }),
      );
      return contributorResultOf(answer);
    },

    // The thread's own working folder (its environment: a worktree or the checkout) on its enrolled machine, and its
    // project as the workspace id, as `sessions.get` reports it (U44). Held a few seconds: every contributed call asks.
    async workspaceOf(sessionId) {
      const held = folders.get(sessionId);
      if (held && Date.now() - held.at < WORKSPACE_HOLD_MS) return held.workspace;
      let thread: Record<string, unknown> | null;
      try {
        thread = asRecord(await bb.sdk.threads.get({ threadId: sessionId }));
      } catch (error) {
        const mapped = providerError(error, "contributors.workspaceOf");
        if (mapped.code === "not_found") return null;
        throw mapped;
      }
      const environmentId = typeof thread?.environmentId === "string" ? thread.environmentId : null;
      let workspace: ContributorWorkspace | null = null;
      if (environmentId) {
        let got: Record<string, unknown> | null;
        try {
          got = asRecord(await bb.sdk.environments.get({ environmentId }));
        } catch (error) {
          const mapped = providerError(error, "contributors.workspaceOf");
          if (mapped.code !== "not_found") throw mapped;
          got = null;   // a removed environment: no folder (07 R5.84b)
        }
        const environment = asRecord(got?.environment) ?? got;
        const path = typeof environment?.path === "string" && environment.path !== "" ? environment.path : null;
        const machine = typeof environment?.hostId === "string" && environment.hostId !== "" ? environment.hostId : null;
        if (path) workspace = { id: typeof thread?.projectId === "string" ? thread.projectId : "", path, machine };
      }
      folders.set(sessionId, { workspace, at: Date.now() });
      if (folders.size > 512) folders.delete(folders.keys().next().value!);
      return workspace;
    },
  };
}

/** How long a session's folder is held: a thread does not change environments under a running page. */
export const WORKSPACE_HOLD_MS = 10_000;

function is404(error: unknown): boolean {
  return httpStatus(error) === 404 || /\b404\b/.test(errorText(error));
}

function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function contributorResultOf(value: unknown): ContributorAnswer {
  const record = asRecord(value);
  if (record?.ok === true && "result" in record) return { ok: true, result: record.result };
  const error = asRecord(record?.error);
  if (record?.ok === false && error && typeof error.code === "string") {
    return {
      ok: false,
      error: {
        code: error.code,
        ...(typeof error.message === "string" ? { message: error.message } : {}),
        ...(typeof error.reason === "string" ? { reason: error.reason } : {}),
        ...("detail" in error ? { detail: error.detail } : {}),
      },
    };
  }
  return { ok: false, error: { code: "handler_error", message: "The contributor's answer has the wrong shape" } };
}
