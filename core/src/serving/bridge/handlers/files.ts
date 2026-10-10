// The `files` rules of 03 §Files for `sessions.start`, `sessions.send` and `session.reply`: the attachments member, the count and size bounds, and the confirmation's file list that is always named whole (03 R5.77–R5.80; 05 R3.20a).
import type { PromptFile } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import { LIMITS, mebibytes } from "../../../domain/limits.ts";
import { quotable } from "../../../domain/quotable.ts";
import { type BridgeContext, sizeLabel } from "../handler.ts";

/** The methods whose files bind into their confirmation and ride on `/attach`. 05 R3.20a; DESIGN P29 */
export const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send", "session.reply"]);

/** Refusals before any dialog: no `attachments` member, too many files, a file too large. 03 R5.77, R5.80 */
export function checkFiles(files: readonly PromptFile[] | undefined, context: BridgeContext): void {
  if (!files || files.length === 0) return;
  if (!context.serving.provider.attachments) throw new PageError("unavailable", "This host cannot attach files to a prompt; send the text without them", { reason: "no_attachments" });
  if (files.length > LIMITS.promptFiles) throw new PageError("request_too_large", `At most ${LIMITS.promptFiles} files per call`);
  for (const file of files) {
    if (file.size > LIMITS.promptFileBytes) throw new PageError("request_too_large", `A file is at most ${mebibytes(LIMITS.promptFileBytes)}; ${quotable(file.name, 60)} is larger`);
  }
}

/** A file name a confirmation lists: quotable, shortened in the middle so its extension shows. 03 R5.78 */
function fileName(name: string, max = 48): string {
  const clean = quotable(name, Number.MAX_SAFE_INTEGER) || "unnamed";
  if (clean.length <= max) return clean;
  const extension = /\.[^.\s]{1,10}$/.exec(clean)?.[0] ?? "";
  return `${clean.slice(0, Math.max(1, max - extension.length - 1))}…${extension}`;
}

/** The files of a call, every one named with its size. 03 R5.24, R5.27a, R5.78 */
export function filesClause(files: readonly PromptFile[] | undefined): string {
  if (!files || files.length === 0) return "";
  return `; files: ${files.map((file) => `${fileName(file.name)} (${sizeLabel(file.size)})`).join(", ")}`;
}

/**
 * A summary whose file list is always whole: the other parts shrink until it
 * fits `summaryChars`, and when even the shortest head does not fit the call
 * is refused before any dialog. 03 R5.78
 */
export function fitSummary(head: (length: number) => string, files: readonly PromptFile[] | undefined): string {
  const clause = filesClause(files);
  for (const length of [80, 48, 24, 12]) {
    const summary = `${head(length)}${clause}`;
    if (summary.length <= LIMITS.summaryChars) return summary;
  }
  throw new PageError("request_too_large", "The files cannot all be named in the confirmation; send fewer at a time");
}

/** Called from `refuse`, so a file list that cannot be shown whole never reaches a dialog. 03 R5.78 */
export function checkFilesFit(head: (length: number) => string, files: readonly PromptFile[] | undefined): void {
  fitSummary(head, files);
}
