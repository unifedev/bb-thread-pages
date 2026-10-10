// `parseSubmission(body)` → `Submission` incl. `writtenAgainst`, `formId?`, `formTitle?`; bounds (08); `isSafeUploadName`.
import { UPLOAD_DIR } from "../document-path.ts";
import { isRevision, isSubmissionId } from "../ids.ts";
import { LIMITS } from "../limits.ts";

/** A form answer as the kernel delivers it. 02 R4.12 */
export type AnswerValue = string | string[] | boolean;

export interface Answer {
  readonly name: string;
  readonly label: string;
  readonly value: AnswerValue;
}

export interface SubmissionFile {
  readonly field: string;
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
  /** A recording's transcript made by the shell at submit: the text, or null when it could not be made. Absent for every other file. 02 R4.24b */
  readonly transcript?: string | null;
}

export interface Submission {
  readonly actionToken: string;
  readonly submissionId: string;
  /** The revision of the document the reader typed into. 02 R-K6, 05 R2.32 */
  readonly writtenAgainst: string;
  readonly formId: string | null;
  readonly formTitle: string | null;
  readonly title: string;
  /** The submitter's value, or null when the form was sent another way; its own field, never an answer. 05 R2.36 */
  readonly action: string | null;
  readonly answers: readonly Answer[];
  readonly files: readonly SubmissionFile[];
}

/** A host-generated upload name: `<yyyymmdd>-<hhmmss>-<6 hex>-<suffix>`, the suffix reduced to `[A-Za-z0-9._-]`, not starting with a dot. 02 R4.21; DR-42 */
export function isSafeUploadName(value: unknown): value is string {
  return typeof value === "string" && /^\d{8}-\d{6}-[0-9a-f]{6}-[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/.test(value);
}

function optionalText(value: unknown, max: number): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max) return false;
  return value;
}

/** Parses and bounds a submission body; returns null when it is not one. 05 R2.32, 02 R-K6 */
export function parseSubmission(value: unknown): Submission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(["actionToken", "submissionId", "writtenAgainst", "formId", "formTitle", "title", "action", "answers", "files"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  if (
    typeof input.actionToken !== "string" ||
    input.actionToken.length === 0 ||
    input.actionToken.length > LIMITS.tokenChars ||
    !isSubmissionId(input.submissionId) ||
    !isRevision(input.writtenAgainst) ||
    typeof input.title !== "string" ||
    input.title.length > 300 ||
    !Array.isArray(input.answers) ||
    input.answers.length > LIMITS.answersPerSubmission
  ) {
    return null;
  }
  const formId = optionalText(input.formId, 300);
  const formTitle = optionalText(input.formTitle, 300);
  const action = optionalText(input.action, LIMITS.answerValueChars);
  if (formId === false || formTitle === false || action === false) return null;

  const answers: Answer[] = [];
  let total = input.title.length + (action?.length ?? 0);
  for (const raw of input.answers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const answer = raw as Record<string, unknown>;
    if (Object.keys(answer).some((key) => key !== "name" && key !== "label" && key !== "value")) return null;
    if (typeof answer.name !== "string" || answer.name.length > 128 || typeof answer.label !== "string" || answer.label.length > 300) return null;
    if (!isAnswerValue(answer.value)) return null;
    total += answer.name.length + answer.label.length + valueLength(answer.value);
    if (total > LIMITS.submissionBodyBytes) return null;
    answers.push({ name: answer.name, label: answer.label, value: answer.value });
  }

  const files: SubmissionFile[] = [];
  if (input.files !== undefined) {
    if (!Array.isArray(input.files) || input.files.length > LIMITS.uploadsPerForm) return null;
    for (const raw of input.files) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const file = raw as Record<string, unknown>;
      if (
        typeof file.field !== "string" ||
        file.field.length > 128 ||
        !isSafeUploadName(file.name) ||
        typeof file.path !== "string" ||
        file.path !== `${UPLOAD_DIR}/${file.name}` ||
        typeof file.sizeBytes !== "number" ||
        !Number.isSafeInteger(file.sizeBytes) ||
        file.sizeBytes < 0 ||
        file.sizeBytes > LIMITS.uploadFileBytes ||
        Object.keys(file).some((key) => !["field", "name", "path", "sizeBytes", "transcript"].includes(key)) ||
        (file.transcript !== undefined && file.transcript !== null && typeof file.transcript !== "string")
      ) {
        return null;
      }
      files.push({
        field: file.field,
        name: file.name,
        path: file.path,
        sizeBytes: file.sizeBytes,
        ...(file.transcript !== undefined ? { transcript: typeof file.transcript === "string" ? shortenTranscript(file.transcript) : null } : {}),
      });
    }
  }

  return { actionToken: input.actionToken, submissionId: input.submissionId, writtenAgainst: input.writtenAgainst, formId, formTitle, title: input.title, action, answers, files };
}

function isAnswerValue(value: unknown): value is AnswerValue {
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= LIMITS.answerValueChars;
  return Array.isArray(value) && value.length <= LIMITS.answerListItems && value.every((item) => typeof item === "string" && item.length <= 2_000);
}

function valueLength(value: AnswerValue): number {
  if (typeof value === "boolean") return 1;
  if (typeof value === "string") return value.length;
  return value.reduce((sum, item) => sum + item.length, 0);
}

export const TRANSCRIPT_SHORTENED = " … (transcript shortened)";

/** A transcript within its bound: a long one is cut and says so, never the reason a whole answer fails after its files were uploaded. 02 R4.24b */
export function shortenTranscript(text: string): string {
  if (text.length <= LIMITS.transcriptChars) return text;
  return `${text.slice(0, LIMITS.transcriptChars - TRANSCRIPT_SHORTENED.length)}${TRANSCRIPT_SHORTENED}`;
}
