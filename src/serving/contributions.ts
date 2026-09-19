import { describe, type CapabilityLookup, type CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { parseContributor, type ContributedSpec, type Contributor } from "../domain/capabilities/contributed.ts";
import type { AnyCapabilitySpec, CapabilityDescriptor } from "../domain/capabilities/contract.ts";
import { PageError, errorText, isBridgeErrorCode } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { ContributorHost } from "../host/contract.ts";
import type { HostLogger } from "../host/types.ts";

/**
 * The capabilities other extensions contribute, read from them and kept for a
 * short while so a page load does not call every extension. Installing,
 * enabling or disabling one shows within `contributionsTtlMs`, with no
 * restart. spec R5.42–R5.55, R8.30
 */
export interface ContributionSet {
  readonly contributors: readonly Contributor[];
  get(method: string): ContributedSpec | undefined;
}

export interface Contributions {
  /** The set as of now, read again when older than the TTL. Never rejects. */
  current(): Promise<ContributionSet>;
  /** The last set read, without waiting; starts a refresh when it is old. For synchronous callers. */
  cached(): ContributionSet;
  /** One call to a contributor, bounded in time, its failures mapped onto the fixed codes. */
  invoke(spec: ContributedSpec, params: JsonValue, caller: { sessionId: string | null }, requestId: string): Promise<unknown>;
}

/** A contributed failure carries its declared reason and detail to the page. spec R4.28a, R5.41b */
export class ContributedError extends PageError {
  readonly reason: string | undefined;
  readonly detail: JsonValue | undefined;
  constructor(code: ConstructorParameters<typeof PageError>[0], message: string, extra: { reason?: string; detail?: JsonValue } = {}) {
    super(code, message);
    this.reason = extra.reason;
    this.detail = extra.reason ? extra.detail : undefined;
  }
}

const EMPTY: ContributionSet = Object.freeze({ contributors: Object.freeze([]), get: () => undefined });

export function createContributions(host: ContributorHost | undefined, log: HostLogger, now: () => number): Contributions {
  let set: ContributionSet = EMPTY;
  let readAt = -Infinity;
  let inFlight: Promise<ContributionSet> | null = null;
  const reported = new Set<string>();

  async function read(): Promise<ContributionSet> {
    if (!host) return EMPTY;
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
        // Log each refusal once, not on every refresh. spec R5.43
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
          set = next;
          readAt = now();
          return next;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  const fresh = () => now() - readAt < LIMITS.contributionsTtlMs;

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
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PageError("unavailable", `${spec.contributor.id} did not answer within ${LIMITS.contributedCallMs / 1000} seconds`)), LIMITS.contributedCallMs);
      });
      let answer;
      try {
        answer = await Promise.race([host.invoke(spec.contributor.id, { method: spec.method, params, caller, requestId }), timeout]);
      } catch (error) {
        if (PageError.is(error)) throw error;
        // Registered but not answering. spec R5.52
        throw new PageError("unavailable", `${spec.contributor.id} is not answering`, { cause: error });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (answer.ok) return answer.result;
      throw contributedFailure(spec, answer.error, log);
    },
  };
}

/** Maps a contributor's failure onto the fixed codes. spec R5.41b, D23 */
export function contributedFailure(spec: ContributedSpec, error: { code: string; message?: string; reason?: string; detail?: unknown }, log: HostLogger): PageError {
  const message = typeof error.message === "string" && error.message.trim() ? error.message : `${spec.method} failed`;
  if (!isBridgeErrorCode(error.code) || error.code === "confirmation_required" || error.code === "cancelled") {
    log.warn(`contributions: ${spec.method} answered code "${String(error.code)}", outside the fixed set: ${message}`);
    return new PageError("handler_error", "Could not execute the page action.");
  }
  if (error.code === "handler_error") log.warn(`contributions: ${spec.method} failed: ${message}`);
  if (error.reason === undefined) return new ContributedError(error.code, message);
  const detailCheck = spec.reasons?.get(error.reason);
  if (detailCheck === undefined) {
    log.warn(`contributions: ${spec.method} answered undeclared reason "${String(error.reason)}"; dropped`);
    return new ContributedError(error.code, message);
  }
  if (detailCheck === null || error.detail === undefined) return new ContributedError(error.code, message, { reason: error.reason });
  const detail = detailCheck(error.detail);
  if (!detail.ok) {
    log.warn(`contributions: ${spec.method} reason "${error.reason}" carried a detail that fails its schema; dropped`);
    return new ContributedError(error.code, message, { reason: error.reason });
  }
  return new ContributedError(error.code, message, { reason: error.reason, detail: detail.value });
}

/** Built-in capabilities first, then contributed ones: a contributor can never shadow a built-in. */
export function combinedLookup(registry: CapabilityRegistry, set: ContributionSet): CapabilityLookup {
  return { get: (method: string): AnyCapabilitySpec | undefined => registry.get(method) ?? set.get(method) };
}

/** The roster: built-in descriptors, then every contributed method. spec R5.9, R5.9a */
export function rosterOf(registry: CapabilityRegistry, set: ContributionSet): CapabilityDescriptor[] {
  return [...registry.descriptors(), ...set.contributors.flatMap((contributor) => contributor.methods.map(describe))];
}

/** The instruction fragments that follow the standing instruction. spec R6.29, D27 */
export function instructionFragments(set: ContributionSet): string {
  return set.contributors
    .filter((contributor) => contributor.instruction)
    .map((contributor) => `## From ${contributor.id}\n\n${contributor.instruction}`)
    .join("\n\n");
}
