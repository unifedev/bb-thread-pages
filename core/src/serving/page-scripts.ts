// `createPageScripts(host, contributions, options)`: the contributors' page scripts for one served document — only contributors that declare `pageScript` are asked, all at once, within `pageScriptMs`; each answer checked, its text held per contributor and version, a refusal or a silence left out of that serve and logged once (07 §A page script, R5.87–R5.92).
import type { ContributorScript } from "../domain/html/document.ts";
import { errorText } from "../domain/errors.ts";
import { utf8Bytes } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { ContributorHost, ContributorWorkspace } from "../host/contributor.ts";
import type { Logger } from "../host/provider.ts";
import type { Contributions } from "./stores.d.ts";

/** The declaration's version pattern, which a page script's version also matches. 07 R5.89 */
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/;
/** Either would change where an inline script element ends. 07 R5.90 */
const UNSAFE = /<\/script|<!--/i;
/** Distinct problems remembered, so each is logged once; the set starts again past this. */
const REPORTED_MAX = 512;

export interface PageScripts {
  /** The scripts for one document of `sessionId`'s page (null: the built-in home), in the host's contributor order. Never rejects; settles within `pageScriptMs`. 07 R5.88, R5.91 */
  scriptsFor(sessionId: string | null, documentPath: string): Promise<ContributorScript[]>;
}

export interface PageScriptsOptions {
  log: Logger;
  /** Defaults to `pageScriptMs`. */
  askMs?: number;
}

type Outcome = { script: string } | { problem: string } | null;
type Held = { version: string; script: string };

export const NO_PAGE_SCRIPTS: PageScripts = Object.freeze({ scriptsFor: async () => [] });

export function createPageScripts(host: ContributorHost | undefined, contributions: Contributions, options: PageScriptsOptions): PageScripts {
  const ask = host?.pageScript?.bind(host);
  if (!host || !ask) return NO_PAGE_SCRIPTS;
  const { log } = options;
  const askMs = options.askMs ?? LIMITS.pageScriptMs;
  // The current and the previous version per contributor, so an answer to an ask made before an upgrade still finds its text. 07 R5.89
  const held = new Map<string, { current: Held; previous: Held | null }>();
  const reported = new Set<string>();

  function report(contributor: string, problem: string): void {
    const line = `page script: ${contributor} ${problem}; the document is served without it`;
    if (reported.has(line)) return;
    if (reported.size >= REPORTED_MAX) reported.clear();
    reported.add(line);
    log.warn(line);
  }

  /** One answer checked against 07 R5.88–R5.90; a script that passes is held for its version. */
  function settle(contributor: string, answer: unknown): Outcome {
    if (answer === null) return null;
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { problem: "answered neither null nor { version, script? }" };
    const record = answer as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "version" && key !== "script")) return { problem: "answered keys other than version and script" };
    const { version, script } = record;
    if (typeof version !== "string" || !VERSION.test(version)) return { problem: "answered no usable version" };
    if (script === undefined) {
      const kept = held.get(contributor);
      const match = [kept?.current, kept?.previous].find((entry) => entry?.version === version);
      if (match) return { script: match.script };
      return { problem: `answered version ${version} without its script, which this host does not hold` };
    }
    if (typeof script !== "string") return { problem: "answered a script that is not text" };
    if (utf8Bytes(script) > LIMITS.pageScriptBytes) {
      held.delete(contributor);
      return { problem: `answered a script over ${LIMITS.pageScriptBytes} bytes, refused whole` };
    }
    if (UNSAFE.test(script)) {
      held.delete(contributor);
      return { problem: "answered a script containing </script or <!--, which cannot be carried inline" };
    }
    const kept = held.get(contributor);
    if (kept?.current.version !== version) held.set(contributor, { current: { version, script }, previous: kept?.current ?? null });
    else kept.current = { version, script };
    return { script };
  }

  return {
    async scriptsFor(sessionId, documentPath) {
      // The cached declarations, refreshed behind: a serve never waits on the contributors' listing. 07 R5.87
      const askers = contributions.cached().contributors.filter((contributor) => contributor.pageScript);
      if (askers.length === 0) return [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<"late">((resolve) => {
        timer = setTimeout(() => resolve("late"), askMs);
      });
      try {
        let workspace: ContributorWorkspace | null = null;
        if (sessionId !== null) {
          const found = await Promise.race([host.workspaceOf(sessionId).then((value) => ({ value }), (error: unknown) => ({ error })), deadline]);
          if (found === "late" || "error" in found) {
            const why = found === "late" ? `the host did not say within ${askMs} ms` : errorText(found.error);
            for (const contributor of askers) report(contributor.id, `was not asked: where session ${sessionId} works is unknown (${why})`);
            return [];
          }
          workspace = found.value;
        }
        const outcomes = await Promise.all(
          askers.map(async (contributor): Promise<Outcome> => {
            const have = held.get(contributor.id)?.current.version ?? null;
            const answer = await Promise.race([
              Promise.resolve()
                .then(() => ask(contributor.id, { caller: { sessionId, workspace }, documentPath, have }))
                .then((value) => ({ value }), (error: unknown) => ({ error })),
              deadline,
            ]);
            if (answer === "late") return { problem: `did not answer within ${askMs} ms` };
            if ("error" in answer) return { problem: `could not be asked: ${errorText(answer.error)}` };
            return settle(contributor.id, answer.value);
          }),
        );
        const scripts: ContributorScript[] = [];
        outcomes.forEach((outcome, index) => {
          const contributor = askers[index]!.id;
          if (outcome === null) return;
          if ("problem" in outcome) report(contributor, outcome.problem);
          else scripts.push({ contributor, script: outcome.script });
        });
        return scripts;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
