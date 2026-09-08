/**
 * Every numeric limit the product enforces, in one place.
 *
 * The authoring guide is generated from this object (spec R6.25, R6.26), so a
 * limit that is not here is a limit an agent cannot design against. Values
 * follow spec/09-conformance.md §Limits except where rewrite decisions
 * (RW-8) chose otherwise; each such case is noted.
 */
export const LIMITS = Object.freeze({
  /** Entry document (`index.html`); refused above, never truncated. R1.7 */
  entryDocumentBytes: 5 * 1024 * 1024,
  /** One uploaded file. R4.23 */
  uploadFileBytes: 24 * 1024 * 1024,
  /** Files per form submission; extras are ignored visibly. R4.23 */
  uploadsPerForm: 8,
  /** Submission JSON body, excluding uploaded bytes. */
  submissionBodyBytes: 64 * 1024,
  /** Answers per submission, and characters per answer value. */
  answersPerSubmission: 64,
  answerValueChars: 8_000,
  answerListItems: 64,
  /** Capability request and response, serialised. R5.2 */
  capabilityPayloadBytes: 64 * 1024,
  capabilityJsonDepth: 16,
  capabilityJsonNodes: 10_000,
  /** `sessions.start` and `sessions.send` prompts. */
  promptChars: 32 * 1024,
  /** `session.reply` result, serialised. */
  resultTextBytes: 64 * 1024,
  /** Titles, names and labels shown to a reader. */
  titleChars: 240,
  /** One `storage` value, serialised. R5.19 */
  storageValueBytes: 32 * 1024,
  storageKeyChars: 128,
  /** `sessions.snapshot` page size. R5.11 */
  snapshotDefault: 100,
  snapshotMax: 200,
  /** `session.activity` items. */
  activityDefault: 8,
  activityMax: 20,
  /** Action token lifetime. R2.9 */
  actionTokenMs: 2 * 60 * 60 * 1000,
  /** Confirmation challenge lifetime. R3.19 */
  confirmationMs: 2 * 60 * 1000,
  /** Folder-picker selection token lifetime; single use. R5.36 */
  selectionTokenMs: 10 * 60 * 1000,
  selectionTokens: 32,
  /** Submission and reply idempotency records. R2.34 */
  idempotencyRecords: 512,
  idempotencyMs: 5 * 60 * 1000,
  /**
   * Effectful requests per page. RW-8: 120/min and 8 concurrent rather than
   * the spec's 30/4, so a page that lists sessions and refreshes cannot
   * exhaust its own budget (R2.40). The shell's revision poll is not counted.
   */
  ratePerMinute: 120,
  rateConcurrent: 8,
  /** Shell revision poll while the tab is visible. R2.17 */
  shellPollMs: 10_000,
  /** `watch` interval default and clamp. R4.30 */
  watchDefaultMs: 8_000,
  watchMinMs: 2_000,
  watchMaxMs: 5 * 60 * 1000,
  /** Offline copy of the entry document kept in the host's key-value store. R2.30 */
  offlineCopyBytes: 200 * 1024,
  offlineCacheEntries: 32,
  offlineCacheBytes: 8 * 1024 * 1024,
  /** Bridge envelope identifiers. */
  requestIdChars: 96,
  methodNameChars: 96,
  tokenChars: 4_096,
  errorMessageChars: 512,
  summaryChars: 512,
  /** Sizes of lists a capability may return. */
  projectsMax: 200,
  providersMax: 64,
  modelsPerProvider: 64,
});

export type Limits = typeof LIMITS;

export function mebibytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 100) / 100} MiB`;
}

export function kibibytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}
