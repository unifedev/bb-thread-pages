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
  /** Submission JSON body, excluding uploaded bytes and transcripts. */
  submissionBodyBytes: 64 * 1024,
  /** One recording's transcript carried in an answer beside its file. R4.24b */
  transcriptChars: 16_000,
  /** Answers per submission, and characters per answer value. */
  answersPerSubmission: 64,
  answerValueChars: 8_000,
  answerListItems: 64,
  /** Capability request and response, serialised. R5.2 */
  capabilityPayloadBytes: 64 * 1024,
  capabilityJsonDepth: 16,
  /**
   * Contributed capabilities declare their own request and response bounds,
   * each at most this; undeclared they get `capabilityPayloadBytes`. R5.47, D21
   */
  contributedPayloadMaxBytes: 1024 * 1024,
  /** One contributed call, before it answers `unavailable`. R5.51, D22 */
  contributedCallMs: 30_000,
  /** How long a contributor's declarations are reused before they are read again. */
  contributionsTtlMs: 10_000,
  /** A contributor's instruction fragment and guide text. R6.29, D27 */
  contributorInstructionBytes: 2 * 1024,
  contributorGuideBytes: 16 * 1024,
  contributorMethods: 64,
  /** A document's scope: a folder inside the session's folder, its length and depth. R5.82, D41 */
  scopeChars: 1024,
  scopeSegments: 64,
  /** A document's `#fragment`, carried by the shell. R1.12f, D41 */
  fragmentChars: 2048,
  /** A document's `?query`, carried to it. R1.12g, D43 */
  documentQueryChars: 2048,
  /** `question` in session reads, marked when cut. R5.11c, D25 */
  questionChars: 1024,
  capabilityJsonNodes: 10_000,
  /** `sessions.start` and `sessions.send` prompts. */
  promptChars: 32 * 1024,
  /** `session.reply` result, serialised. */
  resultTextBytes: 64 * 1024,
  /**
   * Voice: a recording's length (default and range), the context sent with it,
   * and the shortest recording that is sent. R5.70, R5.71
   */
  voiceDefaultSeconds: 120,
  voiceMaxSeconds: 600,
  voicePromptChars: 1000,
  voiceMinMs: 1000,
  /**
   * The most audio the plugin passes to the host's transcriber: bb's own cap
   * (25 MB, OpenAI). bb's default service takes 5 MB, and says so itself. R5.72
   */
  transcriptionBytes: 25 * 1024 * 1024,
  /** Files one `sessions.start` or `sessions.send` carries, and each one's size. R5.77 */
  promptFiles: 8,
  promptFileBytes: 24 * 1024 * 1024,
  /**
   * An approved call's upload grant: its first upload under a valid challenge
   * opens it, and the rest of the files, and the call itself, may follow for
   * this long — the challenge alone would cut a slow connection short. R3.20a
   */
  attachGrantMs: 30 * 60 * 1000,
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
  /** Approvals remembered as used, so none is redeemed twice. R3.19 */
  redeemedConfirmations: 4096,
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
  /** Every request also counts against its session's overall cap: many documents, one session. R2.38a, D45 */
  sessionRatePerMinute: 600,
  sessionRateConcurrent: 32,
  /** Shell revision poll while the tab is visible. R2.17 */
  shellPollMs: 10_000,
  /**
   * The same poll while the session is mid-turn, and for a window after the
   * reader answers from the page. R2.17a, D28
   */
  shellPollWorkingMs: 2_000,
  shellPollAfterAnswerMs: 60_000,
  /** How long the shell waits for a refreshed document to load before showing it anyway. R2.18a */
  refreshSwapMs: 4_000,
  /** Parts a document includes, all levels together; one part; how deep a part may include. R1.23, D32 */
  includeParts: 200,
  /** Include elements one document may hold, and unresolved ones it reports. */
  includeElements: 400,
  includeReports: 100,
  includePartBytes: 2 * 1024 * 1024,
  includeDepth: 3,
  /** `pages.read`: entries per call, and its own response bound. R5.56, R5.58, D29 */
  pagesReadEntries: 16,
  pagesReadBytes: 8 * 1024 * 1024,
  /** `pages.answer` request: a submission body plus its token. */
  pagesAnswerBytes: 96 * 1024,
  /** Embeds on one page; further ones show a placeholder. */
  embedsPerPage: 32,
  /** Embed refresh: while an embedded session works or was just answered, and otherwise. R4.44 */
  embedPollWorkingMs: 3_000,
  embedPollMs: 10_000,
  embedPollAfterAnswerMs: 60_000,
  /** Calls one embedded page may make per minute. R4.49 */
  embedCallsPerMinute: 30,
  /** Answer token lifetime; every read renews it. R5.60a, R5.62 */
  answerTokenMs: 2 * 60 * 60 * 1000,
  /** Grants one page may hold, and pages that may hold any. R5.67 */
  grantsPerPage: 64,
  grantPages: 512,
  /** `watch` interval default and clamp. R4.30 */
  watchDefaultMs: 8_000,
  watchMinMs: 2_000,
  watchMaxMs: 5 * 60 * 1000,
  /** Offline copy of the entry document kept in the host's key-value store. R2.30 */
  /**
   * Resolving a page's own files into its entry document (see pages/inline.ts).
   * The per-file cap is generous because a page's stylesheet and data set are
   * the whole point; the total is what keeps one page from becoming a document
   * no phone will load. Base64 costs a third on top of both.
   */
  inlineFileBytes: 2 * 1024 * 1024,
  inlineTotalBytes: 3 * 1024 * 1024,
  /** How far `url()` inside an inlined stylesheet is followed. */
  inlineCssDepth: 3,
  /**
   * An own media file too large to carry is fetched by the shell instead, up
   * to the host's own read limit: 25 MiB, 10 MiB for images (bb's daemon,
   * `file-read.ts`). Larger cannot reach the reader at all. D37
   */
  shellFetchBytes: 25 * 1024 * 1024,
  shellFetchImageBytes: 10 * 1024 * 1024,
  offlineCopyBytes: 200 * 1024,
  offlineCacheEntries: 32,
  offlineCacheBytes: 8 * 1024 * 1024,
  /** Bridge envelope identifiers. */
  requestIdChars: 96,
  methodNameChars: 96,
  /** Signed tokens; a challenge carries its summary, which may name eight files. */
  tokenChars: 8_192,
  errorMessageChars: 512,
  /** A confirmation's summary; room to name every file of a call with its size. R5.78 */
  summaryChars: 1024,
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
