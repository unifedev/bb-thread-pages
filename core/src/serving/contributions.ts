// `createContributions(host, options)`: the contributors as the server sees them — declarations re-read every `contributionsTtlMs`, one call bounded at `contributedCallMs`, failures mapped onto the fixed codes with declared reasons kept, `onChange` for the instruction, `rosterOf`, `combinedLookup`, `instructionFragments` (07 §The call, §Discovery per host, R5.41b, R5.47–R5.55; DESIGN §E.1 step 6, DR-33).
import type { AnyCapabilitySpec, CapabilityDescriptor } from "../domain/capabilities/contract.ts";
import { parseContributor, type ContributedSpec, type Contributor } from "../domain/capabilities/contributed.ts";
import { describe, type CapabilityLookup, type CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { PageError, PUBLIC_MESSAGES, errorText, isBridgeErrorCode } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { ContributorHost, ContributorWorkspace } from "../host/contributor.ts";
import type { Logger } from "../host/provider.ts";
import type { ContributionSet, Contributions } from "./stores.d.ts";

export const EMPTY_CONTRIBUTIONS: ContributionSet = Object.freeze({ contributors: Object.freeze([]), get: () => undefined });

export interface ContributionsOptions {
  log: Logger;
  now(): number;
  /** Defaults to `contributionsTtlMs`. */
  ttlMs?: number;
  /** Defaults to `contributedCallMs`. */
  callMs?: number;
}

function signatureOf(set: ContributionSet): string {
  return set.contributors.map((contributor) => `${contributor.id}@${contributor.version}:${contributor.methods.map((method) => method.method).join(",")}:${contributor.instruction ?? ""}`).join("\n");
}

export function createContributions(host: ContributorHost | undefined, options: ContributionsOptions): Contributions {
  const { log, now } = options;
  const ttlMs = options.ttlMs ?? LIMITS.contributionsTtlMs;
  const callMs = options.callMs ?? LIMITS.contributedCallMs;
  let set: ContributionSet = EMPTY_CONTRIBUTIONS;
  let readAt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<ContributionSet> | null = null;
  const reported = new Set<string>();
  const listeners = new Set<(set: ContributionSet) => void>();

  async function read(): Promise<ContributionSet> {
    if (!host) return EMPTY_CONTRIBUTIONS;
    let listed: readonly { id: string; declaration: unknown }[];
    try {
      listed = await host.list();
    } catch (error) {
      log.warn(`contributions: could not list contributors: ${errorText(error)}`);
      return set;
    }
    const contributors: Contributor[] = [];
    const byMethod = new Map<string, ContributedSpec>();
    for (const entry of listed) {
      const parsed = parseContributor(entry.id, entry.declaration);
      for (const problem of parsed.problems) {
        // Each refusal is logged once, not on every refresh. 07 R5.43
        if (!reported.has(problem)) {
          reported.add(problem);
          log.warn(`contributions: refused ${problem}`);
        }
      }
      if (!parsed.contributor) continue;
      contributors.push(parsed.contributor);
      for (const method of parsed.contributor.methods) byMethod.set(method.method, method);
    }
    return Object.freeze({ contributors: Object.freeze(contributors), get: (method: string) => byMethod.get(method) });
  }

  function refresh(): Promise<ContributionSet> {
    if (!inFlight) {
      inFlight = read()
        .then((next) => {
          const changed = signatureOf(next) !== signatureOf(set);
          set = next;
          readAt = now();
          if (changed) for (const listener of listeners) listener(next);
          return next;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  const fresh = () => now() - readAt < ttlMs;

  return {
    async current() {
      return fresh() ? set : refresh();
    },
    cached() {
      if (!fresh()) void refresh().catch(() => undefined);
      return set;
    },
    async invoke(spec, params, caller, requestId) {
      if (!host) throw new PageError("unknown_method", `Unknown capability: ${spec.method}`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let late = false;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { late = true; reject(new PageError("unavailable", `${spec.contributor.id} did not answer within ${Math.round(callMs / 1000)} seconds`, { reason: "timeout" })); }, callMs);
      });
      let answer;
      try {
        // The session's folder rides with its id, so a contributor asks no host for it (U44). A call the page was
        // already told timed out is never started.
        const call = (async () => {
          let workspace: ContributorWorkspace | null = null;
          if (caller.sessionId !== null) {
            try {
              workspace = await host.workspaceOf(caller.sessionId);
            } catch (error) {
              log.warn(`contributions: the host could not say where session ${caller.sessionId} works: ${errorText(error)}`);
              throw new PageError("unavailable", "This session's folder cannot be found now");
            }
          }
          if (late) throw new PageError("unavailable", `${spec.contributor.id} did not answer in time`);
          return host.invoke(spec.contributor.id, { method: spec.method, params, caller: { ...caller, workspace }, requestId });
        })();
        call.catch(() => undefined);
        answer = await Promise.race([call, timeout]);
      } catch (error) {
        if (PageError.is(error)) throw error;
        // Registered but not answering. 07 R5.52
        log.warn(`contributions: ${spec.contributor.id} did not answer ${spec.method}: ${errorText(error)}`);
        throw new PageError("unavailable", `${spec.contributor.id} is not answering`, { cause: error });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (!answer || typeof answer !== "object") throw new PageError("invalid_response", `${spec.contributor.id} answered with no result`);
      if (answer.ok === true) return answer.result as JsonValue;
      if (answer.ok === false && answer.error && typeof answer.error === "object") throw contributedFailure(spec, answer.error, log);
      throw new PageError("invalid_response", `${spec.contributor.id} answered neither a result nor a failure`);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A contributor's failure on the fixed codes: an undeclared reason dropped, a detail kept only when it passes the declared schema, a code outside the set `handler_error`. 03 R5.41b; 07 §The call */
export function contributedFailure(spec: ContributedSpec, error: { code?: unknown; message?: unknown; reason?: unknown; detail?: unknown }, log: Logger): PageError {
  const message = typeof error.message === "string" && error.message.trim().length > 0 ? error.message : `${spec.method} failed`;
  if (!isBridgeErrorCode(error.code) || error.code === "confirmation_required" || error.code === "cancelled") {
    log.warn(`contributions: ${spec.method} answered code "${String(error.code)}", outside the fixed set: ${message}`);
    return new PageError("handler_error", PUBLIC_MESSAGES.handler);
  }
  if (error.code === "handler_error") log.warn(`contributions: ${spec.method} failed: ${message}`);
  if (error.reason === undefined) return new PageError(error.code, message);
  if (typeof error.reason !== "string" || !spec.reasons.has(error.reason)) {
    log.warn(`contributions: ${spec.method} answered undeclared reason "${String(error.reason)}"; dropped`);
    return new PageError(error.code, message);
  }
  const check = spec.reasons.get(error.reason);
  if (!check || error.detail === undefined) return new PageError(error.code, message, { reason: error.reason });
  const detail = check(error.detail);
  if (!detail.ok) {
    log.warn(`contributions: ${spec.method} reason "${error.reason}" carried a detail that fails its schema; dropped`);
    return new PageError(error.code, message, { reason: error.reason });
  }
  return new PageError(error.code, message, { reason: error.reason, detail: detail.value });
}

/** Built-in capabilities first, then contributed ones: a contributor never shadows a built-in. 07 R5.43 */
export function combinedLookup(registry: CapabilityRegistry, set: ContributionSet): CapabilityLookup {
  return { get: (method: string): AnyCapabilitySpec | undefined => registry.get(method) ?? set.get(method) };
}

/** The roster: the built-in descriptors, then every contributed method with its contributor, description and reasons. 03 R5.9, R5.9a */
export function rosterOf(registry: CapabilityRegistry, set: ContributionSet): CapabilityDescriptor[] {
  return [...registry.descriptors(), ...set.contributors.flatMap((contributor) => contributor.methods.map(describe))];
}

/** The instruction fragments that follow the standing instruction, one per contributor that declares one, for `instruction.inject`. 04 R6.29; 06 R-P14 */
export function instructionFragments(set: ContributionSet): { contributor: string; text: string }[] {
  return set.contributors.filter((contributor) => contributor.instruction !== null).map((contributor) => ({ contributor: contributor.id, text: contributor.instruction as string }));
}
