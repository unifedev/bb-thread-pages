import type { JsonValue } from "../json/strict-json.ts";
import { UPLOAD_DIR } from "../../pages/layout.ts";
import type { Submission } from "./parse.ts";

/**
 * The message a form submission becomes. It names itself, names the form,
 * leads with the chosen action, presents each answer under the label the
 * reader saw, and states blanks explicitly. spec R2.35, R2.36
 */
export function formatSubmissionMessage(submission: Submission): string {
  const heading = submission.title.trim() || "Thread Page";
  const sections = submission.answers.map((answer) => {
    const label = answer.label.trim() || answer.name;
    return `**${label}**\n${formatValue(answer.value)}`;
  });
  if (submission.files.length > 0) {
    sections.push(
      [
        "**Attached files**",
        ...submission.files.map((file) => `- \`$BB_THREAD_STORAGE/${file.path}\` (${file.name}, ${file.sizeBytes} bytes)`),
        `They are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`,
      ].join("\n"),
    );
  }
  return [`The user answered the form on your Thread Page — ${heading}.`, ...sections].join("\n\n");
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
