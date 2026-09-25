import type { NavigationDirective } from "../../domain/capabilities/protocol.ts";
import type { SessionRecord } from "../../host/types.ts";
import type { LoadedPage } from "../../pages/page-store.ts";
import type { ServingContext } from "../context.ts";

/**
 * A capability's server-side half. `refuse` runs before any confirmation so
 * cheap refusals (own session, not found) never show a dialog; `summarize`
 * words the confirmation from validated parameters; `grant` asks once per
 * pair instead of per call; `execute` acts.
 */
export interface HandlerContext {
  readonly serving: ServingContext;
  readonly session: SessionRecord;
  readonly page: LoadedPage;
  readonly requestId: string;
  /** The origins the reader reached this host at, as the request shows them (its URL and `Origin`). */
  readonly requestOrigins?: readonly string[];
}

export interface HandlerOutcome<R> {
  readonly result: R;
  readonly navigate?: NavigationDirective;
}

/** A grant the reader has not given yet: what to ask, whom it names, and how to remember the answer. spec R5.64 */
export interface GrantRequest {
  readonly summary: string;
  readonly target: { readonly sessionId: string; readonly title: string };
  record(): Promise<void>;
}

export interface CapabilityHandler<P = unknown, R = unknown> {
  readonly method: string;
  /**
   * `recording-bar`: confirmed by the reader's Done in the shell's recording
   * bar, not a dialog. The dispatcher answers the call with the validated
   * parameters for the shell to record with; the shell then records,
   * transcribes and answers the page itself. spec R3.32, R5.68, D38
   */
  readonly confirmedBy?: "recording-bar";
  refuse?(params: P, context: HandlerContext): Promise<void>;
  summarize?(params: P, context: HandlerContext): Promise<string>;
  /**
   * For a capability confirmed once per pair rather than per call: the grant
   * still needed, or null when it is held or not required. spec R5.64
   */
  grant?(params: P, context: HandlerContext): Promise<GrantRequest | null>;
  execute(params: P, context: HandlerContext): Promise<HandlerOutcome<R>>;
}

export function handler<P, R>(definition: CapabilityHandler<P, R>): CapabilityHandler<P, R> {
  return definition;
}

export function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/** Every kind of quotation mark, and the characters that reorder or hide text. */
const UNQUOTABLE = /["'`\u00ab\u00bb\u2018-\u201f\u2039\u203a\u300c-\u300f\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * Text a confirmation quotes that the host did not write — a title, a file
 * name. Quotation marks, control, bidi and zero-width characters are dropped,
 * so it cannot close the quotes it sits in and continue in the host's voice.
 * spec R3.18, R3.22a
 */
export function quotable(text: string, max = 70): string {
  return excerpt(text.replace(UNQUOTABLE, ""), max) || "(untitled)";
}

/** A file name as a confirmation lists it: quotable, and shortened in the middle so its extension shows. spec R5.78 */
export function quotableFileName(name: string, max = 48): string {
  const clean = name.replace(UNQUOTABLE, "").replace(/\s+/g, " ").trim() || "(unnamed)";
  if (clean.length <= max) return clean;
  const extension = /\.[^.\s]{1,10}$/.exec(clean)?.[0] ?? "";
  return `${clean.slice(0, Math.max(1, max - extension.length - 1))}…${extension}`;
}
