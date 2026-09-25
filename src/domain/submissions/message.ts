import type { JsonValue } from "../json/strict-json.ts";
import { UPLOAD_DIR } from "../../pages/layout.ts";
import type { Submission, SubmissionFile } from "./parse.ts";

/**
 * The message a form submission becomes. It names itself, names the form,
 * leads with the chosen action, presents each answer under the label the
 * reader saw, and states blanks explicitly. spec R2.35, R2.36
 */
export function formatSubmissionMessage(submission: Submission): string {
  const heading = submission.title.trim() || "Thread Page";
  // Files attached to a text area are reported beside that field's text; the rest together. spec R4.62
  const textFields = new Set(submission.answers.filter((answer) => typeof answer.value === "string").map((answer) => answer.name));
  const sections = submission.answers.map((answer) => {
    const label = answer.label.trim() || answer.name;
    const files = textFields.has(answer.name) ? submission.files.filter((file) => file.field === answer.name) : [];
    const attached = files.length > 0 ? `\n\nAttached here:\n${files.map(fileLine).join("\n")}` : "";
    return `**${label}**\n${formatValue(answer.value)}${attached}`;
  });
  const rest = submission.files.filter((file) => !textFields.has(file.field));
  const where = `They are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`;
  if (rest.length > 0) {
    sections.push(["**Attached files**", ...rest.map(fileLine), where].join("\n"));
  } else if (submission.files.length > 0) {
    sections.push(`The attached files are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`);
  }
  return [`The user answered the form on your Thread Page — ${heading}.`, ...sections].join("\n\n");
}

/** One file, and for a recording its transcript — or that there is none. spec R4.24b */
function fileLine(file: SubmissionFile): string {
  const line = `- \`$BB_THREAD_STORAGE/${file.path}\` (${file.name}, ${file.sizeBytes} bytes)`;
  if (file.transcript === undefined) return line;
  if (file.transcript === null) return `${line}\n  Transcript missing: this recording could not be transcribed; listen to the file.`;
  const text = file.transcript.trim() || "(nothing was heard)";
  return `${line}\n  Transcript: ${text.replace(/\r?\n/g, "\n  ")}`;
}

function formatValue(value: string | string[] | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(left blank)";
  return value.length > 0 ? value : "(left blank)";
}

/** The message a `session.reply` becomes. spec R5.16 */
export function formatReplyMessage(title: string | undefined, result: JsonValue): string {
  const heading = title?.trim() || "Interactive response";
  const serialized = JSON.stringify(result, null, 2) ?? "null";
  let longestRun = 0;
  for (const match of serialized.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`The user sent an interactive response from your Thread Page — ${heading}.`, `**Result**\n\n${fence}json\n${serialized}\n${fence}`].join("\n\n");
}
