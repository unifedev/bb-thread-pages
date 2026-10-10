// `LIMITS`: every number of 08 §Limits plus the five constants (cooldown, arming delay, recorder slice, icon px, transcriber ceiling) and the §B.7 extras; `mebibytes`, `kibibytes`.

/**
 * Every numeric limit the server enforces, in one object. The guide and
 * `docs/LIMITS.md` are generated from it (08 §Limits, 04 R6.25–R6.26), so a
 * limit that is not here is a limit an agent cannot design against. Each
 * key's comment names its requirement; `scripts/gen-limits.mjs` prints the
 * comment's first sentence.
 */
export const LIMITS = Object.freeze({
  /** The entry document; refused above, never truncated. 01 R1.7 */
  entryDocumentBytes: 5 * 1024 * 1024,
  /** One uploaded file; refused above. 02 R4.23 */
  uploadFileBytes: 24 * 1024 * 1024,
  /** Files per form submission; the ninth is refused visibly and the form is not sent; files attached to text areas count with file inputs. 02 R4.23, R4.62 */
  uploadsPerForm: 8,
  /** Submission JSON body, excluding uploaded bytes and transcripts. 05 R2.32 */
  submissionBodyBytes: 64 * 1024,
  /** One recording's transcript carried in an answer beside its file. 02 R4.24b */
  transcriptChars: 16_000,
  /** Answers in one submission. 05 R2.32 */
  answersPerSubmission: 64,
  /** Characters per answer value. 05 R2.32 */
  answerValueChars: 8_000,
  /** Items in one list answer. 02 R4.12 */
  answerListItems: 64,
  /** Capability request and response, serialised; built-in capabilities, and contributed ones that declare no bound. 03 R5.2, 07 R5.47 */
  capabilityPayloadBytes: 64 * 1024,
  /** Nesting of a capability payload; rejected above. 03 R5.2, 07 R-X2 */
  capabilityJsonDepth: 16,
  /** Nodes in a capability payload; rejected above. 03 R5.2, 07 R-X2 */
  capabilityJsonNodes: 10_000,
  /** The most a contributed method may declare for its request and its response, each. 07 R5.47 */
  contributedPayloadMaxBytes: 1024 * 1024,
  /** One contributed call, then `unavailable`. 07 R5.51 */
  contributedCallMs: 30_000,
  /** How long a contributor's declarations are reused before they are read again. 07 §Discovery per host */
  contributionsTtlMs: 10_000,
  /** A contributor's instruction fragment; refused above. 07 §The declaration grammar, 04 R6.29 */
  contributorInstructionBytes: 2 * 1024,
  /** A contributor's guide text; refused above. 07 §The declaration grammar, 04 R6.29 */
  contributorGuideBytes: 16 * 1024,
  /** Methods one contributor may declare. 07 §The declaration grammar */
  contributorMethods: 64,
  /** A contributor's declaration as strict JSON; refused entirely above. 07 §The declaration as a whole */
  declarationBytes: 256 * 1024,
  /** A contributor's declaration, nesting depth; refused entirely above. 07 §The declaration as a whole */
  declarationDepth: 32,
  /** A contributor's declaration, node count; refused entirely above. 07 §The declaration as a whole */
  declarationNodes: 50_000,
  /** A contributed method's `description`; the method is refused above. 07 §One method */
  methodDescriptionChars: 240,
  /** A document's scope, length; refused above. 07 R5.82 */
  scopeChars: 1024,
  /** A document's scope, folders; refused above. 07 R5.82 */
  scopeSegments: 64,
  /** A document's `#fragment`, carried by the shell; a longer one is dropped. 01 R1.12f */
  fragmentChars: 2048,
  /** A document's `?query`, carried to it; no `#`, whitespace or control characters; `session`, `path` and `render` are the host's. 01 R1.12g */
  documentQueryChars: 2048,
  /** `waiting.text` in session reads, marked when cut. 03 R5.11c */
  questionChars: 1024,
  /** `waiting.approval.summary`, carried whole; a `decision` whose summary is longer is `unavailable` with reason `summary_too_long` and never shown cut. 03 R-C7 */
  decisionSummaryChars: 16 * 1024,
  /** `sessions.start` and `sessions.send` prompts. 03 R5.75 */
  promptChars: 32 * 1024,
  /** `session.reply` result, serialised. 03 R5.16 */
  resultTextBytes: 64 * 1024,
  /** `session.messages` and `sessions.messages` page size by default. 03 R-C1 */
  messagesDefault: 50,
  /** `session.messages` and `sessions.messages` page size at most; a `limit` over it is `invalid_params` naming it, never clamped. 03 R-C1 */
  messagesMax: 200,
  /** One `messages` response; a row that does not fit is cut and marked `truncated`. 03 R-C1 */
  messagesResponseBytes: 256 * 1024,
  /** One message row's text, then `truncated`. 03 R-C1 */
  messageTextChars: 16_000,
  /** A tool row's `input`, per row. 03 R-C3 */
  toolInputBytes: 2 * 1024,
  /** A tool row's `result`, per row. 03 R-C3 */
  toolResultBytes: 8 * 1024,
  /** A recording's length by default, also for Dictate and the audio input; the bar stops recording and waits for Done. 03 R5.70 */
  voiceDefaultSeconds: 120,
  /** The most `maxDurationSeconds` may ask for; 1–600 s. 03 R5.70 */
  voiceMaxSeconds: 600,
  /** Transcription context (`prompt`); Dictate sends the last 1,000 characters before the caret. 03 R5.70, 02 R4.58 */
  voicePromptChars: 1000,
  /** The shortest recording that is sent; shorter shows *Too short*, `cancelled`. 03 R5.71 */
  voiceMinMs: 1000,
  /** The server's ceiling on audio passed to the provider's transcriber; over it `request_too_large`. 03 R5.72 */
  transcriptionBytes: 25 * 1024 * 1024,
  /** Files one `sessions.start`, `sessions.send` or `session.reply` carries; `request_too_large` before any dialog. 03 R5.77 */
  promptFiles: 8,
  /** Each such file. 03 R5.77 */
  promptFileBytes: 24 * 1024 * 1024,
  /** An approved call's upload grant: its first upload under a valid challenge opens it, and the rest of the files and the call may follow for this long. 05 R3.20a */
  attachGrantMs: 30 * 60 * 1000,
  /** Titles, names and labels shown to a reader; truncated for display. 08 §Limits */
  titleChars: 240,
  /** One `storage` value, serialised, per key. 03 R5.19 */
  storageValueBytes: 256 * 1024,
  /** All of one page's `storage` values together, across every scope and document of the page; `request_too_large` above, or the host's `kv` value cap where that is lower. 03 R5.19 */
  storagePageBytes: 4 * 1024 * 1024,
  /** Entries in one `storage.setMany`, one request against the budget, applied all or none. 03 R-C6 */
  storageSetManyEntries: 32,
  /** One `storage` key. 03 R5.18 */
  storageKeyChars: 128,
  /** How long the shell keeps a reader's draft before discarding it. 02 R-K7 */
  draftRetentionMs: 7 * 24 * 60 * 60 * 1000,
  /** All drafts of one session together in the shell's storage; over it the oldest are discarded and the chrome says so. 02 R-K7 */
  draftsPerSessionBytes: 1024 * 1024,
  /** `sessions.snapshot` page size by default. 03 R5.11 */
  snapshotDefault: 100,
  /** `sessions.snapshot` page size at most; over it `invalid_params` naming it. 03 R5.11 */
  snapshotMax: 200,
  /** `session.activity` items by default. 03 §`session.activity` */
  activityDefault: 8,
  /** `session.activity` items at most; over it `invalid_params` naming it. 03 §`session.activity` */
  activityMax: 20,
  /** Render and action token life. 05 R2.9 */
  actionTokenMs: 2 * 60 * 60 * 1000,
  /** Confirmation challenge life. 05 R3.19 */
  confirmationMs: 2 * 60 * 1000,
  /** Approvals remembered as used, so none is redeemed twice. 05 R3.19a */
  redeemedConfirmations: 4096,
  /** Folder-picker selection token life; single use. 03 R5.36 */
  selectionTokenMs: 10 * 60 * 1000,
  /** Selection tokens held at once. 03 R5.36 */
  selectionTokens: 32,
  /** Submission and reply idempotency records. 05 R2.34 */
  idempotencyRecords: 512,
  /** How long one idempotency record is remembered. 05 R2.34 */
  idempotencyMs: 5 * 60 * 1000,
  /** Accepted requests per minute per document and scope; the shell's revision poll is not counted. 05 R2.38, R2.38a */
  ratePerMinute: 120,
  /** Requests in flight per document and scope. 05 R2.38, R2.38a */
  rateConcurrent: 8,
  /** Accepted requests per minute per session, across its documents. 05 R2.38a */
  sessionRatePerMinute: 600,
  /** Requests in flight per session, across its documents. 05 R2.38a */
  sessionRateConcurrent: 32,
  /** Shell revision poll while the tab is visible; paused hidden. 05 R2.17 */
  shellPollMs: 10_000,
  /** The same poll while the session is mid-turn. 05 R2.17a */
  shellPollWorkingMs: 2_000,
  /** How long after the reader answers from the page the working cadence holds. 05 R2.17a */
  shellPollAfterAnswerMs: 60_000,
  /** How long a refreshed document may load behind the shown one before the shell shows it anyway. 05 R2.18a, R-S11 */
  refreshSwapMs: 4_000,
  /** After the last keystroke in a focused text control, how long a new revision waits before the swap; the swap also waits for a pending submission, `setDirty(true)` and an open dialog. 05 R2.21 (U49) */
  swapIdleMs: 3_000,
  /** Reloads in a row that never came back working before the shell stops reloading a document. 05 R2.18d */
  reloadLoopCount: 3,
  /** How long a document must keep answering before that count is cleared. 05 R2.18d */
  reloadLoopClearMs: 10_000,
  /** The shell pings at the load and again after this long. 05 R2.18d */
  reloadPingMs: 7_500,
  /** How long the shell waits for a ping's answer before taking a document for gone. 05 R2.18d */
  reloadWaitMs: 15_000,
  /** `*` in one include pattern; a pattern with more is left as written. 01 R1.19 */
  includePatternStars: 4,
  /** Parts a document includes, all levels together. 01 R1.23 */
  includeParts: 200,
  /** Include elements one document may hold; further ones left as written. 01 R1.23 */
  includeElements: 400,
  /** Unresolved includes reported per document. 01 R1.23 */
  includeReports: 100,
  /** One part; refused above, left as written. 01 R1.23 */
  includePartBytes: 2 * 1024 * 1024,
  /** A part including parts. 01 R1.23 */
  includeDepth: 3,
  /** `pages.read` entries per call. 03 R5.56 */
  pagesReadEntries: 16,
  /** `pages.read` response per call; a larger single document refused, the rest deferred. 03 R5.58 */
  pagesReadBytes: 8 * 1024 * 1024,
  /** A `pages.answer` request: a submission body plus its token. 03 §`pages.answer` */
  pagesAnswerBytes: 96 * 1024,
  /** Embeds on one page; further ones show a placeholder with status `unavailable`. 02 R4.44 */
  embedsPerPage: 32,
  /** Embed refresh while the embedded session works or was just answered. 02 R4.44 */
  embedPollWorkingMs: 3_000,
  /** Embed refresh otherwise; paused hidden; one `pages.read` call per tick per 16 embeds. 02 R4.44 */
  embedPollMs: 10_000,
  /** How long after an answer the working cadence holds for an embed. 02 R4.44 */
  embedPollAfterAnswerMs: 60_000,
  /** Calls one embedded page may make per minute, then `rate_limited`. 02 R4.49 */
  embedCallsPerMinute: 30,
  /** Answer token life; every read renews it. 03 R5.60a, R5.62 */
  answerTokenMs: 2 * 60 * 60 * 1000,
  /** Grants one page may hold. 03 R5.67 */
  grantsPerPage: 64,
  /** Pages that may hold any grant. 03 R5.67 */
  grantPages: 512,
  /** `watch` interval by default. 02 R4.30 */
  watchDefaultMs: 8_000,
  /** `watch` interval, lowest; a live chat costs 30 calls a minute. 02 R4.30, 03 R-C2 */
  watchMinMs: 2_000,
  /** `watch` interval, highest. 02 R4.30 */
  watchMaxMs: 5 * 60 * 1000,
  /** One own file carried in the document where the serving host cannot serve it by URL; larger ones are left as written and named. 05 R-S7 */
  inlineFileBytes: 2 * 1024 * 1024,
  /** All carried files of one document together. 05 R-S7 */
  inlineTotalBytes: 3 * 1024 * 1024,
  /** How far `url()` inside a carried stylesheet is followed. 05 R-S7 */
  inlineCssDepth: 3,
  /** An own media file too large to carry, fetched by the shell instead; the serving host's read limit. 02 R4.25a */
  shellFetchBytes: 25 * 1024 * 1024,
  /** The same for raster images. 02 R4.25a */
  shellFetchImageBytes: 10 * 1024 * 1024,
  /** Offline copy of the entry document kept in the key-value store. 05 R2.30 */
  offlineCopyBytes: 200 * 1024,
  /** Offline copies kept. 05 R2.30 */
  offlineCacheEntries: 32,
  /** All offline copies together. 05 R2.30 */
  offlineCacheBytes: 8 * 1024 * 1024,
  /** A bridge envelope's request id. 05 R3.9 */
  requestIdChars: 96,
  /** A method name on the bridge. 05 R3.9 */
  methodNameChars: 96,
  /** A signed token; a challenge carries its summary, which may name eight files. 05 R2.7, R3.19 */
  tokenChars: 8_192,
  /** An error's `message`. 05 R2.41 */
  errorMessageChars: 512,
  /** Every confirmation's summary except a `decision`'s; room to name every file of a call with its size. 03 R5.78, R-C7 */
  summaryChars: 1024,
  /** Workspaces one `workspaces.list` returns. 03 §`workspaces.list` */
  workspacesMax: 200,
  /** Providers one `providers.list` returns. 03 §`providers.list` */
  providersMax: 64,
  /** Models listed per provider. 03 §`providers.list` */
  modelsPerProvider: 64,
  /** Environments listed per workspace. 03 §`workspaces.list` (PC-18) */
  environmentsPerWorkspace: 64,
  // The five constants 08 §Limits says the reference server moves into limits.ts.
  /** Declined-grant and declined-decision cooldown: per embed before the grant is asked again; per page and wait before a further `decision` call shows a dialog again. 02 R4.49, 03 R-C7 */
  declinedCooldownMs: 10_000,
  /** Confirmation arming delay before a confirmation's Confirm accepts a click. 05 R3.22a */
  confirmArmMs: 400,
  /** The recorder's `timeslice`. 03 R5.71 */
  recorderSliceMs: 250,
  /** Dictate and Attach over a text area, in CSS px. 02 R4.56 */
  textareaIconPx: 16,
  // Server-side extras this server adds (DESIGN §I P28).
  /** How long the shell waits for a kernel's `flushed` before removing a frame. 02 R-K4 */
  draftFlushMs: 200,
  /** How far behind the keystroke a draft reaches the shell. 02 R-K4 */
  draftDebounceMs: 250,
  /** How long after a delivery a user row with the same text is taken for it, where the provider returns no message id. 06 R-P5 */
  ledgerWindowMs: 60_000,
  /** Deliveries the ledger remembers per session. 06 R-P5 */
  ledgerEntries: 256,
  /** One upload envelope (`/upload`, `/attach`, `/transcribe`): the file's bytes as base64 plus the fields. 02 R4.23, 03 R5.72 */
  uploadBodyBytes: Math.ceil((25 * 1024 * 1024 * 4) / 3) + 4096,
});

export type Limits = typeof LIMITS;

/** A byte count as mebibytes, for the guide: "24 MiB". 04 R6.26 */
export function mebibytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 100) / 100} MiB`;
}

/** A byte count as kibibytes, for the guide: "64 KiB". 04 R6.26 */
export function kibibytes(bytes: number): string {
  return `${Math.round((bytes / 1024) * 100) / 100} KiB`;
}
