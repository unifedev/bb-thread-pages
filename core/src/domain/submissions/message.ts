// `formatSubmissionMessage`, `formatReplyMessage`, `formatPromptMessage`, `sentFromLine`, `EARLIER_VERSION_LINE` — 02 §The answer wording, byte-exact.
import { UPLOAD_DIR } from "../document-path.ts";

/** What a submission looks like to the formatter: the title, action and answers the reader saw, and the files as stored. 02 §A form answer */
export interface FormattedSubmission {
  readonly title: string;
  /** The submitter's value, or null when the form was submitted another way. 05 R2.36 */
  readonly action: string | null;
  readonly answers: readonly { readonly name: string; readonly label: string; readonly value: string | string[] | boolean }[];
  readonly files: readonly { readonly field: string | null; readonly name: string; readonly path: string; readonly sizeBytes: number; readonly transcript?: string | null }[];
}

/** The two lines the server adds, never the page. 02 §Framing lines */
export const EARLIER_VERSION_LINE = "Answered on an earlier version of the page";
export const sentFromLine = (title: string): string => `Sent from the page of session ${title}`;

export interface Framing {
  /** The sending page's session title, when the target is not the page's own session (U31). */
  readonly sentFrom?: string;
  /** The matched revision differs from `writtenAgainst` (U32). */
  readonly earlierVersion?: boolean;
}

/** The default title of a form answer. 05 R2.35 */
export const DEFAULT_FORM_TITLE = "Thread Page";
/** The default title of an interactive response. 02 §An interactive response */
export const DEFAULT_REPLY_TITLE = "Interactive response";

function formatValue(value: string | string[] | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(left blank)";
  return value.length > 0 ? value : "(left blank)";
}

/** One file, and for a recording its transcript — or that there is none. 02 §A file line, §Transcript lines */
function fileLine(file: FormattedSubmission["files"][number], pathForAgent: (relative: string) => string): string {
  const line = `- \`${pathForAgent(file.path)}\` (${file.name}, ${file.sizeBytes} bytes)`;
  if (file.transcript === undefined) return line;
  if (file.transcript === null) return `${line}\n  Transcript missing: this recording could not be transcribed; listen to the file.`;
  const text = file.transcript.trim() || "(nothing was heard)";
  return `${line}\n  Transcript: ${text.replace(/\r?\n/g, "\n  ")}`;
}

/** The framing paragraphs after a heading: the U31 line, then the U32 line (DR-37 fixes the order). 02 §Framing lines */
function framingParagraphs(framing: Framing): string[] {
  const lines: string[] = [];
  if (framing.sentFrom !== undefined) lines.push(sentFromLine(framing.sentFrom));
  if (framing.earlierVersion) lines.push(EARLIER_VERSION_LINE);
  return lines;
}

/**
 * The message a form submission becomes: heading, framing lines, Action,
 * one section per answer with the files attached to that field, then the
 * attached files. Byte-exact to 02 §A form answer; nothing escaped or trimmed
 * but the title and labels. 05 R2.35, R2.36
 */
export function formatSubmissionMessage(submission: FormattedSubmission, pathForAgent: (relative: string) => string, framing: Framing = {}): string {
  const heading = submission.title.trim() || DEFAULT_FORM_TITLE;
  const sections: string[] = [`The user answered the form on your Thread Page — ${heading}.`, ...framingParagraphs(framing)];
  if (submission.action !== null) sections.push(`**Action**\n${submission.action}`);
  // Files attached to a text area are reported beside that field's text; the rest together. 02 R4.62
  const textFields = new Set(submission.answers.filter((answer) => typeof answer.value === "string").map((answer) => answer.name));
  for (const answer of submission.answers) {
    const label = answer.label.trim() || answer.name;
    const files = textFields.has(answer.name) ? submission.files.filter((file) => file.field === answer.name) : [];
    const attached = files.length > 0 ? `\n\nAttached here:\n${files.map((file) => fileLine(file, pathForAgent)).join("\n")}` : "";
    sections.push(`**${label}**\n${formatValue(answer.value)}${attached}`);
  }
  const rest = submission.files.filter((file) => file.field === null || !textFields.has(file.field));
  if (rest.length > 0) {
    sections.push(["**Attached files**", ...rest.map((file) => fileLine(file, pathForAgent)), `They are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`].join("\n"));
  } else if (submission.files.length > 0) {
    sections.push(`The attached files are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`);
  }
  return sections.join("\n\n");
}

/** The message a `session.reply { kind: "result" }` becomes: the heading, framing, `**Result**` and a fence no result can close. 02 §An interactive response */
export function formatReplyMessage(title: string | undefined, result: unknown, framing: Framing = {}): string {
  const heading = title?.trim() || DEFAULT_REPLY_TITLE;
  const serialized = JSON.stringify(result, null, 2) ?? "null";
  let longestRun = 0;
  for (const match of serialized.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`The user sent an interactive response from your Thread Page — ${heading}.`, ...framingParagraphs(framing), `**Result**\n\n${fence}json\n${serialized}\n${fence}`].join("\n\n");
}

/** The message a `session.reply { kind: "prompt" }` becomes: the text as typed; under a grant, the U31 line first. 02 §A prompt, §Framing lines */
export function formatPromptMessage(text: string, framing: Framing = {}): string {
  return framing.sentFrom !== undefined ? `${sentFromLine(framing.sentFrom)}\n\n${text}` : text;
}
