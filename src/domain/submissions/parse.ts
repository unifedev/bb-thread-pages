import { isRevision } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { UPLOAD_DIR, isSafeUploadName } from "../../pages/layout.ts";

/** A form answer as the kernel delivers it. spec R4.12 */
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
}

export interface Submission {
  readonly actionToken: string;
  readonly submissionId: string;
  readonly pageRevision: string;
  readonly title: string;
  readonly answers: readonly Answer[];
  readonly files: readonly SubmissionFile[];
}

/** Parses and bounds a submission body; returns null when it is not one. spec R2.32 */
export function parseSubmission(value: unknown): Submission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.actionToken !== "string" ||
    input.actionToken.length === 0 ||
    input.actionToken.length > LIMITS.tokenChars ||
    typeof input.submissionId !== "string" ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(input.submissionId) ||
    !isRevision(input.pageRevision) ||
    typeof input.title !== "string" ||
    input.title.length > 300 ||
    !Array.isArray(input.answers) ||
    input.answers.length > LIMITS.answersPerSubmission
  ) {
    return null;
  }

  const answers: Answer[] = [];
  let total = input.title.length;
  for (const raw of input.answers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const answer = raw as Record<string, unknown>;
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
        typeof file.name !== "string" ||
        !isSafeUploadName(file.name) ||
        typeof file.path !== "string" ||
        file.path !== `${UPLOAD_DIR}/${file.name}` ||
        typeof file.sizeBytes !== "number" ||
        !Number.isSafeInteger(file.sizeBytes) ||
        file.sizeBytes < 0 ||
        file.sizeBytes > LIMITS.uploadFileBytes
      ) {
        return null;
      }
      files.push({ field: file.field, name: file.name, path: file.path, sizeBytes: file.sizeBytes });
    }
  }

  return {
    actionToken: input.actionToken,
    submissionId: input.submissionId,
    pageRevision: input.pageRevision,
    title: input.title,
    answers,
    files,
  };
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
