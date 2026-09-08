import { createRequire as __createRequire } from "node:module";
import { dirname as __pathDirname } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
const require = __createRequire(import.meta.url);
var __filename = __fileURLToPath(import.meta.url);
var __dirname = __pathDirname(__filename);

// src/domain/eligibility.ts
function ineligibleReason(facts) {
  if (facts.deleted) return "deleted";
  if (facts.archived) return "archived";
  if (facts.visibility !== "visible") return "hidden";
  if (facts.parentId !== null) return "child";
  if (facts.forkOfId !== null) return "fork";
  return null;
}
function describeIneligible(reason) {
  switch (reason) {
    case "hidden":
      return "this session is a hidden helper";
    case "child":
      return "this session is a child of another session";
    case "fork":
      return "this session is a fork of another session";
    case "archived":
      return "this session is archived";
    case "deleted":
      return "this session is deleted";
  }
}

// src/domain/limits.ts
var LIMITS = Object.freeze({
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
  answerValueChars: 8e3,
  answerListItems: 64,
  /** Capability request and response, serialised. R5.2 */
  capabilityPayloadBytes: 64 * 1024,
  capabilityJsonDepth: 16,
  capabilityJsonNodes: 1e4,
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
  actionTokenMs: 2 * 60 * 60 * 1e3,
  /** Confirmation challenge lifetime. R3.19 */
  confirmationMs: 2 * 60 * 1e3,
  /** Folder-picker selection token lifetime; single use. R5.36 */
  selectionTokenMs: 10 * 60 * 1e3,
  selectionTokens: 32,
  /** Submission and reply idempotency records. R2.34 */
  idempotencyRecords: 512,
  idempotencyMs: 5 * 60 * 1e3,
  /**
   * Effectful requests per page. RW-8: 120/min and 8 concurrent rather than
   * the spec's 30/4, so a page that lists sessions and refreshes cannot
   * exhaust its own budget (R2.40). The shell's revision poll is not counted.
   */
  ratePerMinute: 120,
  rateConcurrent: 8,
  /** Shell revision poll while the tab is visible. R2.17 */
  shellPollMs: 1e4,
  /** `watch` interval default and clamp. R4.30 */
  watchDefaultMs: 8e3,
  watchMinMs: 2e3,
  watchMaxMs: 5 * 60 * 1e3,
  /** Offline copy of the entry document kept in the host's key-value store. R2.30 */
  offlineCopyBytes: 200 * 1024,
  offlineCacheEntries: 32,
  offlineCacheBytes: 8 * 1024 * 1024,
  /** Bridge envelope identifiers. */
  requestIdChars: 96,
  methodNameChars: 96,
  tokenChars: 4096,
  errorMessageChars: 512,
  summaryChars: 512,
  /** Sizes of lists a capability may return. */
  projectsMax: 200,
  providersMax: 64,
  modelsPerProvider: 64
});
function mebibytes(bytes) {
  return `${Math.round(bytes / (1024 * 1024) * 100) / 100} MiB`;
}
function kibibytes(bytes) {
  return `${Math.round(bytes / 1024)} KiB`;
}

// src/domain/errors.ts
var BRIDGE_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "invalid_params",
  "invalid_response",
  "request_too_large",
  "response_too_large",
  "unsupported_version",
  "unknown_method",
  "stale_page",
  "confirmation_required",
  "confirmation_invalid",
  "cancelled",
  "not_found",
  "conflict",
  "unavailable",
  "rate_limited",
  "handler_error",
  "invalid_result"
];
var BRIDGE_ERROR_CODE_SET = new Set(BRIDGE_ERROR_CODES);
function isBridgeErrorCode(value) {
  return typeof value === "string" && BRIDGE_ERROR_CODE_SET.has(value);
}
var STATUS_BY_CODE = {
  invalid_json: 400,
  invalid_request: 400,
  invalid_params: 400,
  invalid_response: 502,
  request_too_large: 413,
  response_too_large: 500,
  unsupported_version: 400,
  unknown_method: 404,
  stale_page: 409,
  confirmation_required: 401,
  confirmation_invalid: 403,
  cancelled: 400,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  rate_limited: 429,
  handler_error: 500,
  invalid_result: 500,
  forbidden: 403,
  ineligible: 404,
  invalid_session: 400,
  no_page: 404,
  page_too_large: 413
};
var PageError = class _PageError extends Error {
  code;
  status;
  cause;
  constructor(code, publicMessage, options) {
    super(boundedMessage(publicMessage));
    this.name = "PageError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.cause = options?.cause;
  }
  static is(value) {
    return value instanceof _PageError;
  }
};
function boundedMessage(message) {
  const normalized = message.replace(/\s+/g, " ").trim() || "Request failed";
  return normalized.length <= LIMITS.errorMessageChars ? normalized : `${normalized.slice(0, LIMITS.errorMessageChars - 1)}\u2026`;
}
function errorText(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
var PUBLIC_MESSAGES = Object.freeze({
  noPage: "This session has no page yet. Run `bb thread-page init` in the session first.",
  ineligible: "Only visible root sessions have pages.",
  pageTooLarge: `The page's entry document is larger than ${LIMITS.entryDocumentBytes / (1024 * 1024)} MiB and was not served.`,
  unavailable: "The page's source is unreachable. Reconnect its host and try again.",
  staleCopy: "The source host is offline; this cached page is read-only.",
  stalePage: "This page changed; reload it before responding.",
  handler: "Could not execute the page action.",
  rateLimited: "Too many requests from this page; try again shortly.",
  invalidSession: "A valid session id is required.",
  tokenInvalid: "This page session is invalid or expired; reload the page."
});

// src/domain/ids.ts
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
var REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
var METHOD_NAME = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
var REVISION = /^[a-f0-9]{64}$/;
function isSessionId(value) {
  return typeof value === "string" && SESSION_ID.test(value);
}
function isRequestId(value) {
  return typeof value === "string" && REQUEST_ID.test(value);
}
function isMethodName(value) {
  return typeof value === "string" && value.length <= 96 && METHOD_NAME.test(value);
}
function isRevision(value) {
  return typeof value === "string" && REVISION.test(value);
}

// src/pages/layout.ts
var ENTRY_FILE = "index.html";
var UPLOAD_DIR = "uploads";
var LEGACY_ENTRY_FILE = "thread-page.html";
var UPLOAD_NAME = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{6}-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function joinPath(root, ...segments) {
  const base = root.replace(/[\\/]+$/, "");
  return [base, ...segments].join("/");
}
function entryPath(root) {
  return joinPath(root, ENTRY_FILE);
}
function legacyEntryPath(root) {
  return joinPath(root, LEGACY_ENTRY_FILE);
}
function sanitizeUploadSuffix(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._-]+/, "");
  return cleaned.slice(0, 80) || "upload";
}
function uploadFileName(originalName, now, randomHex) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const name = `${stamp}-${randomHex.slice(0, 6)}-${sanitizeUploadSuffix(originalName)}`;
  if (!isSafeUploadName(name)) throw new Error("Generated upload name is invalid");
  return name;
}
function isSafeUploadName(name) {
  return UPLOAD_NAME.test(name) && !name.includes("..");
}

// src/serving/context.ts
function pageUrl(routeBase, session) {
  return `${routeBase}/page?session=${encodeURIComponent(session)}`;
}
function homeUrl(routeBase) {
  return `${routeBase}/home`;
}

// src/domain/html/escape.ts
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// src/agent/seed/theme-css.ts
var THEME_CSS = String.raw`
  :root {
    --bg:        #fbfbfa;
    --surface:   #ffffff;
    --ink:       #16181d;
    --ink-2:     #4a5058;
    --ink-3:     #767d87;
    --rule:      #e3e4e6;
    --rule-soft: #eeeff0;
    --accent:    #2f5cc7;
    --flag:      #a8410f;
    --ok:        #1f6b45;
    --code-bg:   #f2f3f4;
    --measure:   34rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:        #121316;
      --surface:   #191b1f;
      --ink:       #e9eaec;
      --ink-2:     #b0b5bc;
      --ink-3:     #838a93;
      --rule:      #2c2f35;
      --rule-soft: #232227;
      --accent:    #8aa9f0;
      --flag:      #e8a37a;
      --ok:        #79c69d;
      --code-bg:   #22242a;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }

  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 400 16.5px/1.6 ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    font-feature-settings: "kern", "liga";
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  .wrap {
    max-width: calc(var(--measure) + 6rem);
    margin: 0 auto;
    padding: 4.5rem 3rem 8rem;
  }
  @media (max-width: 640px) { .wrap { padding: 2.5rem 1.25rem 5rem; } }

  /* ---- header ---- */

  header.brief-head {
    padding-bottom: 1.75rem;
    margin-bottom: 3rem;
    border-bottom: 1px solid var(--rule);
  }
  header.brief-head h1 {
    margin: 0;
    font-size: 1.9rem;
    line-height: 1.2;
    font-weight: 640;
    letter-spacing: -0.021em;
    text-wrap: balance;
  }
  .brief-meta {
    margin: 0.85rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1.15rem;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* ---- rhythm ---- */

  main > * + * { margin-top: 1.05rem; }

  h2 {
    margin: 3rem 0 0;
    font-size: 1.16rem;
    line-height: 1.3;
    font-weight: 620;
    letter-spacing: -0.012em;
  }
  h2 + * { margin-top: 0.85rem; }

  h3 {
    margin: 2rem 0 0;
    font-size: 0.94rem;
    line-height: 1.35;
    font-weight: 640;
    letter-spacing: 0.005em;
    color: var(--ink-2);
  }
  h3 + * { margin-top: 0.6rem; }

  p, li { max-width: var(--measure); color: var(--ink-2); }
  p { margin: 0; }
  main > p:first-child { font-size: 1.06rem; color: var(--ink); }

  ul, ol { margin: 0; padding-left: 1.3rem; }
  li + li { margin-top: 0.42rem; }
  li::marker { color: var(--ink-3); }

  strong { font-weight: 620; color: var(--ink); }
  em { font-style: italic; }

  a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { text-decoration-thickness: 2px; }

  code {
    font: 0.85em/1.5 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    background: var(--code-bg);
    padding: 0.13em 0.36em;
    border-radius: 4px;
  }
  pre {
    margin: 0;
    background: var(--code-bg);
    border: 1px solid var(--rule-soft);
    border-radius: 8px;
    padding: 0.9rem 1.05rem;
    overflow-x: auto;
    font: 0.83rem/1.6 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
  }
  pre code { background: none; padding: 0; }

  hr {
    margin: 3rem 0;
    border: 0;
    border-top: 1px solid var(--rule);
  }

  /* ---- callouts: use sparingly ---- */

  .card {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1.15rem 1.3rem;
  }
  .card > * + * { margin-top: 0.7rem; }
  .card > h3:first-child { margin-top: 0; }

  .needs-you {
    border-left: 3px solid var(--flag);
    padding: 0.15rem 0 0.15rem 1.05rem;
  }
  .needs-you > * + * { margin-top: 0.55rem; }

  .label {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 660;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--flag);
  }
  .label.done { color: var(--ok); }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.55rem 0.9rem 0.55rem 0;
    border-bottom: 1px solid var(--rule-soft);
    vertical-align: top;
  }
  th {
    font-weight: 620;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  td { color: var(--ink-2); }

  /* ---- forms ----------------------------------------------------------
     Styled off semantic structure, not classes, so a page only ever needs
     plain HTML: fieldset/legend for a group, a wrapping label for a single
     control, small for a hint, button for an action. ------------------- */

  form {
    margin-top: 1.75rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1.4rem 1.45rem 1.3rem;
  }
  form > * + * { margin-top: 1.25rem; }

  /* 'margin: 0' here used to beat 'form > * + *' on specificity, so two groups
     of choices in a row ran together with no gap between them. */
  form fieldset { padding: 0; border: 0; min-width: 0; }
  form > fieldset { margin: 0; }
  form > fieldset + fieldset,
  form > * + fieldset,
  form > fieldset + * { margin-top: 1.25rem; }
  form legend,
  form > label,
  .field > label {
    display: block;
    padding: 0;
    font-size: 0.82rem;
    font-weight: 620;
    letter-spacing: 0.005em;
    color: var(--ink);
  }
  form legend { margin-bottom: 0.5rem; }

  form small, .field .hint {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--ink-3);
  }

  form input[type="file"] {
    display: block; margin-top: 0.45rem; font: inherit; font-size: 0.85rem;
    color: var(--ink-2); max-width: 100%;
  }
  form input[type="file"]::file-selector-button {
    font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * 0.6);
    padding: 0.35rem 0.75rem; margin-right: 0.6rem;
  }
  form input[type="text"], form input[type="number"], form input[type="url"],
  form input[type="email"], form input[type="date"], form textarea, form select {
    display: block;
    width: 100%;
    margin-top: 0.45rem;
    font: inherit;
    font-size: 0.92rem;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--rule);
    border-radius: 7px;
    padding: 0.5rem 0.65rem;
  }
  form textarea { resize: vertical; min-height: 4.5rem; line-height: 1.55; }
  form :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  /* One option row: a label wrapping a radio or checkbox. */
  form label:has(> input[type="radio"]),
  form label:has(> input[type="checkbox"]),
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--ink-2);
    cursor: pointer;
  }
  form label:has(> input[type="radio"]) + label,
  form label:has(> input[type="checkbox"]) + label,
  .choice + .choice { margin-top: 0.4rem; }
  form input[type="radio"], form input[type="checkbox"] {
    margin: 0.3rem 0 0;
    flex: none;
    accent-color: var(--accent);
  }

  form label:has(> input[type="range"]) {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--ink-2);
  }
  form input[type="range"] { flex: 1; min-width: 8rem; accent-color: var(--accent); }
  [data-thread-page-range] {
    flex: none;
    min-width: 2.2rem;
    text-align: right;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  [data-thread-page-status] {
    margin-top: 0.9rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-3);
  }
  [data-thread-page-status][data-state="error"] { color: var(--flag); }
  [data-thread-page-status][data-state="sent"] { color: var(--ok); }

  @media print {
    body { background: #fff; color: #000; }
    .wrap { padding: 0; max-width: none; }
    form { display: none; }
  }
  /* ====================================================================
     FIVE WORLDS

     A theme here is not a palette. It is a palette, a typeface, a shape
     language, a way a screen arrives, an atmosphere, and — the part that
     matters most — its own idea of what an interactive thing looks like.
     Picking one changes how you choose and how you commit, not just what
     it costs to look at.

     Each theme declares both palettes at once as --l-* and --d-*; one
     resolver below maps the live half onto the tokens the base stylesheet
     already uses. The same declarations carry [data-world="x"], which is how
     a card on screen 1 renders a fragment of a page in a world you have not
     entered yet.
     ==================================================================== */

  /* ---- 1. paper — quiet document. Nothing to notice. ---- */
  [data-theme="paper"], [data-world="paper"] {
    --l-bg:#fbfbfa; --l-surface:#ffffff; --l-ink:#16181d; --l-ink-2:#4a5058;
    --l-ink-3:#6c737c; --l-rule:#e3e4e6; --l-rule-soft:#eeeff0; --l-code:#f2f3f4;
    --l-ah:222; --l-as:62; --l-al:48; --l-flag:#a8410f; --l-ok:#1f6b45;
    --d-bg:#121316; --d-surface:#191b1f; --d-ink:#e9eaec; --d-ink-2:#b0b5bc;
    --d-ink-3:#838a93; --d-rule:#2c2f35; --d-rule-soft:#232227; --d-code:#22242a;
    --d-ah:222; --d-as:70; --d-al:74; --d-flag:#e8a37a; --d-ok:#79c69d;
    --font-body: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:10px; --rule-w:1px; --head-weight:640; --head-track:-0.021em;
    --measure:34rem; --shadow:none; --label-case:uppercase; --caps-track:0.07em;
    --h1-size:1.9rem; --h1-lh:1.2;
  }

  /* ---- 2. terminal — console. Everything on a grid, nothing rounded. ---- */
  [data-theme="terminal"], [data-world="terminal"] {
    --l-bg:#f6f6f2; --l-surface:#ffffff; --l-ink:#15201a; --l-ink-2:#3c4a42;
    --l-ink-3:#646f69; --l-rule:#c9d2cb; --l-rule-soft:#e2e7e2; --l-code:#eaeee9;
    --l-ah:150; --l-as:88; --l-al:26; --l-flag:#a33a10; --l-ok:#14663c;
    --d-bg:#080b09; --d-surface:#0d120e; --d-ink:#cfe6d5; --d-ink-2:#94b39d;
    --d-ink-3:#6b8573; --d-rule:#20301e; --d-rule-soft:#161f16; --d-code:#111811;
    --d-ah:150; --d-as:64; --d-al:62; --d-flag:#e0a44f; --d-ok:#63d18e;
    --font-body: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    --font-head: var(--font-body);
    --radius:0px; --rule-w:1px; --head-weight:700; --head-track:0em;
    --measure:33rem; --shadow:none; --label-case:uppercase; --caps-track:0.14em;
    --h1-size:1.6rem; --h1-lh:1.25;
  }

  /* ---- 3. atrium — daylight on paper. Warm, serif, things have weight. ---- */
  [data-theme="atrium"], [data-world="atrium"] {
    --l-bg:#f6f2e9; --l-surface:#fffdf8; --l-ink:#1e1a14; --l-ink-2:#4b4337;
    --l-ink-3:#726958; --l-rule:#ddd5c4; --l-rule-soft:#ebe5d8; --l-code:#efe9db;
    --l-ah:142; --l-as:34; --l-al:30; --l-flag:#8a4b18; --l-ok:#2c5f3f;
    --d-bg:#16150f; --d-surface:#1f1d15; --d-ink:#f1ebdc; --d-ink-2:#c2b9a3;
    --d-ink-3:#8f8672; --d-rule:#33301f; --d-rule-soft:#262418; --d-code:#242216;
    --d-ah:130; --d-as:32; --d-al:66; --d-flag:#d99a5e; --d-ok:#8fc2a0;
    --font-body: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    --font-head: var(--font-body);
    --radius:14px; --rule-w:1px; --head-weight:600; --head-track:-0.008em;
    --measure:38rem;
    --shadow: 0 1px 2px rgba(40,30,10,.06), 0 10px 30px -14px rgba(40,30,10,.28);
    --label-case:none; --caps-track:0.02em;
    --h1-size:2.15rem; --h1-lh:1.15;
  }

  /* ---- 4. volume — depth. A lit scene with the page standing in it. ---- */
  [data-theme="volume"], [data-world="volume"] {
    --l-bg:#eef1f6; --l-surface:#ffffff; --l-ink:#0d1424; --l-ink-2:#3a4658;
    --l-ink-3:#5e687b; --l-rule:#ccd4e2; --l-rule-soft:#e0e6ef; --l-code:#e6ebf3;
    --l-ah:196; --l-as:78; --l-al:32; --l-flag:#9c4415; --l-ok:#136b58;
    --d-bg:#080b12; --d-surface:#111823; --d-ink:#dfe8f5; --d-ink-2:#a3b2c8;
    --d-ink-3:#74849b; --d-rule:#1e2a3c; --d-rule-soft:#151d2a; --d-code:#131b27;
    --d-ah:190; --d-as:82; --d-al:62; --d-flag:#e2a06b; --d-ok:#4fc7ad;
    --font-body: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:6px; --rule-w:1px; --head-weight:700; --head-track:-0.03em;
    --measure:34rem;
    --shadow: 0 2px 4px rgba(0,0,0,.18), 0 22px 40px -20px rgba(0,0,0,.45);
    --label-case:uppercase; --caps-track:0.11em;
    --h1-size:2.1rem; --h1-lh:1.1;
  }

  /* ---- 5. bloom — shapes and colour. Big type, soft mass, round everything. ---- */
  [data-theme="bloom"], [data-world="bloom"] {
    --l-bg:#fdf7f4; --l-surface:#ffffff; --l-ink:#1d1226; --l-ink-2:#4c3a59;
    --l-ink-3:#75647f; --l-rule:#ecdfe6; --l-rule-soft:#f5eef1; --l-code:#f6eef4;
    --l-ah:330; --l-as:62; --l-al:42; --l-flag:#b03d24; --l-ok:#2f6b58;
    --d-bg:#150e1c; --d-surface:#211729; --d-ink:#f4ecf6; --d-ink-2:#c0aecb;
    --d-ink-3:#95839f; --d-rule:#33243d; --d-rule-soft:#261a2e; --d-code:#281c32;
    --d-ah:326; --d-as:76; --d-al:72; --d-flag:#f0a184; --d-ok:#7fd0b4;
    --font-body: "Avenir Next", Avenir, "Futura", ui-rounded, ui-sans-serif, -apple-system, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:22px; --rule-w:1.5px; --head-weight:700; --head-track:-0.035em;
    --measure:32rem;
    --shadow: 0 2px 6px rgba(60,20,60,.06), 0 18px 40px -18px rgba(60,20,60,.22);
    --label-case:none; --caps-track:0.03em;
    --h1-size:2.6rem; --h1-lh:1.02;
  }

  /* ---- the resolver: which half of a palette is live ---- */

  :root, [data-world] {
    --bg:var(--l-bg); --surface:var(--l-surface); --ink:var(--l-ink);
    --ink-2:var(--l-ink-2); --ink-3:var(--l-ink-3); --rule:var(--l-rule);
    --rule-soft:var(--l-rule-soft); --code-bg:var(--l-code);
    --ah:var(--l-ah); --as:var(--l-as); --al:var(--l-al);
    --flag:var(--l-flag); --ok:var(--l-ok);
  }
  @media (prefers-color-scheme: dark) {
    :root[data-mode="system"], :root[data-mode="system"] [data-world] {
      --bg:var(--d-bg); --surface:var(--d-surface); --ink:var(--d-ink);
      --ink-2:var(--d-ink-2); --ink-3:var(--d-ink-3); --rule:var(--d-rule);
      --rule-soft:var(--d-rule-soft); --code-bg:var(--d-code);
      --ah:var(--d-ah); --as:var(--d-as); --al:var(--d-al);
      --flag:var(--d-flag); --ok:var(--d-ok);
    }
  }
  :root[data-mode="dark"], :root[data-mode="dark"] [data-world] {
    --bg:var(--d-bg); --surface:var(--d-surface); --ink:var(--d-ink);
    --ink-2:var(--d-ink-2); --ink-3:var(--d-ink-3); --rule:var(--d-rule);
    --rule-soft:var(--d-rule-soft); --code-bg:var(--d-code);
    --ah:var(--d-ah); --as:var(--d-as); --al:var(--d-al);
    --flag:var(--d-flag); --ok:var(--d-ok);
  }

  /* Accent is composed, so the hue slider moves one number and saturation and
     lightness stay where the theme put them — which is what stops a dragged
     hue quietly failing contrast. */
  :root, [data-world] {
    --accent: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%));
    --accent-soft: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%) / 0.12);
    --accent-line: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%) / 0.42);
  }

  /* ---- motion, declared at its reduced value ----
     Stillness is the default and movement is the enhancement, so a reader who
     asked for less and a reader who said nothing get the same page. */
  :root { --dur: 0ms; --slow: 0ms; --ease: cubic-bezier(.2,.75,.25,1); }
  @media (prefers-reduced-motion: no-preference) {
    :root { --dur: 220ms; --slow: 620ms; }
  }

  /* ---- density: two numbers the reader drags ---- */
  :root { --space: 1; --size: 16.5px; }

  body { font-family: var(--font-body); font-size: var(--size); }
  h1, h2, h3, legend, .h { font-family: var(--font-head); }
  /* The base sheet sizes the h1 through 'header.brief-head h1', which outranks a
     bare 'h1' — so the world's own display scale has to be stated there too. */
  header.brief-head h1, h1 {
    font-size: var(--h1-size); line-height: var(--h1-lh);
    font-weight: var(--head-weight); letter-spacing: var(--head-track);
  }
  h2 { font-weight: var(--head-weight); letter-spacing: var(--head-track); }
  p, li { max-width: var(--measure); }

  /* Prose stays inside --measure through 'p, li'; the page itself is wider so a
     picker is not forced into one column. */
  .wrap { max-width: calc(var(--measure) + 12rem);
          padding: calc(3rem * var(--space)) 3rem calc(5rem * var(--space)); }
  /* This rule sits after the base sheet's own narrow-screen padding and so
     replaced it. On a 320 px screen that was 48 px of gutter each side — a
     third of the width — until it was measured. */
  @media (max-width: 40rem) {
    .wrap { padding: calc(2.2rem * var(--space)) 1.15rem calc(4rem * var(--space)); }
  }
  main > * + * { margin-top: calc(1.05rem * var(--space)); }
  h2 { margin-top: calc(2.4rem * var(--space)); }
  h2 + * { margin-top: calc(0.8rem * var(--space)); }
  .card { border-radius: var(--radius); box-shadow: var(--shadow);
          padding: calc(1.1rem * var(--space)) 1.25rem; }
  form { border-radius: var(--radius); box-shadow: var(--shadow); }
  pre, code { border-radius: calc(var(--radius) * 0.35); }
  th, .label { text-transform: var(--label-case); letter-spacing: var(--caps-track); }
  hr, header.brief-head { border-color: var(--rule); }
  header.brief-head { border-bottom-width: var(--rule-w); }

  body { transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease); }

  /* ---- atmosphere -----------------------------------------------------
     Every peak colour below is opaque and sits a few percent from its own
     --bg, so the composite between them is bounded by two colours that can
     both be measured. That is what makes an atmosphere layer checkable
     rather than hoped about, and the page is complete with it off. */

  [data-theme="paper"],    [data-world="paper"]    { --l-atmos-1:#fbfbfa; --l-atmos-2:#fbfbfa; --d-atmos-1:#121316; --d-atmos-2:#121316; }
  [data-theme="terminal"], [data-world="terminal"] { --l-atmos-1:#f0f2ec; --l-atmos-2:#f2f4ef; --d-atmos-1:#0b110c; --d-atmos-2:#091009; }
  [data-theme="atrium"],   [data-world="atrium"]   { --l-atmos-1:#fdf8ec; --l-atmos-2:#f2ecdf; --d-atmos-1:#1e1c13; --d-atmos-2:#100f0a; }
  [data-theme="volume"],   [data-world="volume"]   { --l-atmos-1:#ffffff; --l-atmos-2:#e4e9f1; --d-atmos-1:#101927; --d-atmos-2:#04060a; }
  [data-theme="bloom"],    [data-world="bloom"]    { --l-atmos-1:#fbe9f1; --l-atmos-2:#ebf1fd; --d-atmos-1:#241430; --d-atmos-2:#10182c; }

  :root, [data-world] { --atmos-1:var(--l-atmos-1); --atmos-2:var(--l-atmos-2); }
  @media (prefers-color-scheme: dark) {
    :root[data-mode="system"], :root[data-mode="system"] [data-world] {
      --atmos-1:var(--d-atmos-1); --atmos-2:var(--d-atmos-2);
    }
  }
  :root[data-mode="dark"], :root[data-mode="dark"] [data-world] {
    --atmos-1:var(--d-atmos-1); --atmos-2:var(--d-atmos-2);
  }

  html { background: var(--bg); }
  body { background: none; }

  .atmosphere { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
  :root[data-atmos="off"] .atmosphere { display: none; }

  :root[data-theme="paper"] .atmosphere { display: none; }

  /* terminal: a faint character grid, because that is what it is made of */
  :root[data-theme="terminal"] .atmosphere {
    background-image:
      linear-gradient(to right, var(--atmos-1) 1px, transparent 1px),
      linear-gradient(to bottom, var(--atmos-1) 1px, transparent 1px);
    background-size: 1.1rem 1.65rem;
  }
  /* atrium: light from the upper left, and the floor falling away */
  :root[data-theme="atrium"] .atmosphere {
    background:
      radial-gradient(70rem 42rem at 12% -12%, var(--atmos-1), transparent 68%),
      linear-gradient(to bottom, transparent 55%, var(--atmos-2));
  }
  /* volume: one light source and a hard vignette, so the page reads as an object */
  :root[data-theme="volume"] .atmosphere {
    background:
      radial-gradient(46rem 34rem at 50% -8%, var(--atmos-1), transparent 62%),
      radial-gradient(90rem 70rem at 50% 120%, var(--atmos-2), transparent 70%);
  }
  /* bloom: mass and colour, nothing representational */
  :root[data-theme="bloom"] .atmosphere {
    background:
      radial-gradient(32rem 32rem at 8% 4%, var(--atmos-1), transparent 62%),
      radial-gradient(28rem 28rem at 96% 22%, var(--atmos-2), transparent 60%),
      radial-gradient(38rem 26rem at 40% 108%, var(--atmos-1), transparent 66%);
  }


  /* ====================================================================
     THE WORLD, APPLIED TO A PAGE

     Above this line is the design system: five worlds, one resolver. Below
     it is how a page written in plain semantic HTML picks the current world
     up — no class names, because the authoring rule is that a page is plain
     HTML and the conventions live here.

     To change the whole system's look, change one attribute on <html>:
         data-theme="paper | terminal | atrium | volume | bloom"
     ==================================================================== */

  /* ---- choosing: how a picked option reads, per world ---------------- */

  form label:has(> input[type="radio"]),
  form label:has(> input[type="checkbox"]) {
    flex-wrap: wrap;
    padding: 0.28rem 0.5rem;
    margin-left: -0.5rem;
    border-radius: calc(var(--radius) * 0.6);
    transition: transform var(--dur) var(--ease), background-color var(--dur) var(--ease),
                box-shadow var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  /* A hint belongs under the option it qualifies, not squeezed beside it. */
  form label:has(> input[type="radio"]) > small,
  form label:has(> input[type="checkbox"]) > small {
    flex: 0 0 100%; margin-left: 1.35rem; margin-top: 0.2rem;
  }
  form label:has(input:checked) { color: var(--ink); }

  :root[data-theme="paper"] form label:has(input:checked) {
    box-shadow: inset 2px 0 0 var(--accent);
  }

  /* terminal draws its own control, because a native radio is not made of
     characters and everything else in this world is */
  :root[data-theme="terminal"] form input[type="radio"],
  :root[data-theme="terminal"] form input[type="checkbox"] { position: absolute; opacity: 0; }
  :root[data-theme="terminal"] form label:has(> input[type="radio"])::before,
  :root[data-theme="terminal"] form label:has(> input[type="checkbox"])::before {
    content: "[ ]"; flex: none; color: var(--ink-3); letter-spacing: -0.05em;
  }
  :root[data-theme="terminal"] form label:has(input:checked)::before {
    content: "[\2588]"; color: var(--accent);
  }
  :root[data-theme="terminal"] form label:has(input:checked) { background: var(--rule-soft); }
  :root[data-theme="terminal"] form label:has(> input[type="radio"]) > small,
  :root[data-theme="terminal"] form label:has(> input[type="checkbox"]) > small { margin-left: 2.1rem; }

  :root[data-theme="atrium"] form label:has(input:checked) {
    background: var(--surface); transform: translateY(-2px); box-shadow: var(--shadow);
  }

  :root[data-theme="volume"] form fieldset { perspective: 900px; }
  :root[data-theme="volume"] form label:has(input:checked) {
    background: var(--surface); box-shadow: var(--shadow);
    border-left: 2px solid var(--accent);
    transform: rotateY(-2.2deg) translateZ(16px);
  }

  :root[data-theme="bloom"] form label:has(> input[type="radio"]),
  :root[data-theme="bloom"] form label:has(> input[type="checkbox"]) {
    border-radius: 99px; margin-left: 0; padding: 0.34rem 0.85rem;
  }
  :root[data-theme="bloom"] form label:has(input:checked) {
    background: var(--accent); color: var(--bg);
  }

  /* ---- committing: the primary action in the world's own material -----
     Scoped to a form's own children so the dictation button, which lives
     inside a .voice-field, keeps its own shape. */

  form > button, form > p > button {
    font: inherit; font-size: 0.9rem; font-weight: 640; cursor: pointer;
    color: var(--bg); background: var(--accent);
    border: var(--rule-w) solid var(--accent);
    border-radius: calc(var(--radius) * 0.7);
    padding: 0.55rem 1.15rem;
    transition: transform var(--dur) var(--ease), filter var(--dur) var(--ease),
                box-shadow var(--dur) var(--ease);
  }
  form > button + button, form > p > button + button { margin-left: 0.45rem; }
  form > button:first-of-type, form > p > button:first-of-type {
    color: var(--bg); background: var(--accent); border-color: var(--accent);
  }
  /* A second button is the alternative, not a rival. */
  form > button:not(:first-of-type), form > p > button:not(:first-of-type) {
    color: var(--accent); background: transparent; border-color: var(--rule);
  }
  form > button:hover:not(:disabled), form > p > button:hover:not(:disabled) { filter: brightness(1.08); }
  form > button:disabled, form > p > button:disabled { opacity: 0.5; cursor: default; filter: none; }

  :root[data-theme="terminal"] form > button:first-of-type,
  :root[data-theme="terminal"] form > p > button:first-of-type {
    background: var(--surface); color: var(--accent); border-color: var(--rule);
  }
  :root[data-theme="terminal"] form > button:hover:not(:disabled),
  :root[data-theme="terminal"] form > p > button:hover:not(:disabled) { border-color: var(--accent); }

  :root[data-theme="atrium"] form > button:first-of-type,
  :root[data-theme="atrium"] form > p > button:first-of-type { border-radius: 99px; box-shadow: var(--shadow); }

  /* volume commits by pressing an object, so the button is one: a lit face
     over a darker edge that the press pushes into the surface */
  :root[data-theme="volume"] form > button:first-of-type,
  :root[data-theme="volume"] form > p > button:first-of-type {
    box-shadow: 0 2px 0 hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 0.6%)),
                0 8px 16px -8px rgba(0, 0, 0, 0.55);
  }
  :root[data-theme="volume"] form > button:active:not(:disabled),
  :root[data-theme="volume"] form > p > button:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: 0 0 0 hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 0.6%));
  }

  :root[data-theme="bloom"] form > button:first-of-type,
  :root[data-theme="bloom"] form > p > button:first-of-type {
    border-radius: 99px; padding: 0.6rem 1.35rem; font-weight: 700;
  }
`;

// src/agent/seed/seed.ts
var DEFAULT_PAGE_SEED = `<!doctype html>
<html lang="en" data-theme="volume" data-mode="system" data-atmos="on">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>{{TITLE}}</title>
  <style>${THEME_CSS}</style>
</head>
<body>
  <div class="atmosphere" aria-hidden="true"></div>
  <div class="wrap">

  <header class="brief-head">
    <h1>{{TITLE}}</h1>
    <p class="brief-meta"><span>{{DATE}}</span></p>
  </header>

  <!--
    Write inside <main>. Plain semantic HTML is already styled: h2, p, ul,
    table, form, fieldset/legend, a wrapping label, small, details. Three
    class names exist: .card boxes an aside, .needs-you flags a block that is
    blocked on the reader, .label is a small uppercase tag.

    Every <form> answers this session automatically unless it carries
    data-thread-page-manual. Blank answers are valid. A <form method="dialog">
    you only meant as a local confirm still sends a message unless it opts out.

    Files you put beside this index.html are served relatively: <img
    src="chart.png">, <link href="page.css">, <script src="app.js">, nested
    paths included. Ordinary <a href="https://\u2026"> links work.

    data-theme: paper | terminal | atrium | volume | bloom.
    data-mode: system | light | dark. data-atmos: on | off.
    Extra CSS goes in one more <style>, everything inside @scope (main),
    colour and shape from var(--token) only.

    Never use window.prompt, alert, confirm or window.open: the sandbox
    silences them. For anything more \u2014 charts, files, live session state,
    starting sessions, links \u2014 run: bb thread-page guide
  -->
  <main>
    <p>Replace this with what changed and what you need from the reader.</p>

    <form data-title="{{TITLE}}">
      <label>Reply
        <textarea name="reply" rows="4"></textarea>
      </label>
      <button name="action" value="Reply">Reply</button>
    </form>
  </main>

  </div>
</body>
</html>
`;
function renderSeed(template, title2, now = /* @__PURE__ */ new Date()) {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return template.replaceAll("{{TITLE}}", escapeHtml(title2)).replaceAll("{{DATE}}", escapeHtml(date));
}

// src/agent/cli.ts
function registerCli(bb, deps) {
  bb.cli.register({
    name: "thread-page",
    summary: "The page this session writes for its reader: create it, print the authoring guide, make it home",
    commands: [
      { name: "init", summary: "Create this session's page if absent; print its path and link", usage: "bb thread-page init" },
      { name: "guide", summary: "Print the authoring guide (forms, files, capabilities, limits)", usage: "bb thread-page guide" },
      { name: "home", summary: "Make this session's page the home page every page links back to", usage: "bb thread-page home [--clear]" },
      { name: "status", summary: "Show settings, the instruction new sessions get, and this session's page", usage: "bb thread-page status" }
    ],
    async run(argv, context) {
      const [command, ...rest] = argv;
      try {
        switch (command) {
          case "init":
            return rest.length === 0 ? await init(deps, context) : usage();
          case "guide":
            return rest.length === 0 ? { exitCode: 0, stdout: `${deps.guide}
` } : usage();
          case "home":
            if (rest.length === 0) return await home(deps, context);
            if (rest.length === 1 && rest[0] === "--clear") return await clearHome(deps);
            return usage("bb thread-page home [--clear]");
          case "status":
            return rest.length === 0 ? await status(deps, context) : usage();
          default:
            return usage();
        }
      } catch (error) {
        deps.serving.host.log.warn(`cli ${command ?? ""}: ${errorText(PageError.is(error) ? error.cause ?? error : error)}`);
        return { exitCode: 1, stderr: `Could not run thread-page ${command ?? ""}: ${errorText(error)}
` };
      }
    }
  });
}
function usage(text = "bb thread-page <init|guide|home [--clear]|status>") {
  return { exitCode: 2, stderr: `Usage: ${text}
` };
}
async function currentSession(deps, context) {
  if (!context.threadId) return { skip: "no current session" };
  const session = await deps.serving.host.sessions.get(context.threadId);
  if (!session) return { skip: "the current session does not exist" };
  const reason = ineligibleReason(session);
  if (reason) return { skip: describeIneligible(reason) };
  return { id: session.id, session };
}
function skipLine(reason) {
  return { exitCode: 0, stdout: `state: SKIP \u2014 ${reason}; this session has no page. Answer normally in chat and do not create one.
` };
}
async function link(deps, path) {
  const origin = await deps.serving.host.origin.public();
  return origin ? `${origin}${path}` : path;
}
async function ensurePage(deps, id, title2) {
  const { serving } = deps;
  const location = await serving.host.sessions.storage(id);
  const seed = renderSeed(serving.settings.current().pageSeedHtml, title2);
  const outcome = await serving.host.files.write(location, ENTRY_FILE, Buffer.from(seed, "utf8"), { onlyIfAbsent: true });
  const state = outcome === "written" ? "created" : "existing";
  let problem = null;
  if (state === "created") {
    await serving.pages.remember(id, seed);
  } else {
    try {
      await serving.pages.load(id);
    } catch (error) {
      problem = PageError.is(error) ? error.message : errorText(error);
    }
  }
  const legacy = await serving.host.files.exist(location.hostId, [legacyEntryPath(location.rootPath)]).then((existence) => existence[legacyEntryPath(location.rootPath)] === true).catch(() => false);
  return { absolutePath: entryPath(location.rootPath), state, legacy, problem };
}
async function init(deps, context) {
  const current = await currentSession(deps, context);
  if ("skip" in current) return skipLine(current.skip);
  const { absolutePath, state, legacy, problem } = await ensurePage(deps, current.id, current.session.title);
  const url = await link(deps, pageUrl(deps.serving.routeBase, current.id));
  const lines = [
    `page: ${absolutePath}`,
    `link: [Open the Thread Page](${url})`,
    state === "created" ? "state: NEW \u2014 seeded; make this page fit the task, keep a way to answer, then reply in chat with the link and one line." : "state: EXISTING \u2014 read it before editing; update it this turn, keep a way to answer, then reply in chat with the link and one line.",
    `site: files beside ${ENTRY_FILE} are served relatively (nested paths included); ${UPLOAD_DIR}/ holds what the reader attaches.`,
    "guide: bb thread-page guide  (files, charts, live session state, starting sessions, links, limits)"
  ];
  if (problem) lines.push(`warning: the existing page cannot be served \u2014 ${problem}`);
  if (legacy) lines.push(`note: a ${LEGACY_ENTRY_FILE} from the previous plugin version is beside it; it is not served. Move what you want from it into ${ENTRY_FILE}.`);
  return { exitCode: 0, stdout: `${lines.join("\n")}
` };
}
async function home(deps, context) {
  const current = await currentSession(deps, context);
  if ("skip" in current) return { exitCode: 2, stderr: `Cannot make this session home: ${current.skip}. Run it from a visible root session.
` };
  const { serving } = deps;
  const previous = serving.settings.current().homeSessionId;
  const lines = [];
  if (isSessionId(previous) && previous !== current.id) {
    const other = await serving.host.sessions.get(previous).catch(() => null);
    lines.push(`warning: home was ${other ? `\u201C${other.title}\u201D (${previous})` : previous}; it now points here instead.`);
  }
  const { state } = await ensurePage(deps, current.id, current.session.title);
  await serving.settings.set({ homeSessionId: current.id });
  const url = await link(deps, homeUrl(serving.routeBase));
  lines.push(
    `home: ${current.id}`,
    `link: [Sessions](${url})`,
    "Every other page now shows a \u201C\u2190 Sessions\u201D link back to this one.",
    state === "created" ? "state: NEW \u2014 a plain seed was created for this session; build the hub yourself (sessions.snapshot, projects.list, pages.open, sessions.start). See bb thread-page guide \xA7The home page." : "state: EXISTING \u2014 this session's page was left untouched."
  );
  return { exitCode: 0, stdout: `${lines.join("\n")}
` };
}
async function clearHome(deps) {
  await deps.serving.settings.set({ homeSessionId: null });
  return { exitCode: 0, stdout: "home: cleared \u2014 pages no longer show a Sessions link.\n" };
}
async function status(deps, context) {
  const { serving } = deps;
  const settings = serving.settings.current();
  const instruction = deps.effectiveInstruction();
  const lines = [
    "# Thread Pages status",
    "",
    `agentInstructions: ${settings.agentInstructions ? "on" : "off"}`,
    `workingLabel: ${settings.workingLabel ? JSON.stringify(settings.workingLabel) : "(blank \u2014 indicator hidden)"}`,
    `homeSessionId: ${settings.homeSessionId || "(none \u2014 pages show no Sessions link)"}`,
    `site strategy: ${serving.site.name}`,
    `limits: entry ${LIMITS.entryDocumentBytes / (1024 * 1024)} MiB, upload ${LIMITS.uploadFileBytes / (1024 * 1024)} MiB \xD7 ${LIMITS.uploadsPerForm}, rate ${LIMITS.ratePerMinute}/min`,
    "",
    "## Instruction a new eligible session receives now",
    "",
    instruction ?? "(none \u2014 agentInstructions is off)"
  ];
  const current = await currentSession(deps, context);
  lines.push("", "## This session");
  if ("skip" in current) {
    lines.push(`no page: ${current.skip}`);
  } else {
    const location = await serving.host.sessions.storage(current.id);
    lines.push(`page: ${joinPath(location.rootPath, ENTRY_FILE)}`, `link: ${await link(deps, pageUrl(serving.routeBase, current.id))}`);
    try {
      const page = await serving.pages.load(current.id);
      lines.push(`revision: ${page.revision}${page.stale ? " (offline copy)" : ""}`);
    } catch (error) {
      lines.push(`revision: ${PageError.is(error) ? error.message : errorText(error)}`);
    }
  }
  return { exitCode: 0, stdout: `${lines.join("\n")}
` };
}

// src/agent/guide.ts
function buildGuide(registry, site) {
  return [
    intro(),
    plainHtml(),
    forms(),
    uploads(),
    ownFiles(site),
    runtimeApi(),
    capabilities(registry),
    startingSessions(),
    network(),
    unavailable(),
    composition(),
    home2(),
    accessibility(),
    limits(),
    limitations(site)
  ].join("\n\n");
}
var intro = () => `# Thread Pages \u2014 authoring guide

A page is a complete HTML document you edit directly; saving publishes it. It
runs in a sandboxed frame on an opaque origin with no host credentials, and
talks to the host only through captured forms and \`window.threadPage\`. Use
the smallest shape that makes the task easier: plain semantic HTML first, a
mini-app only when the shape of the thing is not prose.

Your page root is your session's storage directory (\`$BB_THREAD_STORAGE\`):

    ${ENTRY_FILE}       the entry document \u2014 the page
    <any files>      served beside it, nested directories included
    ${UPLOAD_DIR}/         files the reader attached, named by the host`;
var plainHtml = () => `## What plain HTML already gives you

The seed carries its own stylesheet, so semantic HTML is already styled.

    h2, p, ul, table      the page's type scale and rhythm
    form                  a panel wired to your session, with a status line
    fieldset + legend     a named group; the legend becomes the question
    label wrapping one    the label becomes that answer's name
    small inside a label  a hint (never part of the answer's name)
    input type=range      a slider with a live value readout
    input type=file       uploaded on submit, path sent to you
    details/summary       detail on demand; add name="x" for an accordion
    div.card              a boxed aside
    p.needs-you           a flagged block, for what is blocked on the reader
    span.label            a small uppercase tag

Three class names; everything else keys off what the element is. The look is
three attributes on <html>: data-theme (paper | terminal | atrium | volume |
bloom), data-mode (system | light | dark), data-atmos (on | off). Extra CSS
goes in one more <style>, everything inside @scope (main), colour and shape
from var(--token) only \u2014 that is what keeps a bespoke chart right in every
world and in dark mode. You may replace the stylesheet entirely; the page is
yours.`;
var forms = () => `## Forms

Every <form> in the document is captured and delivered to your session as a
message \u2014 no JavaScript needed. Add data-thread-page-manual to a form your
own script owns; the host then leaves it entirely alone.

- Nothing is required and blank is a real answer: native validation is
  suppressed, and a blank field arrives as "(left blank)".
- Answer names come from, in order: data-label on the control, the enclosing
  fieldset's legend, aria-label, the wrapping label's text, a <label for>,
  the field name. Hints, options and nested controls are excluded.
- Groups collapse: one checkbox is Yes/No; several checkboxes with one name
  are a list of the checked values; radios are the one checked value or
  blank; a multiple <select> is a list.
- The submit button's value leads the message as **Action**, so several
  <button name="action" value="\u2026"> give one-click answers.
- Each form has its own pending, dirty and status state. While a submission
  is in flight its controls are disabled; afterwards the status line says
  "Sent (queued)" or why it failed.
- Typing into a captured form marks the page dirty, so a new version of the
  page does not reload under the reader. Custom state the host cannot see:
  window.threadPage.setDirty(true|false).

The message you receive looks like:

    The user answered the form on your Thread Page \u2014 <form's data-title or the h1>.

    **Action**
    Approve

    **Which approach**
    second

    **Anything else**
    (left blank)

### The dialog trap

A <form method="dialog"> inside a <dialog> is a form, so it is captured too.
If you write one as a purely local confirm and forget the opt-out attribute,
pressing its button **sends a real message you did not intend**, and because
its buttons carry control-flow values, you receive a plausible fabricated
decision:

    The user answered the form on your Thread Page \u2014 <the page's heading>.

    **Action**
    confirm

Nothing marks it as accidental, and if a turn is running it arrives on the
next one, detached from what caused it. Put data-thread-page-manual on every
dialog form that is not meant to answer you.`;
var uploads = () => `## Files the reader sends you

A captured form may contain <input type="file"> (multiple is fine). On submit
the files are uploaded first, then the submission is delivered naming them:

    **Attached files**
    - \`$BB_THREAD_STORAGE/${UPLOAD_DIR}/20260908-161200-3f9a1c-report.pdf\` (\u2026, 48213 bytes)

Read them from there with your normal tools. Limits: ${mebibytes(LIMITS.uploadFileBytes)} per file,
${LIMITS.uploadsPerForm} files per form (extras are dropped visibly). Names are generated by
the host; the reader's filename is only a suffix. An upload that fails shows
in the form's status line and no submission claims the missing file.`;
var ownFiles = (site) => `## Files you show the reader

Put them beside ${ENTRY_FILE} and reference them relatively \u2014 nested paths,
spaces and punctuation in names are all fine:

    <link rel="stylesheet" href="style.css">
    <script src="app.js"></script>
    <img src="figures/chart.png" alt="\u2026">

No permission, no declaration, no API: writing a file into your page root is
enough. Keep everything inside your own page root; another agent's page is
not yours to write.${site.name === "core-storage" ? `

**One limitation on this host:** \`fetch("data.json")\` of your own file from
page script is refused (403) \u2014 the host's file route rejects the sandbox's
\`Origin: null\`. Subresources (<script>, <link>, <img>) load normally, so
load data with <script src="data.js"> or inline it in the document. Remote
fetches work (see Network).` : `

Page script may also fetch its own files as data: \`await fetch("data.json")\`.`}`;
var runtimeApi = () => `## window.threadPage

The complete page-facing API; it is frozen and cannot be replaced.

    window.threadPage.version               // 1
    await window.threadPage.invoke(method, params)
    const stop = window.threadPage.watch(method, params, (value, error) => {\u2026}, { intervalMs })
    window.threadPage.setDirty(true | false)

- \`invoke\` resolves with the capability's result and rejects with an Error
  whose \`code\` is one of: invalid_json, invalid_request, invalid_params,
  invalid_response, request_too_large, response_too_large,
  unsupported_version, unknown_method, stale_page, confirmation_required,
  confirmation_invalid, cancelled, not_found, conflict, unavailable,
  rate_limited, handler_error, invalid_result. Calls made before the page is
  connected are queued, never lost.
- \`watch\` polls a read capability: default every ${LIMITS.watchDefaultMs / 1e3} s, clamped to
  ${LIMITS.watchMinMs / 1e3} s\u2013${LIMITS.watchMaxMs / 6e4} min, paused while the tab is hidden. Errors go to the
  listener's second argument. Call the returned function to stop; a page that
  never calls watch causes no polling.
- \`stale_page\` means the page changed under the call: the shell offers a
  reload. \`cancelled\` means the reader declined a confirmation \u2014 a normal
  outcome every page calling a confirmed capability must handle, not an error.

Check what is enabled rather than assume: \`(await invoke("context.get")).capabilities\`.`;
function capabilities(registry) {
  const rows = registry.list().map((spec2) => {
    const status2 = spec2.implemented ? spec2.confirmed ? "confirmed in trusted chrome" : "no confirmation" : "not implemented on this host: unknown_method";
    const lines = [`### \`${spec2.method}\` \u2014 ${spec2.effect} \xB7 ${status2}`, "", spec2.description, "", `Parameters: ${spec2.doc.params}`, "", `Result: ${spec2.doc.result}`];
    if (spec2.doc.notes) lines.push("", spec2.doc.notes);
    return lines.join("\n");
  });
  return `## Capabilities

Every way a page can affect anything outside itself. Effects: read;
own-session-write; cross-session-write, destructive and device (always
confirmed); navigation (confirmed when it leaves this host). A confirmed
capability shows a dialog in trusted chrome with the host's own wording; you
do not build it and cannot word it. Every capability validates its
parameters exactly \u2014 unknown keys are refused \u2014 and returns only the fields
listed here.

${rows.join("\n\n")}`;
}
var startingSessions = () => `## Starting work from a page

\`sessions.start\` is how a page that should stay put comes to exist: its
buttons start fresh sessions instead of messaging you, so nothing asks you to
rewrite it. It succeeds with only a project and a prompt:

    await window.threadPage.invoke("sessions.start", {
      projectId, prompt: "Run the test suite. Report failures only; change nothing."
    });

What you get when you say nothing, and how to say otherwise:

- environment: the project's default. Otherwise \`environment: { sameAs: sessionId }\`
  runs in the same environment as that session.
- provider, model, reasoningLevel: the project's defaults. Otherwise name ids
  from \`providers.list\`.
- title: the host's own. Otherwise \`title\`.
- The session is a visible root owned by the reader, never a child of yours.

The confirmation names the project and the prompt. Handle \`cancelled\`:

    try { await invoke("sessions.start", {\u2026}); say("Started."); }
    catch (e) { say(e.code === "cancelled" ? "Nothing started." : e.message); }

\`sessions.send\` steers an existing session the same way; it refuses your own
session \u2014 use \`session.reply\` for that.`;
var network = () => `## Network

Pages have internet access: fetch any origin, load remote fonts, scripts,
stylesheets, images and media, open WebSockets. The page still holds no host
credential \u2014 reaching a URL and acting as the host are different things.

Two consequences to know: page script runs in the reader's browser, so it can
reach what that device can reach, including its own network; and script can
navigate its own frame with data in the URL. Both are accepted, documented
properties of the model, not bugs to work around.`;
var unavailable = () => `## What the sandbox silences

These do nothing, silently \u2014 the worst failure mode \u2014 so never rely on them:

- \`window.open\` \u2014 use \`pages.open\` for another page, \`sessions.openHost\`
  for the host application, and a plain <a href="https://\u2026"> or
  \`navigation.openExternal\` for the web.
- \`window.prompt\`, \`alert\`, \`confirm\` \u2014 build the input or the question into
  the page (an <input>, a <dialog> with data-thread-page-manual, a second
  form), or use a confirmed capability, which renders its own dialog.
- top-level navigation \u2014 \`pages.open\` and \`sessions.openHost\` navigate the
  reader's view in place through trusted chrome; the back button returns.

An ordinary <a href="https://\u2026"> works: the host intercepts the click and
routes it through \`navigation.openExternal\`, which confirms and names the
destination. Same-document fragments (#section) work natively. The trust
boundary is not configurable: no setting widens the sandbox.`;
var composition = () => `## One agent, one page

Your page is yours alone. You never read or write another agent's page, and
the host provides no mechanism to. If the reader wants a dashboard, a console
or a second view, start a session with instructions to build it; that agent
writes its own page. Link to it with \`pages.open\`, or suggest making it home.
If you want another agent's page changed, send that agent a message with
\`sessions.send\` rather than editing its file. Do not create a session merely
to hold a page: a page that stays put is owned by a real agent that built it
and then stopped.`;
var home2 = () => `## The home page

One page is home; every other page shows a "\u2190 Sessions" link back to it in
chrome you never write. \`bb thread-page home\` sets the pointer for the
current session (\`--clear\` removes it) and creates the plain seed if the
session has no page yet; it never touches an existing page. Home is an
ordinary page \u2014 a session hub is one an agent builds:

    const { sessions } = await invoke("sessions.snapshot", { limit: 100, includeArchived: false });
    const { projects } = await invoke("projects.list");
    // group by projectId, render rows, then per row:
    //   pages.open { sessionId }      sessions.openHost { sessionId }
    //   sessions.send { sessionId, prompt }   sessions.stop / sessions.archive
    // and per project: sessions.start { projectId, prompt }
    // keep grouping in storage.set { key: "home.groups", value }

Refresh the list with \`watch("session.activity", { limit: 1 }, \u2026)\` or on a
button, not on a tight timer: the page shares a rate budget of
${LIMITS.ratePerMinute} requests a minute with its own forms.`;
var accessibility = () => `## Before you save

- Read it once at 320px wide, once in dark mode, once with reduced motion.
- Every action reachable by keyboard; nothing pointer-only.
- Inline SVG for diagrams and charts, with var(--accent) inside it; a zero
  gets a visible stub or the eye reads missing data.
- grep -o '#[0-9a-fA-F]\\{3,8\\}' ${ENTRY_FILE} inside your <style> should be empty.`;
var limits = () => `## Limits

| Limit | Value |
| --- | --- |
| Entry document | ${mebibytes(LIMITS.entryDocumentBytes)}, refused above, never truncated |
| Other files in the page root | ${mebibytes(25 * 1024 * 1024)} per file (${mebibytes(10 * 1024 * 1024)} for images), the host's read limit |
| Upload per file | ${mebibytes(LIMITS.uploadFileBytes)} |
| Uploads per form | ${LIMITS.uploadsPerForm} |
| Submission body | ${kibibytes(LIMITS.submissionBodyBytes)} excluding uploaded bytes; ${LIMITS.answersPerSubmission} answers; ${LIMITS.answerValueChars} characters per answer |
| Capability payload | ${kibibytes(LIMITS.capabilityPayloadBytes)} request and response, depth ${LIMITS.capabilityJsonDepth}, ${LIMITS.capabilityJsonNodes} nodes |
| Prompt | ${kibibytes(LIMITS.promptChars)} characters (sessions.start, sessions.send) |
| session.reply result | ${kibibytes(LIMITS.resultTextBytes)} |
| Title | ${LIMITS.titleChars} characters |
| storage value | ${kibibytes(LIMITS.storageValueBytes)} per key; keys ${LIMITS.storageKeyChars} characters |
| sessions.snapshot | ${LIMITS.snapshotDefault} default, ${LIMITS.snapshotMax} maximum per call |
| session.activity | ${LIMITS.activityDefault} default, ${LIMITS.activityMax} maximum |
| Page session (action token) | ${LIMITS.actionTokenMs / 36e5} hours, then the shell reloads or asks |
| Confirmation | ${LIMITS.confirmationMs / 6e4} minutes to answer the dialog |
| Folder selection | ${LIMITS.selectionTokenMs / 6e4} minutes, single use |
| Submission idempotency | ${LIMITS.idempotencyRecords} records, ${LIMITS.idempotencyMs / 6e4} minutes |
| Rate limit | ${LIMITS.ratePerMinute} accepted requests a minute and ${LIMITS.rateConcurrent} in flight, per page; refused with rate_limited |
| Shell revision poll | every ${LIMITS.shellPollMs / 1e3} s while visible |
| watch interval | ${LIMITS.watchDefaultMs / 1e3} s default, ${LIMITS.watchMinMs / 1e3} s\u2013${LIMITS.watchMaxMs / 6e4} min |
| Offline copy | entry documents up to ${kibibytes(LIMITS.offlineCopyBytes)} are kept so the page opens read-only when its host is unreachable |`;
var limitations = (site) => `## Known limitations

- A page served from the offline copy is read-only: captured forms are
  disabled and effectful capabilities answer unavailable.
- A confirmed capability that fails on the host answers handler_error with a
  generic message; the cause is in the plugin log (\`bb plugin logs thread-pages\`).
- Embedding another page or site in an <iframe> is blocked (frame-src 'none').
- \`voice.captureAndTranscribe\` is not implemented: unknown_method.${site.name === "core-storage" ? `
- fetch() of your own files from page script is refused on this host (see Files you show the reader).` : ""}`;

// src/bb/activity.ts
function sessionStateOf(thread, hasPendingInteraction) {
  const runtime = asRecord(thread.runtime);
  const display = typeof runtime?.displayStatus === "string" ? runtime.displayStatus : typeof thread.status === "string" ? thread.status : "idle";
  if (["active", "starting", "provisioning", "stopping"].includes(display)) return "working";
  if (display === "error") return "failed";
  if (hasPendingInteraction) return "waiting";
  return "idle";
}
var FALLBACK_LABELS = {
  agentMessage: ["Writing", "Wrote"],
  reasoning: ["Thinking", "Thought"]
};
function activityItemsOf(events, limit) {
  const out = [];
  for (const raw of events) {
    const event = asRecord(raw);
    if (!event) continue;
    if (event.type !== "item/started" && event.type !== "item/completed") continue;
    const done = event.type === "item/completed";
    const data = asRecord(event.data);
    const item = asRecord(data?.item) ?? data;
    if (!item || typeof item.type !== "string") continue;
    const presentation = asRecord(item.presentation);
    const labels = asRecord(presentation?.label);
    const presented = labels?.[done ? "completed" : "pending"];
    const fallback = FALLBACK_LABELS[item.type];
    const label = typeof presented === "string" ? presented : fallback ? fallback[done ? 1 : 0] : null;
    if (!label) continue;
    const detail = presentation?.title ?? item.command ?? item.text ?? item.name ?? "";
    const atMs = typeof event.createdAt === "number" && Number.isFinite(event.createdAt) ? Math.max(0, Math.trunc(event.createdAt)) : 0;
    out.push({
      kind: item.type.slice(0, 80),
      done,
      atMs,
      label: label.trim().slice(0, 80) || (done ? "Completed" : "Working"),
      text: String(detail).replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }
  out.reverse();
  return out.slice(-limit);
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// src/bb/public-origin.ts
function createPublicOrigin(bb, cacheMs = 3e4) {
  let cached = null;
  return async () => {
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.origin;
    const origin = await connectOrigin(bb) ?? configuredOrigin(bb);
    cached = origin ? { at: now, origin } : null;
    return origin;
  };
}
async function connectOrigin(bb) {
  try {
    const status2 = await bb.sdk.plugins.callRpc({
      pluginId: "connect",
      method: "status",
      input: null,
      // Connect validates its own output; we read two fields.
      outputSchema: { parse: (value) => value }
    });
    if (status2 && status2.state === "connected" && typeof status2.url === "string") {
      return new URL(status2.url).origin;
    }
  } catch {
  }
  return null;
}
function configuredOrigin(bb) {
  try {
    const url = bb.server.experimental_appUrl;
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

// src/bb/bb-host.ts
function createBbHost(bb) {
  const publicOrigin = createPublicOrigin(bb);
  async function pendingInteraction(threadId) {
    try {
      const listed = await bb.sdk.threads.interactions.list({ threadId });
      const record = asRecord(listed);
      const interactions = Array.isArray(listed) ? listed : Array.isArray(record?.interactions) ? record.interactions : [];
      return interactions.length > 0;
    } catch {
      return false;
    }
  }
  function projectThread(thread, hasPendingInteraction) {
    return {
      id: String(thread.id),
      title: typeof thread.title === "string" && thread.title || typeof thread.titleFallback === "string" && thread.titleFallback || "Untitled",
      projectId: typeof thread.projectId === "string" ? thread.projectId : null,
      state: sessionStateOf(thread, hasPendingInteraction),
      visibility: thread.visibility === "hidden" ? "hidden" : "visible",
      parentId: typeof thread.parentThreadId === "string" ? thread.parentThreadId : null,
      forkOfId: typeof thread.sourceThreadId === "string" ? thread.sourceThreadId : null,
      archived: thread.archivedAt !== null && thread.archivedAt !== void 0,
      deleted: thread.deletedAt !== null && thread.deletedAt !== void 0,
      updatedAtMs: typeof thread.updatedAt === "number" ? Math.max(0, Math.trunc(thread.updatedAt)) : 0,
      environmentId: typeof thread.environmentId === "string" ? thread.environmentId : null
    };
  }
  async function getThread(id) {
    try {
      const thread = await bb.sdk.threads.get({ threadId: id });
      return asRecord(thread);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw hostUnavailable(error);
    }
  }
  const host = {
    sessions: {
      async get(id) {
        const thread = await getThread(id);
        if (!thread) return null;
        const idle = sessionStateOf(thread, false) === "idle";
        return projectThread(thread, idle ? await pendingInteraction(id) : false);
      },
      async list(query) {
        const rows = await bb.sdk.threads.list({
          ...query.projectId ? { projectId: query.projectId } : {},
          ...query.archived ? { archived: true } : {},
          limit: query.limit,
          offset: query.offset
        });
        if (!Array.isArray(rows)) return [];
        return rows.map((row) => asRecord(row)).filter((row) => row !== null).map((row) => projectThread(row, row.hasPendingInteraction === true));
      },
      async send(id, text, mode) {
        const before = await getThread(id);
        const wasWorking = before ? sessionStateOf(before, false) === "working" : false;
        const sent = await bb.sdk.threads.send({
          threadId: id,
          mode: mode === "steer" ? "steer-if-active" : "queue-if-active",
          input: [{ type: "text", text, mentions: [] }]
        });
        if (sent.delivery === "queued") return { delivery: "queued" };
        return { delivery: mode === "steer" && wasWorking ? "steered" : "started" };
      },
      async start(args) {
        const spawned = await bb.sdk.threads.spawn({
          projectId: args.projectId,
          prompt: args.prompt,
          ...args.title ? { title: args.title } : {},
          ...args.providerId ? { providerId: args.providerId } : {},
          ...args.model ? { model: args.model } : {},
          ...args.reasoningLevel ? { reasoningLevel: args.reasoningLevel } : {},
          environment: args.environment.kind === "reuse" ? { type: "reuse", environmentId: args.environment.environmentId } : { type: "project-default" },
          // The reader started this work: a visible root, never a hidden helper.
          visibility: "visible"
        });
        return { id: spawned.id };
      },
      async stop(id) {
        await bb.sdk.threads.stop({ threadId: id });
      },
      async archive(id) {
        await bb.sdk.threads.archive({ threadId: id });
      },
      async activity(id, limit) {
        const events = await bb.sdk.threads.events.list({
          threadId: id,
          order: "desc",
          limit: "80",
          types: ["item/started", "item/completed"]
        });
        return activityItemsOf(Array.isArray(events) ? events : [], limit);
      },
      async storage(id) {
        try {
          const location = await bb.sdk.threads.storageLocation({ threadId: id });
          return { hostId: location.hostId, rootPath: location.storageRootPath };
        } catch (error) {
          if (isNotFound(error)) throw new PageError("not_found", "That session is not available", { cause: error });
          throw hostUnavailable(error);
        }
      }
    },
    projects: {
      async list() {
        const projects = await bb.sdk.projects.list({ includePersonal: true });
        if (!Array.isArray(projects)) return [];
        return projects.map((raw) => asRecord(raw)).filter((project) => project !== null && typeof project.id === "string").map((project) => ({
          id: String(project.id),
          name: typeof project.name === "string" ? project.name : "Untitled",
          kind: project.kind === "personal" ? "personal" : "standard",
          hostId: defaultHostId(project.sources)
        }));
      },
      async browse(hostId) {
        const picked = await bb.sdk.hosts.pickFolder({ hostId, clientHostId: hostId });
        if (!picked.path) return null;
        const hostRecord = await bb.sdk.hosts.get({ hostId }).catch(() => null);
        return { path: picked.path, hostName: hostRecord?.name ?? "this device" };
      },
      async create(args) {
        const created = await bb.sdk.projects.create({ name: args.name, source: { type: "local_path", hostId: args.hostId, path: args.path } });
        return { id: created.id, name: created.name, kind: created.kind === "personal" ? "personal" : "standard", hostId: args.hostId };
      }
    },
    providers: {
      async list() {
        let providers;
        try {
          providers = await bb.sdk.providers.list();
        } catch (error) {
          throw new PageError("unavailable", "Providers cannot be listed right now", { cause: error });
        }
        if (!Array.isArray(providers)) throw new PageError("unavailable", "Providers cannot be listed right now");
        const choices = await Promise.all(
          providers.map((raw) => asRecord(raw)).filter((provider) => provider !== null && typeof provider.id === "string").map(async (provider) => {
            const id = String(provider.id);
            const catalog = await bb.sdk.providers.models({ providerId: id }).catch(() => null);
            const models = asRecord(catalog)?.models;
            return {
              id,
              displayName: typeof provider.displayName === "string" ? provider.displayName : id,
              available: provider.available !== false,
              models: (Array.isArray(models) ? models : []).map((raw) => asRecord(raw)).filter((model) => model !== null && typeof model.id === "string").map((model) => ({
                id: String(model.id),
                displayName: typeof model.displayName === "string" ? model.displayName : String(model.id),
                isDefault: model.isDefault === true,
                reasoningLevels: (Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((effort) => asRecord(effort)?.reasoningEffort).filter((level) => typeof level === "string")
              }))
            };
          })
        );
        return choices;
      }
    },
    files: {
      async read(location, relativePath) {
        try {
          const file = await bb.sdk.files.read({ hostId: location.hostId, path: joinPath(location.rootPath, relativePath), rootPath: location.rootPath });
          const bytes = file.contentEncoding === "base64" ? Buffer.from(file.content, "base64") : Buffer.from(file.content, "utf8");
          return { bytes, sha256: file.sha256, modifiedAtMs: typeof file.modifiedAtMs === "number" ? file.modifiedAtMs : null };
        } catch (error) {
          if (isNotFound(error)) return null;
          throw hostUnavailable(error);
        }
      },
      async write(location, relativePath, bytes, options) {
        try {
          const written = await bb.sdk.files.write({
            hostId: location.hostId,
            path: joinPath(location.rootPath, relativePath),
            rootPath: location.rootPath,
            content: Buffer.from(bytes).toString("base64"),
            contentEncoding: "base64",
            createParents: true,
            ...options.onlyIfAbsent ? { expectedSha256: null } : {},
            mode: 420
          });
          return written.outcome === "written" ? "written" : "exists";
        } catch (error) {
          if (options.onlyIfAbsent && isConflict(error)) return "exists";
          throw hostUnavailable(error);
        }
      },
      async exist(hostId, absolutePaths) {
        if (absolutePaths.length === 0) return {};
        try {
          const result2 = await bb.sdk.hosts.pathsExist({ hostId, paths: [...absolutePaths] });
          return Object.fromEntries(absolutePaths.map((path) => [path, result2.existence[path] === true]));
        } catch {
          return Object.fromEntries(absolutePaths.map((path) => [path, false]));
        }
      }
    },
    kv: {
      get: (key) => bb.storage.kv.get(key),
      set: (key, value) => bb.storage.kv.set(key, value),
      delete: (key) => bb.storage.kv.delete(key)
    },
    origin: { public: publicOrigin },
    log: bb.log
  };
  return host;
}
function defaultHostId(sources) {
  if (!Array.isArray(sources)) return null;
  const records = sources.map((raw) => asRecord(raw)).filter((source) => source !== null);
  const chosen = records.find((source) => source.isDefault === true) ?? records[0];
  return chosen && typeof chosen.hostId === "string" ? chosen.hostId : null;
}
function isNotFound(error) {
  const record = asRecord(error);
  if (record) {
    if (record.code === "ENOENT" || record.status === 404) return true;
    const body = asRecord(record.body);
    if (body?.code === "ENOENT" || body?.code === "not_found") return true;
  }
  return /\b(enoent|not found|does not exist|no such file)\b/i.test(errorText(error));
}
function isConflict(error) {
  const record = asRecord(error);
  return record?.status === 409 || /\b(conflict|already exists|exists)\b/i.test(errorText(error));
}
function hostUnavailable(error) {
  return PageError.is(error) ? error : new PageError("unavailable", PUBLIC_MESSAGES.unavailable, { cause: error });
}

// src/agent/instruction.ts
var DEFAULT_AGENT_INSTRUCTION = `# The page is the conversation

The reader does not read chat. Every turn you write or update one HTML page;
they read it and answer from inside it, and the answer arrives as your next
message. Chat carries the link and one line. A page they cannot answer from is
a dead end.

Start every turn with \`bb thread-page init\`. It prints the page path and the
link. Read an existing page before editing it; saving publishes it at once and
an open page reloads itself. If init says SKIP, this session is a helper:
answer in chat and stay off the page.

## Every page ends with a way to answer

Any <form> is wired automatically; nothing is required and blank is a real
answer. Plain semantic HTML is already styled: <fieldset><legend> names a
group, a wrapping <label> names one control, <small> is a hint, several
<button name value> give one-click answers.

Asking well is most of the work: buttons and radios for decisions, checkboxes
for multi-select, free text only where the answer is genuinely open. A scale
needs a meaning at both ends, never a bare 1-to-5. Always leave one open field
for what you failed to anticipate: a form that permits only the answers you
expect takes the decision away from the reader.

## What belongs on the page

What you did, at the level they could explain to someone else; decisions that
are theirs, with the options and your recommendation; what only they can
supply; anything a wrong assumption of yours would make costly. Report
failures, skipped steps and your own mistakes plainly. Conclusion first.

## One agent, one page

Your page is yours alone: you never read or write another agent's page. To
create another interface \u2014 a dashboard, a console, a second view \u2014 start a
session with instructions to build it; that agent writes its own page. Link to
it, or suggest making it home. A page that should stay put is one whose forms
start fresh sessions instead of messaging you: nothing then asks you to
rewrite it. If you want another agent's page changed, talk to that agent.

## More

A page that needs more than prose and a form \u2014 files beside it, a chart, live
session state, starting or steering sessions, links \u2014 runs
\`bb thread-page guide\` first.`;

// src/config/settings.ts
var DEFAULT_WORKING_LABEL = "Working \u2014 this is the last saved version";
async function defineSettings(bb) {
  const handle = bb.settings.define({
    agentInstructions: {
      type: "boolean",
      label: "Agent instructions",
      description: "Inject the standing Thread Pages instruction into every eligible new session.",
      default: false
    },
    agentInstructionText: {
      type: "string",
      label: "Agent instruction text",
      description: "What eligible new sessions receive when Agent instructions is on. Changing it affects future sessions only.",
      experimental_multiline: true,
      default: DEFAULT_AGENT_INSTRUCTION
    },
    pageSeedHtml: {
      type: "string",
      label: "New-page seed",
      description: "The complete HTML a new page starts from. {{TITLE}} is replaced, escaped. Existing pages are never rewritten.",
      experimental_multiline: true,
      default: DEFAULT_PAGE_SEED
    },
    workingLabel: {
      type: "string",
      label: "Working indicator text",
      description: "Shown in the page header while the owning session is mid-turn. Blank hides the indicator.",
      default: DEFAULT_WORKING_LABEL
    },
    homeSessionId: {
      type: "string",
      label: "Home page session",
      description: "The session whose page is home; every other page links back to it. Set with `bb thread-page home`.",
      default: ""
    }
  });
  let current = normalize(await handle.get());
  handle.onChange((next) => {
    current = normalize(next);
  });
  return {
    current: () => current,
    async set(values) {
      current = normalize(await handle.experimental_set(values));
      return current;
    }
  };
}
function normalize(values) {
  return {
    agentInstructions: values.agentInstructions === true,
    agentInstructionText: values.agentInstructionText,
    pageSeedHtml: values.pageSeedHtml,
    workingLabel: values.workingLabel.trim(),
    homeSessionId: values.homeSessionId.trim()
  };
}

// src/domain/capabilities/contract.ts
var EFFECT_CLASSES = ["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device"];
var CONFIRMED_EFFECTS = /* @__PURE__ */ new Set(["cross-session-write", "destructive", "device"]);

// src/domain/capabilities/registry.ts
function createRegistry(specs) {
  const byMethod = /* @__PURE__ */ new Map();
  for (const spec2 of specs) {
    if (!isMethodName(spec2.method)) throw new TypeError(`Invalid capability name: ${spec2.method}`);
    if (byMethod.has(spec2.method)) throw new TypeError(`Duplicate capability: ${spec2.method}`);
    if (!EFFECT_CLASSES.includes(spec2.effect)) throw new TypeError(`Invalid effect for ${spec2.method}`);
    if (CONFIRMED_EFFECTS.has(spec2.effect) && !spec2.confirmed) {
      throw new TypeError(`${spec2.method} has a ${spec2.effect} effect and must be confirmed`);
    }
    if ((spec2.effect === "read" || spec2.effect === "own-session-write") && spec2.confirmed) {
      throw new TypeError(`${spec2.method} is a ${spec2.effect} and must not be confirmed`);
    }
    if (typeof spec2.description !== "string" || spec2.description.trim().length === 0 || spec2.description.length > 240) {
      throw new TypeError(`Invalid description for ${spec2.method}`);
    }
    byMethod.set(spec2.method, Object.freeze({ ...spec2 }));
  }
  const list = Object.freeze([...byMethod.values()]);
  const descriptors = Object.freeze(
    list.filter((spec2) => spec2.implemented).map((spec2) => ({
      method: spec2.method,
      effect: spec2.effect,
      confirmation: spec2.confirmed ? "required" : "none"
    }))
  );
  return Object.freeze({
    get: (method) => byMethod.get(method),
    list: () => list,
    descriptors: () => descriptors
  });
}

// src/domain/json/strict-json.ts
function valid(value) {
  return { ok: true, value };
}
function invalid(path, message, code = "invalid_value") {
  return { ok: false, issues: [{ code, path, message }] };
}
var UNSAFE_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
function pathForKey(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}
function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}
function validateJson(input, limits2 = {}) {
  const maxBytes = limits2.maxBytes ?? LIMITS.capabilityPayloadBytes;
  const maxDepth = limits2.maxDepth ?? LIMITS.capabilityJsonDepth;
  const maxNodes = limits2.maxNodes ?? LIMITS.capabilityJsonNodes;
  const ancestors = /* @__PURE__ */ new Set();
  let nodes = 0;
  function visit(value, path, depth) {
    nodes += 1;
    if (nodes > maxNodes) return { code: "too_large", path, message: `JSON exceeds ${maxNodes} nodes` };
    if (depth > maxDepth) return { code: "too_deep", path, message: `JSON exceeds depth ${maxDepth}` };
    if (value === null || typeof value === "string" || typeof value === "boolean") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? null : { code: "not_json_safe", path, message: "Numbers must be finite" };
    }
    if (typeof value !== "object") {
      return { code: "not_json_safe", path, message: `Unsupported value type: ${typeof value}` };
    }
    if (ancestors.has(value)) return { code: "not_json_safe", path, message: "Cyclic values are not JSON-safe" };
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key === "symbol") return { code: "not_json_safe", path, message: "Symbol properties are not JSON-safe" };
          if (key !== "length" && !isCanonicalIndex(key, value.length)) {
            return { code: "not_json_safe", path: pathForKey(path, key), message: "Arrays may not carry extra properties" };
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            return { code: "not_json_safe", path: `${path}[${index}]`, message: "Sparse arrays and accessors are not JSON-safe" };
          }
          const issue2 = visit(descriptor.value, `${path}[${index}]`, depth + 1);
          if (issue2) return issue2;
        }
        return null;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return { code: "not_json_safe", path, message: "Only plain objects are JSON-safe" };
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") return { code: "not_json_safe", path, message: "Symbol properties are not JSON-safe" };
        if (UNSAFE_KEYS.has(key)) return { code: "not_json_safe", path: pathForKey(path, key), message: "Unsafe object key" };
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return { code: "not_json_safe", path: pathForKey(path, key), message: "Entries must be enumerable data properties" };
        }
        const issue2 = visit(descriptor.value, pathForKey(path, key), depth + 1);
        if (issue2) return issue2;
      }
      return null;
    } catch {
      return { code: "not_json_safe", path, message: "Value could not be inspected" };
    } finally {
      ancestors.delete(value);
    }
  }
  const issue = visit(input, "$", 0);
  if (issue) return { ok: false, issues: [issue] };
  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return invalid("$", "Value could not be serialised", "not_json_safe");
  }
  if (utf8Bytes(serialized) > maxBytes) {
    return invalid("$", `Serialised JSON exceeds ${maxBytes} bytes`, "too_large");
  }
  return valid(JSON.parse(serialized));
}
function isCanonicalIndex(key, length) {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}
function isJsonObject(value) {
  return value !== void 0 && value !== null && typeof value === "object" && !Array.isArray(value);
}

// src/domain/capabilities/schema.ts
function issues(list) {
  return { ok: false, issues: list };
}
function string(options) {
  const label = options.label ?? "String";
  return {
    parse(value, path) {
      if (typeof value !== "string") return invalid(path, `${label}: expected a string`, "invalid_type");
      const min = options.min ?? 0;
      if (value.length < min || value.length > options.max) {
        return invalid(path, `${label}: length must be ${min}\u2013${options.max}`, "too_large");
      }
      if (options.pattern && !options.pattern.test(value)) return invalid(path, `${label}: invalid format`);
      return valid(value);
    }
  };
}
function integer(min, max, label = "Integer") {
  return {
    parse(value, path) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
        return invalid(path, `${label}: expected an integer from ${min} to ${max}`);
      }
      return valid(value);
    }
  };
}
function boolean(label = "Boolean") {
  return {
    parse(value, path) {
      return typeof value === "boolean" ? valid(value) : invalid(path, `${label}: expected a boolean`, "invalid_type");
    }
  };
}
function literal(values, label = "Value") {
  return {
    parse(value, path) {
      return values.includes(value) ? valid(value) : invalid(path, `${label}: expected one of ${values.map((item) => JSON.stringify(item)).join(", ")}`);
    }
  };
}
function nullable(schema) {
  return {
    parse(value, path) {
      return value === null ? valid(null) : schema.parse(value, path);
    }
  };
}
function optional(schema) {
  return { isOptional: true, parse: (value, path) => schema.parse(value, path) };
}
function withDefault(schema, fallback) {
  return {
    isOptional: true,
    hasDefault: true,
    parse(value, path) {
      return value === void 0 ? valid(fallback) : schema.parse(value, path);
    }
  };
}
function array(item, max, label = "List") {
  return {
    parse(value, path) {
      if (!Array.isArray(value)) return invalid(path, `${label}: expected a list`, "invalid_type");
      if (value.length > max) return invalid(path, `${label}: at most ${max} items`, "too_large");
      const out = [];
      for (let index = 0; index < value.length; index += 1) {
        const parsed = item.parse(value[index], `${path}[${index}]`);
        if (!parsed.ok) return issues(parsed.issues);
        out.push(parsed.value);
      }
      return valid(out);
    }
  };
}
function object(shape, label = "Object") {
  const keys = Object.keys(shape);
  const known = new Set(keys);
  return {
    parse(value, path) {
      if (!isJsonObject(value)) return invalid(path, `${label}: expected an object`, "invalid_type");
      for (const key of Object.keys(value)) {
        if (!known.has(key)) return invalid(pathForKey(path, key), "Unknown key", "unknown_key");
      }
      const out = {};
      for (const key of keys) {
        const schema = shape[key];
        const present = Object.prototype.hasOwnProperty.call(value, key);
        if (!present) {
          if (schema.isOptional) {
            const parsed2 = schema.parse(void 0, pathForKey(path, key));
            if (parsed2.ok && parsed2.value !== void 0) out[key] = parsed2.value;
            continue;
          }
          return invalid(pathForKey(path, key), "Missing required key", "missing_key");
        }
        const parsed = schema.parse(value[key], pathForKey(path, key));
        if (!parsed.ok) return issues(parsed.issues);
        out[key] = parsed.value;
      }
      return valid(out);
    }
  };
}
function noParams() {
  return {
    parse(value, path) {
      if (value === void 0 || value === null) return valid(null);
      if (isJsonObject(value) && Object.keys(value).length === 0) return valid(null);
      return invalid(path, "This capability takes no parameters", "unknown_key");
    }
  };
}
function json(limits2 = {}, label = "Value") {
  return {
    parse(value, path) {
      if (value === void 0) return invalid(path, `${label}: missing`, "missing_key");
      const checked = validateJson(value, limits2);
      if (!checked.ok) {
        const first = checked.issues[0];
        return first ? invalid(path === "$" ? first.path : `${path}${first.path.slice(1)}`, first.message, first.code) : checked;
      }
      return checked;
    }
  };
}
function union(first, second, label = "Value") {
  return {
    parse(value, path) {
      const a = first.parse(value, path);
      if (a.ok) return a;
      const b = second.parse(value, path);
      if (b.ok) return b;
      return invalid(path, `${label}: did not match any accepted shape`);
    }
  };
}
function refine(schema, check) {
  return {
    parse(value, path) {
      const parsed = schema.parse(value, path);
      if (!parsed.ok) return parsed;
      const problem = check(parsed.value);
      return problem ? invalid(path, problem) : parsed;
    }
  };
}

// src/domain/capabilities/specs.ts
var ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
var entityId = (label) => string({ min: 1, max: 128, pattern: ENTITY_ID, label });
var title = (label = "Title") => string({ max: LIMITS.titleChars, label });
var prompt = string({ min: 1, max: LIMITS.promptChars, label: "Prompt" });
var safeName = (label, max = 160) => string({ min: 1, max, pattern: /^[^\u0000-\u001f\u007f]+$/, label });
var timestamp = integer(0, Number.MAX_SAFE_INTEGER, "Timestamp");
var SESSION_STATES = ["working", "idle", "waiting", "failed", "stopped"];
var sessionState = literal(SESSION_STATES, "State");
var deliveryResult = object({
  delivery: literal(["started", "queued", "steered"], "Delivery"),
  duplicate: boolean()
});
var projectChoice = object({
  id: entityId("Project id"),
  name: title("Project name"),
  kind: literal(["standard", "personal"], "Project kind")
});
function spec(definition) {
  return Object.freeze(definition);
}
function params(schema) {
  return (value) => schema.parse(value, "$");
}
function result(schema) {
  return (value) => schema.parse(value, "$");
}
var contextGet = spec({
  method: "context.get",
  description: "Read this page's identity and the capability roster.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(noParams()),
  validateResult: result(
    object({
      protocolVersion: literal([1]),
      session: object({ id: entityId("Session id"), title: title(), projectId: nullable(entityId("Project id")) }),
      page: object({ revision: string({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/, label: "Revision" }), readOnly: boolean() }),
      capabilities: array(
        object({
          method: string({ min: 3, max: LIMITS.methodNameChars, label: "Method" }),
          effect: literal(["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device"]),
          confirmation: literal(["none", "required"])
        }),
        64
      )
    })
  ),
  doc: {
    params: "None.",
    result: "`{ protocolVersion: 1, session: { id, title, projectId }, page: { revision, readOnly }, capabilities: [{ method, effect, confirmation }] }`.",
    notes: "The roster lists what is actually enabled; check it rather than assume."
  }
});
var sessionActivity = spec({
  method: "session.activity",
  description: "Read this session's state and recent activity.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(object({ limit: withDefault(integer(1, LIMITS.activityMax, "Limit"), LIMITS.activityDefault) })),
  validateResult: result(
    object({
      state: sessionState,
      updatedAtMs: timestamp,
      items: array(
        object({
          kind: string({ min: 1, max: 80, label: "Kind" }),
          done: boolean(),
          atMs: timestamp,
          label: string({ min: 1, max: 80, label: "Label" }),
          text: string({ max: 200, label: "Text" })
        }),
        LIMITS.activityMax
      )
    })
  ),
  doc: {
    params: `\`{ limit? }\` \u2014 1 to ${LIMITS.activityMax}, default ${LIMITS.activityDefault}. It never takes a session id: it is always this page's own session.`,
    result: "`{ state, updatedAtMs, items: [{ kind, done, atMs, label, text }] }` where `state` is one of `working`, `idle`, `waiting`, `failed`, `stopped`."
  }
});
var snapshotParams = object({
  projectId: optional(nullable(entityId("Project id"))),
  includeArchived: withDefault(boolean(), false),
  limit: withDefault(integer(1, LIMITS.snapshotMax, "Limit"), LIMITS.snapshotDefault),
  cursor: optional(nullable(string({ min: 1, max: 512, pattern: /^[A-Za-z0-9._~:-]+$/, label: "Cursor" })))
});
var sessionSummary = object({
  id: entityId("Session id"),
  title: title(),
  projectId: nullable(entityId("Project id")),
  parentSessionId: nullable(entityId("Session id")),
  status: sessionState,
  archived: boolean(),
  page: object({ available: boolean(), revision: nullable(string({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ })) }),
  updatedAtMs: timestamp
});
var sessionsSnapshot = spec({
  method: "sessions.snapshot",
  description: "Read a bounded, projected list of sessions.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(snapshotParams),
  validateResult: result(
    object({
      sessions: array(sessionSummary, LIMITS.snapshotMax),
      nextCursor: nullable(string({ min: 1, max: 512 })),
      generatedAtMs: timestamp
    })
  ),
  doc: {
    params: `\`{ projectId?, includeArchived?, limit?, cursor? }\` \u2014 \`limit\` 1 to ${LIMITS.snapshotMax}, default ${LIMITS.snapshotDefault}; pass the previous result's \`nextCursor\` to continue.`,
    result: "`{ sessions: [{ id, title, projectId, parentSessionId, status, archived, page: { available, revision }, updatedAtMs }], nextCursor, generatedAtMs }`. `page.revision` is known for pages this host has served recently and `null` otherwise.",
    notes: "No message bodies or agent output are included."
  }
});
var projectsList = spec({
  method: "projects.list",
  description: "Read project choices without paths or host details.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(noParams()),
  validateResult: result(object({ projects: array(projectChoice, LIMITS.projectsMax) })),
  doc: { params: "None.", result: "`{ projects: [{ id, name, kind }] }` where `kind` is `standard` or `personal`." }
});
var providersList = spec({
  method: "providers.list",
  description: "Read the provider and model choices a page may pass to sessions.start.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(noParams()),
  validateResult: result(
    object({
      providers: array(
        object({
          id: entityId("Provider id"),
          displayName: title("Provider name"),
          available: boolean(),
          models: array(
            object({
              id: safeName("Model id"),
              displayName: title("Model name"),
              isDefault: boolean(),
              reasoningLevels: array(safeName("Reasoning level", 32), 16)
            }),
            LIMITS.modelsPerProvider
          )
        }),
        LIMITS.providersMax
      )
    })
  ),
  doc: {
    params: "None.",
    result: "`{ providers: [{ id, displayName, available, models: [{ id, displayName, isDefault, reasoningLevels }] }] }`.",
    notes: "Fails with `unavailable` when the host cannot enumerate providers; it never returns an empty list to mean that."
  }
});
var storageKey = string({ min: 1, max: LIMITS.storageKeyChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Storage key" });
var storageValue = json({ maxBytes: LIMITS.storageValueBytes, maxDepth: 12 }, "Stored value");
var storageGet = spec({
  method: "storage.get",
  description: "Read a small JSON value stored for this page.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(object({ key: storageKey })),
  validateResult: result(
    union(
      object({ found: literal([false]) }),
      object({ found: literal([true]), value: storageValue }),
      "Storage result"
    )
  ),
  doc: { params: "`{ key }`.", result: "`{ found: false }` or `{ found: true, value }`." }
});
var sessionReply = spec({
  method: "session.reply",
  description: "Send a structured result to this page's owning session.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  validateParams: params(
    object({
      title: optional(title()),
      mode: withDefault(literal(["queue", "steer"], "Mode"), "queue"),
      result: json({ maxBytes: LIMITS.resultTextBytes }, "Result"),
      idempotencyKey: optional(string({ min: 1, max: LIMITS.requestIdChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Idempotency key" }))
    })
  ),
  validateResult: result(deliveryResult),
  doc: {
    params: "`{ result, title?, mode?, idempotencyKey? }` \u2014 `mode` is `queue` (default: waits for the current turn) or `steer` (interrupts it).",
    result: "`{ delivery: 'started' | 'queued' | 'steered', duplicate }`.",
    notes: "With an `idempotencyKey`, a repeat with the same content delivers once and reports `duplicate: true`; a repeat with different content is a `conflict`."
  }
});
var storageSet = spec({
  method: "storage.set",
  description: "Store a small JSON value for this page.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  validateParams: params(object({ key: storageKey, value: storageValue })),
  validateResult: result(object({ stored: literal([true]) })),
  doc: { params: `\`{ key, value }\` \u2014 the value serialised must be at most ${LIMITS.storageValueBytes / 1024} KiB.`, result: "`{ stored: true }`.", notes: "Namespaced per session: no page can read another page's keys." }
});
var sessionTarget = object({ sessionId: entityId("Session id") });
var sessionsSendParams = object({
  sessionId: entityId("Session id"),
  prompt,
  mode: withDefault(literal(["queue", "steer"], "Mode"), "queue")
});
var sessionsSend = spec({
  method: "sessions.send",
  description: "Send a prompt to another existing session.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsSendParams),
  validateResult: result(object({ sessionId: entityId("Session id"), delivery: literal(["started", "queued", "steered"]), duplicate: boolean() })),
  doc: {
    params: "`{ sessionId, prompt, mode? }` \u2014 `mode` `queue` (default) or `steer`.",
    result: "`{ sessionId, delivery, duplicate }`.",
    notes: "Refuses this page's own session with `invalid_params`; use `session.reply` for that."
  }
});
var sessionsStartParams = object({
  projectId: entityId("Project id"),
  prompt,
  title: optional(title()),
  providerId: optional(entityId("Provider id")),
  model: optional(safeName("Model id")),
  reasoningLevel: optional(literal(["none", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode"], "Reasoning level")),
  environment: withDefault(
    union(literal(["project-default"]), object({ sameAs: entityId("Session id") }), "Environment"),
    "project-default"
  )
});
var sessionsStart = spec({
  method: "sessions.start",
  description: "Start a new visible root session in a project.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsStartParams),
  validateResult: result(object({ sessionId: entityId("Session id") })),
  doc: {
    params: "`{ projectId, prompt, title?, providerId?, model?, reasoningLevel?, environment? }`.",
    result: "`{ sessionId }`.",
    notes: "Defaults when you say nothing: the project's default environment, the project's default provider, model and reasoning level. Say otherwise with `providerId`/`model`/`reasoningLevel` from `providers.list`, or `environment: { sameAs: sessionId }` to run in the same environment as another session. The started session is a visible root owned by the reader, never a child of this page's session."
  }
});
var sessionsStop = spec({
  method: "sessions.stop",
  description: "Stop a session's running turn.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(object({ stopped: boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ stopped }`.", notes: "Refuses this page's own session outright, before any dialog." }
});
var sessionsArchive = spec({
  method: "sessions.archive",
  description: "Archive a session.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(object({ archived: boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ archived }`." }
});
var openedResult = result(object({ opened: boolean() }));
var pagesOpen = spec({
  method: "pages.open",
  description: "Open another session's page in place.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: openedResult,
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`, after which the reader's view navigates in place; the back button returns here." }
});
var sessionsOpenHost = spec({
  method: "sessions.openHost",
  description: "Open a session in the host application.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: openedResult,
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`; navigates the reader's view in place to the session's conversation." }
});
var openExternalParams = object({
  url: refine(string({ min: 1, max: 2048, pattern: /^[^\u0000-\u0020\u007f]+$/, label: "URL" }), (value) => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return "Expected an absolute http or https URL";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return "Expected an absolute http or https URL without credentials";
    }
    return null;
  }),
  label: optional(string({ min: 1, max: 160, label: "Label" }))
});
var navigationOpenExternal = spec({
  method: "navigation.openExternal",
  description: "Open an external http(s) URL through trusted chrome.",
  effect: "navigation",
  confirmed: true,
  implemented: true,
  validateParams: params(openExternalParams),
  validateResult: openedResult,
  doc: {
    params: "`{ url, label? }` \u2014 http or https only.",
    result: '`{ opened: true }`. The confirmation names the destination origin. An ordinary `<a href="https://\u2026">` in your page goes through this automatically.'
  }
});
var projectsBrowse = spec({
  method: "projects.browse",
  description: "Open the host's folder picker and return an opaque selection token.",
  effect: "device",
  confirmed: true,
  implemented: true,
  validateParams: params(noParams()),
  validateResult: result(
    object({
      selection: nullable(
        object({
          token: string({ min: 1, max: 512, pattern: /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/, label: "Selection token" }),
          displayPath: string({ min: 1, max: 1024, label: "Display path" }),
          hostName: title("Host name")
        })
      )
    })
  ),
  doc: {
    params: "None.",
    result: `\`{ selection: null }\` when the reader cancels, else \`{ selection: { token, displayPath, hostName } }\`. The token is single use, valid for ${LIMITS.selectionTokenMs / 6e4} minutes and only for this page; the page never sees a filesystem path.`
  }
});
var projectsCreate = spec({
  method: "projects.create",
  description: "Create a project from a folder-picker selection.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(object({ selectionToken: string({ min: 1, max: 512, pattern: /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/, label: "Selection token" }), name: optional(title("Name")) })),
  validateResult: result(object({ project: projectChoice })),
  doc: { params: "`{ selectionToken, name? }`.", result: "`{ project: { id, name, kind } }`.", notes: "An expired, reused or foreign token fails with `not_found`." }
});
var voiceCaptureAndTranscribe = spec({
  method: "voice.captureAndTranscribe",
  description: "Record and transcribe the reader's voice through trusted chrome.",
  effect: "device",
  confirmed: true,
  implemented: false,
  validateParams: params(
    object({
      language: optional(string({ min: 2, max: 64, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" })),
      prompt: optional(string({ max: 1e3, label: "Prompt" })),
      maxDurationSeconds: withDefault(integer(1, 120, "Duration"), 120)
    })
  ),
  validateResult: result(object({ text: string({ max: LIMITS.resultTextBytes, label: "Transcript" }) })),
  doc: { params: "`{ language?, prompt?, maxDurationSeconds? }`.", result: "`{ text }`.", notes: "Deferred: the contract exists, the host reports `unknown_method`." }
});
var ALL_CAPABILITIES = Object.freeze([
  contextGet,
  sessionActivity,
  sessionsSnapshot,
  projectsList,
  providersList,
  storageGet,
  sessionReply,
  storageSet,
  pagesOpen,
  sessionsOpenHost,
  sessionsSend,
  sessionsStart,
  projectsCreate,
  sessionsStop,
  sessionsArchive,
  navigationOpenExternal,
  projectsBrowse,
  voiceCaptureAndTranscribe
]);

// src/domain/capabilities/protocol.ts
var BRIDGE_PROTOCOL_VERSION = 1;
function decodeBridgeRequest(input) {
  const checked = validateJson(input);
  if (!checked.ok) {
    const tooLarge = checked.issues.some((issue) => issue.code === "too_large");
    throw new PageError(tooLarge ? "request_too_large" : "invalid_request", tooLarge ? "Bridge request is too large" : "Bridge request is not strict JSON");
  }
  const value = checked.value;
  if (!isJsonObject(value)) throw new PageError("invalid_request", "Bridge request must be an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "id,method,pageRevision,params,v") throw new PageError("invalid_request", "Bridge request has the wrong shape");
  if (value.v !== BRIDGE_PROTOCOL_VERSION) throw new PageError("unsupported_version", "Unsupported bridge protocol version");
  if (!isRequestId(value.id)) throw new PageError("invalid_request", "Invalid request id");
  if (!isMethodName(value.method)) throw new PageError("invalid_request", "Invalid method name");
  if (!isRevision(value.pageRevision)) throw new PageError("invalid_request", "Invalid page revision");
  return { v: 1, id: value.id, method: value.method, params: value.params, pageRevision: value.pageRevision };
}
function safeRequestId(value) {
  return isRequestId(value) ? value : "invalid";
}
function failure(id, code, message) {
  return { v: 1, id: safeRequestId(id), ok: false, error: { code, message: boundedMessage(message) } };
}
function failureFromError(id, error) {
  if (PageError.is(error) && isBridgeErrorCode(error.code)) return failure(id, error.code, error.message);
  return failure(id, "handler_error", "Could not execute the page action.");
}
function resolveInvocation(request, registry, currentRevision) {
  if (request.pageRevision !== currentRevision) throw new PageError("stale_page", "This page changed; reload it before responding.");
  const spec2 = registry.get(request.method);
  if (!spec2 || !spec2.implemented) throw new PageError("unknown_method", `Unknown capability: ${request.method}`);
  const params2 = spec2.validateParams(request.params);
  if (!params2.ok) {
    const first = params2.issues[0];
    throw new PageError("invalid_params", `Invalid parameters for ${spec2.method}${first ? ` at ${first.path}: ${first.message}` : ""}`);
  }
  return { request, spec: spec2, params: params2.value };
}
function completeInvocation(invocation, result2) {
  const projected = invocation.spec.validateResult(result2);
  if (!projected.ok) return failure(invocation.request.id, "invalid_result", `Invalid result for ${invocation.spec.method}`);
  const json2 = validateJson(projected.value);
  if (!json2.ok) return failure(invocation.request.id, "invalid_result", `Result for ${invocation.spec.method} is not strict JSON`);
  const response = { v: 1, id: invocation.request.id, ok: true, result: json2.value };
  if (Buffer.byteLength(JSON.stringify(response), "utf8") > LIMITS.capabilityPayloadBytes) {
    return failure(invocation.request.id, "response_too_large", "Bridge response is too large");
  }
  return response;
}

// src/domain/capabilities/index.ts
var capabilityRegistry = createRegistry(ALL_CAPABILITIES);

// src/domain/rate-limit.ts
function createRateLimiter(budget = { perMinute: LIMITS.ratePerMinute, concurrent: LIMITS.rateConcurrent }) {
  const buckets = /* @__PURE__ */ new Map();
  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.inFlight === 0 && now - bucket.touchedAt > 5 * 6e4) buckets.delete(key);
    }
  }
  return {
    acquire(key, now) {
      prune(now);
      const bucket = buckets.get(key) ?? { windowStartedAt: now, accepted: 0, inFlight: 0, touchedAt: now };
      if (now - bucket.windowStartedAt >= 6e4) {
        bucket.windowStartedAt = now;
        bucket.accepted = 0;
      }
      if (bucket.inFlight >= budget.concurrent || bucket.accepted >= budget.perMinute) {
        buckets.set(key, bucket);
        return null;
      }
      bucket.accepted += 1;
      bucket.inFlight += 1;
      bucket.touchedAt = now;
      buckets.set(key, bucket);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        bucket.inFlight = Math.max(0, bucket.inFlight - 1);
        bucket.touchedAt = Date.now();
      };
    },
    snapshot(key) {
      const bucket = buckets.get(key);
      return bucket ? { accepted: bucket.accepted, inFlight: bucket.inFlight } : null;
    }
  };
}

// src/domain/submissions/idempotency.ts
function createOutcomeMemory(options = {}) {
  const maxRecords = options.maxRecords ?? LIMITS.idempotencyRecords;
  const ttlMs = options.ttlMs ?? LIMITS.idempotencyMs;
  const records = /* @__PURE__ */ new Map();
  function prune(now) {
    for (const [key, record] of records) {
      if (record.expiresAt <= now) records.delete(key);
    }
    while (records.size >= maxRecords) {
      const oldest = records.keys().next().value;
      if (oldest === void 0) break;
      records.delete(oldest);
    }
  }
  return {
    remember(key, fingerprint2, produce, now) {
      prune(now);
      const existing = records.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint2) return { kind: "conflict" };
        return { kind: "replay", outcome: existing.outcome };
      }
      const outcome = produce();
      const record = { expiresAt: now + ttlMs, fingerprint: fingerprint2, outcome };
      records.set(key, record);
      outcome.catch(() => {
        if (records.get(key) === record) records.delete(key);
      });
      return { kind: "fresh", outcome };
    },
    size: () => records.size
  };
}

// src/domain/revision.ts
import { createHash } from "node:crypto";
function revisionOf(content) {
  const hash = createHash("sha256");
  if (typeof content === "string") hash.update(content, "utf8");
  else hash.update(content);
  return hash.digest("hex");
}
function sha256Hex(content) {
  return revisionOf(content);
}
function etagFor(revision) {
  return `"${revision}"`;
}
function ifNoneMatchMatches(header, etag) {
  if (!header) return false;
  return header.split(",").map((candidate) => candidate.trim().replace(/^W\//, "")).some((candidate) => candidate === etag || candidate === "*");
}

// src/pages/page-store.ts
var KV_PREFIX = "cache:";
function createPageStore(host) {
  const memory = /* @__PURE__ */ new Map();
  let memoryBytes = 0;
  function cost(page) {
    return Buffer.byteLength(page.html, "utf8") + 128;
  }
  function retain(session, page) {
    const previous = memory.get(session);
    if (previous) {
      memoryBytes -= cost(previous);
      memory.delete(session);
    }
    memory.set(session, page);
    memoryBytes += cost(page);
    while (memory.size > LIMITS.offlineCacheEntries || memoryBytes > LIMITS.offlineCacheBytes) {
      const oldest = memory.keys().next().value;
      if (oldest === void 0) break;
      const evicted = memory.get(oldest);
      memory.delete(oldest);
      if (evicted) memoryBytes -= cost(evicted);
    }
  }
  async function persist(session, page, previousRevision) {
    if (previousRevision === page.revision) return;
    const key = KV_PREFIX + session;
    if (Buffer.byteLength(page.html, "utf8") > LIMITS.offlineCopyBytes) {
      await host.kv.delete(key).catch((error) => host.log.warn(`offline copy: could not clear ${session}: ${errorText(error)}`));
      return;
    }
    await host.kv.set(key, { html: page.html, revision: page.revision, updatedAtMs: page.updatedAtMs }).catch((error) => {
      host.log.warn(`offline copy: could not store ${session}: ${errorText(error)}`);
    });
  }
  async function cached(session) {
    const resident = memory.get(session);
    if (resident) return resident;
    try {
      const stored = await host.kv.get(KV_PREFIX + session);
      if (!isCachedPage(stored)) return null;
      retain(session, stored);
      return stored;
    } catch (error) {
      host.log.warn(`offline copy: could not read ${session}: ${errorText(error)}`);
      return null;
    }
  }
  async function remember(session, html, updatedAtMs = Date.now()) {
    const page = { html, revision: revisionOf(html), updatedAtMs };
    const previous = memory.get(session)?.revision;
    retain(session, page);
    await persist(session, page, previous);
    return page;
  }
  return {
    async load(session) {
      let content;
      try {
        const location = await host.sessions.storage(session);
        content = await host.files.read(location, ENTRY_FILE);
      } catch (error) {
        const fallback = await cached(session);
        if (fallback) return { ...fallback, stale: true };
        throw PageError.is(error) ? error : new PageError("unavailable", PUBLIC_MESSAGES.unavailable, { cause: error });
      }
      if (!content) throw new PageError("no_page", PUBLIC_MESSAGES.noPage);
      if (content.bytes.byteLength > LIMITS.entryDocumentBytes) {
        throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
      }
      const html = Buffer.from(content.bytes).toString("utf8");
      const page = { html, revision: revisionOf(content.bytes), updatedAtMs: content.modifiedAtMs ?? Date.now() };
      const previous = memory.get(session)?.revision;
      retain(session, page);
      await persist(session, page, previous);
      return { ...page, stale: false };
    },
    remember,
    knownRevision(session) {
      return memory.get(session)?.revision ?? null;
    }
  };
}
function isCachedPage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value;
  return typeof entry.html === "string" && Buffer.byteLength(entry.html, "utf8") <= LIMITS.offlineCopyBytes && isRevision(entry.revision) && revisionOf(entry.html) === entry.revision && typeof entry.updatedAtMs === "number" && Number.isFinite(entry.updatedAtMs);
}

// src/pages/site.ts
function createCoreStorageSite(routeBase, storageFilesBase) {
  return {
    name: "core-storage",
    documentUrl: (session) => `${routeBase}/document?session=${encodeURIComponent(session)}`,
    baseHref: (session) => storageFilesBase(session)
  };
}

// src/serving/bridge/selection-store.ts
import { randomBytes } from "node:crypto";
function createSelectionStore() {
  const selections = /* @__PURE__ */ new Map();
  function prune(now) {
    for (const [token, selection] of selections) {
      if (selection.expiresAt <= now) selections.delete(token);
    }
    while (selections.size > LIMITS.selectionTokens) {
      const oldest = selections.keys().next().value;
      if (oldest === void 0) break;
      selections.delete(oldest);
    }
  }
  return {
    issue(selection, now) {
      prune(now);
      const token = `sel.${randomBytes(18).toString("base64url")}`;
      selections.set(token, { ...selection, expiresAt: now + LIMITS.selectionTokenMs });
      return token;
    },
    peek(token, session, now) {
      prune(now);
      const selection = selections.get(token);
      return selection && selection.session === session ? selection : null;
    },
    redeem(token, session, now) {
      prune(now);
      const selection = selections.get(token);
      if (!selection || selection.session !== session) return null;
      selections.delete(token);
      return selection;
    }
  };
}

// src/domain/json/canonical.ts
import { createHash as createHash2 } from "node:crypto";
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function fingerprint(value) {
  return createHash2("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

// src/domain/tokens/mac.ts
import { createHmac, timingSafeEqual } from "node:crypto";
function signPayload(payload, key) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, key)}`;
}
function openToken(token, key) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts;
  if (!encoded || !supplied) return null;
  try {
    const expected = Buffer.from(signature(encoded, key), "ascii");
    const given = Buffer.from(supplied, "ascii");
    if (given.byteLength !== expected.byteLength) return null;
    if (!timingSafeEqual(given, expected)) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
function signature(encoded, key) {
  return createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function lifetimeValid(payload, now, maxLifetimeMs) {
  const { iat, exp } = payload;
  return typeof iat === "number" && Number.isSafeInteger(iat) && typeof exp === "number" && Number.isSafeInteger(exp) && iat <= now + 3e4 && exp > now && exp > iat && exp - iat <= maxLifetimeMs;
}

// src/domain/tokens/confirmation.ts
function paramsFingerprint(params2) {
  return fingerprint(params2);
}
function mintChallenge(binding, summary, now, key) {
  const bounded = summary.length <= LIMITS.summaryChars ? summary : `${summary.slice(0, LIMITS.summaryChars - 1)}\u2026`;
  const payload = {
    v: 3,
    scope: "confirm",
    session: binding.session,
    revision: binding.revision,
    requestId: binding.requestId,
    method: binding.method,
    paramsHash: paramsFingerprint(binding.params),
    summary: bounded,
    iat: now,
    exp: now + LIMITS.confirmationMs
  };
  return { challenge: signPayload(payload, key), payload };
}
function openChallenge(challenge, key, now) {
  if (typeof challenge !== "string" || challenge.length === 0 || challenge.length > LIMITS.tokenChars) return null;
  const payload = openToken(challenge, key);
  if (!isRecord(payload)) return null;
  if (payload.v !== 3 || payload.scope !== "confirm" || !isSessionId(payload.session) || !isRevision(payload.revision) || !isRequestId(payload.requestId) || !isMethodName(payload.method) || !isRevision(payload.paramsHash) || typeof payload.summary !== "string" || payload.summary.length === 0 || payload.summary.length > LIMITS.summaryChars || !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.confirmationMs)) {
    return null;
  }
  return {
    v: 3,
    scope: "confirm",
    session: payload.session,
    revision: payload.revision,
    requestId: payload.requestId,
    method: payload.method,
    paramsHash: payload.paramsHash,
    summary: payload.summary,
    iat: payload.iat,
    exp: payload.exp
  };
}
function challengeMatches(challenge, binding) {
  return challenge.session === binding.session && challenge.revision === binding.revision && challenge.requestId === binding.requestId && challenge.method === binding.method && challenge.paramsHash === paramsFingerprint(binding.params);
}

// src/domain/tokens/action-token.ts
function mintActionToken(args, key) {
  const payload = {
    v: 3,
    scope: "action",
    session: args.session,
    revision: args.revision,
    iat: args.now,
    exp: args.now + LIMITS.actionTokenMs
  };
  return { token: signPayload(payload, key), payload };
}
function verifyActionToken(token, key, now) {
  if (typeof token !== "string" || token.length === 0 || token.length > LIMITS.tokenChars) return null;
  const payload = openToken(token, key);
  if (!isRecord(payload)) return null;
  if (payload.v !== 3 || payload.scope !== "action" || !isSessionId(payload.session) || !isRevision(payload.revision) || !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.actionTokenMs)) {
    return null;
  }
  return {
    v: 3,
    scope: "action",
    session: payload.session,
    revision: payload.revision,
    iat: payload.iat,
    exp: payload.exp
  };
}

// src/serving/action-request.ts
async function readJsonBody(context, maxBytes) {
  const declared = Number(context.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PageError("request_too_large", "Request body is too large");
  const raw = await context.req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new PageError("request_too_large", "Request body is too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new PageError("invalid_json", "Request body is not valid JSON");
  }
}
function requireActionToken(serving, token) {
  const verified = typeof token === "string" ? verifyActionToken(token, serving.signingKey, serving.now()) : null;
  if (!verified) throw new PageError("confirmation_invalid", PUBLIC_MESSAGES.tokenInvalid, { status: 401 });
  return verified;
}
function acquireRate(serving, session) {
  const release = serving.rate.acquire(session, serving.now());
  if (!release) throw new PageError("rate_limited", PUBLIC_MESSAGES.rateLimited);
  return release;
}

// src/serving/session-access.ts
function sessionIdFrom(context) {
  const url = new URL(context.req.url);
  const candidate = url.searchParams.get("session") ?? url.searchParams.get("threadId");
  if (!isSessionId(candidate)) throw new PageError("invalid_session", PUBLIC_MESSAGES.invalidSession);
  return candidate;
}
async function eligibleSession(serving, id) {
  const session = await serving.host.sessions.get(id);
  if (!session) throw new PageError("not_found", "That session does not exist.");
  const reason = ineligibleReason(session);
  if (reason) throw new PageError("ineligible", `${PUBLIC_MESSAGES.ineligible} (${describeIneligible(reason)}.)`);
  return session;
}

// src/serving/bridge/dispatcher.ts
function parseEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PageError("invalid_request", "Invalid bridge envelope");
  const input = value;
  const keys = Object.keys(input);
  if (!keys.includes("actionToken") || !keys.includes("request") || keys.some((key) => !["actionToken", "request", "confirmation"].includes(key))) {
    throw new PageError("invalid_request", "Invalid bridge envelope");
  }
  if (typeof input.actionToken !== "string" || input.actionToken.length > LIMITS.tokenChars) throw new PageError("invalid_request", "Invalid bridge envelope");
  const confirmation = input.confirmation;
  if (confirmation !== void 0 && confirmation !== null && (typeof confirmation !== "string" || confirmation.length > LIMITS.tokenChars)) {
    throw new PageError("invalid_request", "Invalid bridge envelope");
  }
  return { actionToken: input.actionToken, request: input.request, confirmation: typeof confirmation === "string" ? confirmation : null };
}
function createDispatcher(serving, handlers) {
  const byMethod = new Map(handlers.map((entry) => [entry.method, entry]));
  for (const spec2 of serving.registry.list()) {
    if (spec2.implemented && !byMethod.has(spec2.method)) throw new Error(`No handler for capability ${spec2.method}`);
  }
  return async function dispatch(body) {
    let requestId;
    let release = null;
    try {
      const envelope = parseEnvelope(body);
      requestId = envelope.request?.id;
      const token = requireActionToken(serving, envelope.actionToken);
      release = acquireRate(serving, token.session);
      const request = decodeBridgeRequest(envelope.request);
      requestId = request.id;
      const invocation = resolveInvocation(request, serving.registry, token.revision);
      const entry = byMethod.get(invocation.spec.method);
      if (!entry) throw new PageError("unknown_method", `Unknown capability: ${invocation.spec.method}`);
      const session = await eligibleSession(serving, token.session).catch((error) => {
        throw PageError.is(error) && error.code === "ineligible" ? new PageError("conflict", "This session no longer accepts page actions") : error;
      });
      const page = await serving.pages.load(token.session);
      if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      const context = { serving, session, page, requestId: request.id };
      await entry.refuse?.(invocation.params, context);
      if (invocation.spec.confirmed) {
        const binding = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params };
        if (envelope.confirmation === null) {
          const summary = await entry.summarize?.(invocation.params, context) ?? invocation.spec.description;
          const { challenge: challenge2, payload } = mintChallenge(binding, summary, serving.now(), serving.signingKey);
          return { status: 401, body: { confirm: { requestId: request.id, summary: payload.summary, challenge: challenge2 } } };
        }
        const challenge = openChallenge(envelope.confirmation, serving.signingKey, serving.now());
        if (!challenge || !challengeMatches(challenge, binding)) {
          throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");
        }
      }
      if (page.stale && invocation.spec.effect !== "read" && invocation.spec.effect !== "navigation") {
        throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      }
      let outcome;
      try {
        outcome = await entry.execute(invocation.params, context);
      } catch (error) {
        if (PageError.is(error) && isBridgeErrorCode(error.code)) throw error;
        serving.host.log.warn(`bridge ${request.method} for ${token.session}: ${errorText(error)}`);
        throw new PageError("handler_error", PUBLIC_MESSAGES.handler, { cause: error });
      }
      const response = completeInvocation(invocation, outcome.result);
      return { status: response.ok ? 200 : 500, body: outcome.navigate ? { response, navigate: outcome.navigate } : { response } };
    } catch (error) {
      if (PageError.is(error)) {
        if (error.cause !== void 0) serving.host.log.warn(`bridge: ${error.code}: ${errorText(error.cause)}`);
        const code = isBridgeErrorCode(error.code) ? error.code : error.code === "ineligible" || error.code === "no_page" ? "not_found" : "handler_error";
        return { status: error.status, body: { response: failure(requestId, code, error.message) } };
      }
      serving.host.log.warn(`bridge: ${errorText(error)}`);
      return { status: 500, body: { response: failureFromError(requestId, error) } };
    } finally {
      release?.();
    }
  };
}

// src/serving/bridge/handler.ts
function handler(definition) {
  return definition;
}
function excerpt(text, max = 80) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}\u2026`;
}

// src/serving/bridge/handlers/navigation.ts
var pagesOpen2 = handler({
  method: "pages.open",
  async refuse(params2, { serving }) {
    const target = await serving.host.sessions.get(params2.sessionId);
    if (!target || ineligibleReason(target)) throw new PageError("not_found", "That session has no page");
  },
  async execute(params2, { serving }) {
    return { result: { opened: true }, navigate: { kind: "page", url: pageUrl(serving.routeBase, params2.sessionId) } };
  }
});
var sessionsOpenHost2 = handler({
  method: "sessions.openHost",
  async refuse(params2, { serving }) {
    const target = await serving.host.sessions.get(params2.sessionId);
    if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
  },
  async execute(params2, { serving }) {
    return { result: { opened: true }, navigate: { kind: "host", url: serving.hostSessionUrl(params2.sessionId) } };
  }
});
var navigationOpenExternal2 = handler({
  method: "navigation.openExternal",
  async summarize(params2) {
    const origin = new URL(params2.url).origin;
    return params2.label ? `Leave this page and open \u201C${excerpt(params2.label, 60)}\u201D at ${origin}` : `Leave this page and open ${origin}`;
  },
  async execute(params2) {
    return { result: { opened: true }, navigate: { kind: "external", url: new URL(params2.url).href } };
  }
});

// src/serving/bridge/handlers/reads.ts
var contextGet2 = handler({
  method: "context.get",
  async execute(_params, { serving, session, page }) {
    return {
      result: {
        protocolVersion: 1,
        session: { id: session.id, title: session.title.slice(0, LIMITS.titleChars), projectId: session.projectId },
        page: { revision: page.revision, readOnly: page.stale },
        capabilities: serving.registry.descriptors()
      }
    };
  }
});
var sessionActivity2 = handler({
  method: "session.activity",
  async execute(params2, { serving, session }) {
    const items = await serving.host.sessions.activity(session.id, params2.limit);
    return { result: { state: session.state, updatedAtMs: session.updatedAtMs, items } };
  }
});
function queryKey(params2) {
  return `${params2.projectId ?? ""}|${params2.includeArchived ? 1 : 0}`;
}
function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
function decodeCursor(value, params2) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.phase !== "live" && parsed.phase !== "archived" || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.query !== queryKey(params2)) {
      throw new Error("mismatch");
    }
    return { phase: parsed.phase, offset: parsed.offset, query: parsed.query };
  } catch {
    throw new PageError("invalid_params", "The cursor does not belong to this query");
  }
}
async function pageAvailability(context, sessions) {
  const { serving } = context;
  const byHost = /* @__PURE__ */ new Map();
  await Promise.all(
    sessions.map(async (session) => {
      try {
        const location = await serving.host.sessions.storage(session.id);
        const entries = byHost.get(location.hostId) ?? [];
        entries.push({ session: session.id, path: joinPath(location.rootPath, ENTRY_FILE) });
        byHost.set(location.hostId, entries);
      } catch {
      }
    })
  );
  const availability = /* @__PURE__ */ new Map();
  await Promise.all(
    [...byHost.entries()].map(async ([hostId, entries]) => {
      const existence = await serving.host.files.exist(hostId, entries.map((entry) => entry.path));
      for (const entry of entries) availability.set(entry.session, existence[entry.path] === true);
    })
  );
  return availability;
}
var sessionsSnapshot2 = handler({
  method: "sessions.snapshot",
  async execute(params2, context) {
    const { serving } = context;
    const start = params2.cursor ? decodeCursor(params2.cursor, params2) : { phase: "live", offset: 0, query: queryKey(params2) };
    const collected = [];
    let phase = start.phase;
    let offset = start.offset;
    let next = null;
    while (collected.length < params2.limit) {
      const want = params2.limit - collected.length;
      const rows = await serving.host.sessions.list({
        ...params2.projectId ? { projectId: params2.projectId } : {},
        archived: phase === "archived",
        offset,
        limit: want + 1
      });
      const visible = rows.filter((row) => row.visibility === "visible" && !row.deleted);
      const more = rows.length > want;
      collected.push(...visible.slice(0, want));
      offset += Math.min(rows.length, want);
      if (more) {
        next = { phase, offset, query: start.query };
        break;
      }
      if (phase === "live" && params2.includeArchived) {
        phase = "archived";
        offset = 0;
        continue;
      }
      break;
    }
    const availability = await pageAvailability(context, collected);
    const sessions = collected.map((record) => ({
      id: record.id,
      title: record.title.slice(0, LIMITS.titleChars),
      projectId: record.projectId,
      parentSessionId: record.parentId,
      status: record.state,
      archived: record.archived,
      page: { available: availability.get(record.id) === true, revision: availability.get(record.id) ? serving.pages.knownRevision(record.id) : null },
      updatedAtMs: record.updatedAtMs
    }));
    return { result: { sessions, nextCursor: next ? encodeCursor(next) : null, generatedAtMs: serving.now() } };
  }
});
var projectsList2 = handler({
  method: "projects.list",
  async execute(_params, { serving }) {
    const projects = await serving.host.projects.list();
    return { result: { projects: projects.slice(0, LIMITS.projectsMax).map((project) => ({ id: project.id, name: project.name.slice(0, LIMITS.titleChars), kind: project.kind })) } };
  }
});
var providersList2 = handler({
  method: "providers.list",
  async execute(_params, { serving }) {
    const providers = await serving.host.providers.list();
    return {
      result: {
        providers: providers.slice(0, LIMITS.providersMax).map((provider) => ({
          id: provider.id,
          displayName: provider.displayName.slice(0, LIMITS.titleChars),
          available: provider.available,
          models: provider.models.slice(0, LIMITS.modelsPerProvider).map((model) => ({
            id: model.id,
            displayName: model.displayName.slice(0, LIMITS.titleChars),
            isDefault: model.isDefault,
            reasoningLevels: model.reasoningLevels.slice(0, 16)
          }))
        }))
      }
    };
  }
});
function storageKey2(session, key) {
  return `state:${session}:${key}`;
}
var storageGet2 = handler({
  method: "storage.get",
  async execute(params2, { serving, session }) {
    const stored = await serving.host.kv.get(storageKey2(session.id, params2.key));
    return { result: stored === void 0 ? { found: false } : { found: true, value: stored } };
  }
});
var storageSet2 = handler({
  method: "storage.set",
  async execute(params2, { serving, session }) {
    await serving.host.kv.set(storageKey2(session.id, params2.key), params2.value);
    return { result: { stored: true } };
  }
});

// src/domain/submissions/message.ts
function formatSubmissionMessage(submission) {
  const heading = submission.title.trim() || "Thread Page";
  const sections = submission.answers.map((answer) => {
    const label = answer.label.trim() || answer.name;
    return `**${label}**
${formatValue(answer.value)}`;
  });
  if (submission.files.length > 0) {
    sections.push(
      [
        "**Attached files**",
        ...submission.files.map((file) => `- \`$BB_THREAD_STORAGE/${file.path}\` (${file.name}, ${file.sizeBytes} bytes)`),
        `They are in the \`${UPLOAD_DIR}/\` directory of your page root; read them with your normal tools.`
      ].join("\n")
    );
  }
  return [`The user answered the form on your Thread Page \u2014 ${heading}.`, ...sections].join("\n\n");
}
function formatValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(left blank)";
  return value.length > 0 ? value : "(left blank)";
}
function formatReplyMessage(title2, result2) {
  const heading = title2?.trim() || "Interactive response";
  const serialized = JSON.stringify(result2, null, 2) ?? "null";
  let longestRun = 0;
  for (const match of serialized.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`The user sent an interactive response from your Thread Page \u2014 ${heading}.`, `**Result**

${fence}json
${serialized}
${fence}`].join("\n\n");
}

// src/serving/bridge/handlers/writes.ts
var sessionReply2 = handler({
  method: "session.reply",
  async execute(params2, { serving, session, page, requestId }) {
    const key = `${session.id}:${params2.idempotencyKey ?? requestId}`;
    const print = fingerprint({ revision: page.revision, result: params2.result, mode: params2.mode, title: params2.title ?? null });
    const remembered = serving.replies.remember(key, print, () => serving.host.sessions.send(session.id, formatReplyMessage(params2.title, params2.result), params2.mode), serving.now());
    if (remembered.kind === "conflict") throw new PageError("conflict", "This idempotency key was already used with a different reply");
    const outcome = await remembered.outcome;
    return { result: { delivery: outcome.delivery, duplicate: remembered.kind === "replay" } };
  }
});
async function targetSession(context, id) {
  const target = await context.serving.host.sessions.get(id);
  if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
  return target;
}
var sessionsSend2 = handler({
  method: "sessions.send",
  async refuse(params2, context) {
    if (params2.sessionId === context.session.id) throw new PageError("invalid_params", "Use session.reply to answer this page's own session");
    await targetSession(context, params2.sessionId);
  },
  async summarize(params2, context) {
    const target = await targetSession(context, params2.sessionId);
    return `Send to \u201C${excerpt(target.title, 60)}\u201D: \u201C${excerpt(params2.prompt)}\u201D${params2.mode === "steer" ? " (interrupting its current turn)" : ""}`;
  },
  async execute(params2, { serving }) {
    const sent = await serving.host.sessions.send(params2.sessionId, params2.prompt, params2.mode);
    return { result: { sessionId: params2.sessionId, delivery: sent.delivery, duplicate: false } };
  }
});
async function resolveStart(params2, context) {
  const projects = await context.serving.host.projects.list();
  const project = projects.find((candidate) => candidate.id === params2.projectId);
  if (!project) throw new PageError("not_found", "That project is not available");
  let environment = { kind: "project-default" };
  let environmentLabel = "the project's default environment";
  if (typeof params2.environment === "object") {
    const other = await targetSession(context, params2.environment.sameAs);
    if (!other.environmentId) throw new PageError("invalid_params", "That session has no environment to share");
    environment = { kind: "reuse", environmentId: other.environmentId };
    environmentLabel = `the environment of \u201C${excerpt(other.title, 40)}\u201D`;
  }
  return {
    args: {
      projectId: params2.projectId,
      prompt: params2.prompt,
      ...params2.title ? { title: params2.title } : {},
      ...params2.providerId ? { providerId: params2.providerId } : {},
      ...params2.model ? { model: params2.model } : {},
      ...params2.reasoningLevel ? { reasoningLevel: params2.reasoningLevel } : {},
      environment
    },
    projectName: project.name,
    environmentLabel
  };
}
var sessionsStart2 = handler({
  method: "sessions.start",
  async refuse(params2, context) {
    await resolveStart(params2, context);
  },
  async summarize(params2, context) {
    const { projectName, environmentLabel } = await resolveStart(params2, context);
    const runtime = [params2.providerId, params2.model, params2.reasoningLevel].filter(Boolean).join(" \xB7 ") || "the project's default provider and model";
    return `Start a session in ${projectName}: \u201C${excerpt(params2.prompt)}\u201D \u2014 using ${runtime}, in ${environmentLabel}`;
  },
  async execute(params2, context) {
    const { args } = await resolveStart(params2, context);
    const started = await context.serving.host.sessions.start(args);
    return { result: { sessionId: started.id } };
  }
});
var sessionsStop2 = handler({
  method: "sessions.stop",
  async refuse(params2, context) {
    if (params2.sessionId === context.session.id) throw new PageError("invalid_params", "A page cannot stop its own session");
    await targetSession(context, params2.sessionId);
  },
  async summarize(params2, context) {
    const target = await targetSession(context, params2.sessionId);
    return `Stop \u201C${excerpt(target.title, 60)}\u201D`;
  },
  async execute(params2, { serving }) {
    await serving.host.sessions.stop(params2.sessionId);
    return { result: { stopped: true } };
  }
});
var sessionsArchive2 = handler({
  method: "sessions.archive",
  async refuse(params2, context) {
    await targetSession(context, params2.sessionId);
  },
  async summarize(params2, context) {
    const target = await targetSession(context, params2.sessionId);
    return `Archive \u201C${excerpt(target.title, 60)}\u201D${params2.sessionId === context.session.id ? " (this page's own session; its page will stop being served)" : ""}`;
  },
  async execute(params2, { serving }) {
    await serving.host.sessions.archive(params2.sessionId);
    return { result: { archived: true } };
  }
});
var projectsBrowse2 = handler({
  method: "projects.browse",
  async summarize() {
    return "Choose a project folder on this device";
  },
  async execute(_params, { serving, session }) {
    const location = await serving.host.sessions.storage(session.id);
    const picked = await serving.host.projects.browse(location.hostId);
    if (!picked) return { result: { selection: null } };
    const token = serving.selections.issue({ session: session.id, hostId: location.hostId, path: picked.path }, serving.now());
    return { result: { selection: { token, displayPath: displayPath(picked.path), hostName: picked.hostName } } };
  }
});
function displayPath(path) {
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}
var projectsCreate2 = handler({
  method: "projects.create",
  async refuse(params2, { serving, session }) {
    if (!serving.selections.peek(params2.selectionToken, session.id, serving.now())) {
      throw new PageError("not_found", "That folder selection has expired; choose the folder again");
    }
  },
  async summarize(params2, { serving, session }) {
    const selection = serving.selections.peek(params2.selectionToken, session.id, serving.now());
    const name = params2.name ?? selection?.path.split(/[\\/]/).pop() ?? "the selected folder";
    return `Create project \u201C${excerpt(name, 60)}\u201D from ${selection ? displayPath(selection.path) : "the selected folder"}`;
  },
  async execute(params2, { serving, session }) {
    const selection = serving.selections.redeem(params2.selectionToken, session.id, serving.now());
    if (!selection) throw new PageError("not_found", "That folder selection has expired; choose the folder again");
    const name = params2.name ?? selection.path.split(/[\\/]/).pop() ?? "New project";
    const created = await serving.host.projects.create({ name, hostId: selection.hostId, path: selection.path });
    return { result: { project: { id: created.id, name: created.name, kind: created.kind } } };
  }
});

// src/serving/bridge/handlers/index.ts
var ALL_HANDLERS = [
  contextGet2,
  sessionActivity2,
  sessionsSnapshot2,
  projectsList2,
  providersList2,
  storageGet2,
  storageSet2,
  sessionReply2,
  sessionsSend2,
  sessionsStart2,
  sessionsStop2,
  sessionsArchive2,
  projectsBrowse2,
  projectsCreate2,
  pagesOpen2,
  sessionsOpenHost2,
  navigationOpenExternal2
];

// src/serving/responses.ts
function baseHeaders(contentType) {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  });
}
function shellCsp(nonce) {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "frame-src 'self'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:"
  ].join("; ");
}
function documentCsp() {
  return [
    "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
    "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
    "style-src * data: blob: 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src * data: blob:",
    "media-src * data: blob:",
    "connect-src * data: blob:",
    "worker-src * blob: data:",
    "frame-src 'none'",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "sandbox allow-scripts allow-forms"
  ].join("; ");
}
function jsonResponse(value, status2 = 200, extra) {
  const headers = baseHeaders("application/json; charset=utf-8");
  for (const [key, entry] of Object.entries(extra ?? {})) headers.set(key, entry);
  return new Response(JSON.stringify(value), { status: status2, headers });
}
function errorJson(error) {
  return jsonResponse({ ok: false, code: error.code, message: error.message }, error.status);
}
function errorPage(message, status2) {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thread Page</title><style>body{max-width:42rem;margin:4rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas}h1{font-size:1.4rem}</style></head><body><main><h1>Thread Page</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return new Response(html, { status: status2, headers });
}
function failureResponse(error, log, where, asPage) {
  if (PageError.is(error)) {
    if (error.cause !== void 0) log.warn(`${where}: ${error.code}: ${errorText(error.cause)}`);
    return asPage ? errorPage(error.message, error.status) : errorJson(error);
  }
  log.warn(`${where}: ${errorText(error)}`);
  const generic = new PageError("handler_error", "Something went wrong serving this page.");
  return asPage ? errorPage(generic.message, 500) : errorJson(generic);
}

// src/serving/bridge-route.ts
function bridgeRoute(dispatch) {
  return async (context) => {
    let body;
    try {
      body = await readJsonBody(context, LIMITS.capabilityPayloadBytes + 8192);
    } catch (error) {
      const failed = PageError.is(error) ? error : new PageError("invalid_json", "Invalid bridge body");
      const code = failed.code === "request_too_large" ? "request_too_large" : "invalid_json";
      return jsonResponse({ response: failure(void 0, code, failed.message) }, failed.status);
    }
    const outcome = await dispatch(body);
    return jsonResponse(outcome.body, outcome.status);
  };
}

// node_modules/parse5/dist/common/unicode.js
var UNDEFINED_CODE_POINTS = /* @__PURE__ */ new Set([
  65534,
  65535,
  131070,
  131071,
  196606,
  196607,
  262142,
  262143,
  327678,
  327679,
  393214,
  393215,
  458750,
  458751,
  524286,
  524287,
  589822,
  589823,
  655358,
  655359,
  720894,
  720895,
  786430,
  786431,
  851966,
  851967,
  917502,
  917503,
  983038,
  983039,
  1048574,
  1048575,
  1114110,
  1114111
]);
var REPLACEMENT_CHARACTER = "\uFFFD";
var CODE_POINTS;
(function(CODE_POINTS2) {
  CODE_POINTS2[CODE_POINTS2["EOF"] = -1] = "EOF";
  CODE_POINTS2[CODE_POINTS2["NULL"] = 0] = "NULL";
  CODE_POINTS2[CODE_POINTS2["TABULATION"] = 9] = "TABULATION";
  CODE_POINTS2[CODE_POINTS2["CARRIAGE_RETURN"] = 13] = "CARRIAGE_RETURN";
  CODE_POINTS2[CODE_POINTS2["LINE_FEED"] = 10] = "LINE_FEED";
  CODE_POINTS2[CODE_POINTS2["FORM_FEED"] = 12] = "FORM_FEED";
  CODE_POINTS2[CODE_POINTS2["SPACE"] = 32] = "SPACE";
  CODE_POINTS2[CODE_POINTS2["EXCLAMATION_MARK"] = 33] = "EXCLAMATION_MARK";
  CODE_POINTS2[CODE_POINTS2["QUOTATION_MARK"] = 34] = "QUOTATION_MARK";
  CODE_POINTS2[CODE_POINTS2["AMPERSAND"] = 38] = "AMPERSAND";
  CODE_POINTS2[CODE_POINTS2["APOSTROPHE"] = 39] = "APOSTROPHE";
  CODE_POINTS2[CODE_POINTS2["HYPHEN_MINUS"] = 45] = "HYPHEN_MINUS";
  CODE_POINTS2[CODE_POINTS2["SOLIDUS"] = 47] = "SOLIDUS";
  CODE_POINTS2[CODE_POINTS2["DIGIT_0"] = 48] = "DIGIT_0";
  CODE_POINTS2[CODE_POINTS2["DIGIT_9"] = 57] = "DIGIT_9";
  CODE_POINTS2[CODE_POINTS2["SEMICOLON"] = 59] = "SEMICOLON";
  CODE_POINTS2[CODE_POINTS2["LESS_THAN_SIGN"] = 60] = "LESS_THAN_SIGN";
  CODE_POINTS2[CODE_POINTS2["EQUALS_SIGN"] = 61] = "EQUALS_SIGN";
  CODE_POINTS2[CODE_POINTS2["GREATER_THAN_SIGN"] = 62] = "GREATER_THAN_SIGN";
  CODE_POINTS2[CODE_POINTS2["QUESTION_MARK"] = 63] = "QUESTION_MARK";
  CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_A"] = 65] = "LATIN_CAPITAL_A";
  CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_Z"] = 90] = "LATIN_CAPITAL_Z";
  CODE_POINTS2[CODE_POINTS2["RIGHT_SQUARE_BRACKET"] = 93] = "RIGHT_SQUARE_BRACKET";
  CODE_POINTS2[CODE_POINTS2["GRAVE_ACCENT"] = 96] = "GRAVE_ACCENT";
  CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_A"] = 97] = "LATIN_SMALL_A";
  CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_Z"] = 122] = "LATIN_SMALL_Z";
})(CODE_POINTS || (CODE_POINTS = {}));
var SEQUENCES = {
  DASH_DASH: "--",
  CDATA_START: "[CDATA[",
  DOCTYPE: "doctype",
  SCRIPT: "script",
  PUBLIC: "public",
  SYSTEM: "system"
};
function isSurrogate(cp) {
  return cp >= 55296 && cp <= 57343;
}
function isSurrogatePair(cp) {
  return cp >= 56320 && cp <= 57343;
}
function getSurrogatePairCodePoint(cp1, cp2) {
  return (cp1 - 55296) * 1024 + 9216 + cp2;
}
function isControlCodePoint(cp) {
  return cp !== 32 && cp !== 10 && cp !== 13 && cp !== 9 && cp !== 12 && cp >= 1 && cp <= 31 || cp >= 127 && cp <= 159;
}
function isUndefinedCodePoint(cp) {
  return cp >= 64976 && cp <= 65007 || UNDEFINED_CODE_POINTS.has(cp);
}

// node_modules/parse5/dist/common/error-codes.js
var ERR;
(function(ERR2) {
  ERR2["controlCharacterInInputStream"] = "control-character-in-input-stream";
  ERR2["noncharacterInInputStream"] = "noncharacter-in-input-stream";
  ERR2["surrogateInInputStream"] = "surrogate-in-input-stream";
  ERR2["nonVoidHtmlElementStartTagWithTrailingSolidus"] = "non-void-html-element-start-tag-with-trailing-solidus";
  ERR2["endTagWithAttributes"] = "end-tag-with-attributes";
  ERR2["endTagWithTrailingSolidus"] = "end-tag-with-trailing-solidus";
  ERR2["unexpectedSolidusInTag"] = "unexpected-solidus-in-tag";
  ERR2["unexpectedNullCharacter"] = "unexpected-null-character";
  ERR2["unexpectedQuestionMarkInsteadOfTagName"] = "unexpected-question-mark-instead-of-tag-name";
  ERR2["invalidFirstCharacterOfTagName"] = "invalid-first-character-of-tag-name";
  ERR2["unexpectedEqualsSignBeforeAttributeName"] = "unexpected-equals-sign-before-attribute-name";
  ERR2["missingEndTagName"] = "missing-end-tag-name";
  ERR2["unexpectedCharacterInAttributeName"] = "unexpected-character-in-attribute-name";
  ERR2["unknownNamedCharacterReference"] = "unknown-named-character-reference";
  ERR2["missingSemicolonAfterCharacterReference"] = "missing-semicolon-after-character-reference";
  ERR2["unexpectedCharacterAfterDoctypeSystemIdentifier"] = "unexpected-character-after-doctype-system-identifier";
  ERR2["unexpectedCharacterInUnquotedAttributeValue"] = "unexpected-character-in-unquoted-attribute-value";
  ERR2["eofBeforeTagName"] = "eof-before-tag-name";
  ERR2["eofInTag"] = "eof-in-tag";
  ERR2["missingAttributeValue"] = "missing-attribute-value";
  ERR2["missingWhitespaceBetweenAttributes"] = "missing-whitespace-between-attributes";
  ERR2["missingWhitespaceAfterDoctypePublicKeyword"] = "missing-whitespace-after-doctype-public-keyword";
  ERR2["missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers"] = "missing-whitespace-between-doctype-public-and-system-identifiers";
  ERR2["missingWhitespaceAfterDoctypeSystemKeyword"] = "missing-whitespace-after-doctype-system-keyword";
  ERR2["missingQuoteBeforeDoctypePublicIdentifier"] = "missing-quote-before-doctype-public-identifier";
  ERR2["missingQuoteBeforeDoctypeSystemIdentifier"] = "missing-quote-before-doctype-system-identifier";
  ERR2["missingDoctypePublicIdentifier"] = "missing-doctype-public-identifier";
  ERR2["missingDoctypeSystemIdentifier"] = "missing-doctype-system-identifier";
  ERR2["abruptDoctypePublicIdentifier"] = "abrupt-doctype-public-identifier";
  ERR2["abruptDoctypeSystemIdentifier"] = "abrupt-doctype-system-identifier";
  ERR2["cdataInHtmlContent"] = "cdata-in-html-content";
  ERR2["incorrectlyOpenedComment"] = "incorrectly-opened-comment";
  ERR2["eofInScriptHtmlCommentLikeText"] = "eof-in-script-html-comment-like-text";
  ERR2["eofInDoctype"] = "eof-in-doctype";
  ERR2["nestedComment"] = "nested-comment";
  ERR2["abruptClosingOfEmptyComment"] = "abrupt-closing-of-empty-comment";
  ERR2["eofInComment"] = "eof-in-comment";
  ERR2["incorrectlyClosedComment"] = "incorrectly-closed-comment";
  ERR2["eofInCdata"] = "eof-in-cdata";
  ERR2["absenceOfDigitsInNumericCharacterReference"] = "absence-of-digits-in-numeric-character-reference";
  ERR2["nullCharacterReference"] = "null-character-reference";
  ERR2["surrogateCharacterReference"] = "surrogate-character-reference";
  ERR2["characterReferenceOutsideUnicodeRange"] = "character-reference-outside-unicode-range";
  ERR2["controlCharacterReference"] = "control-character-reference";
  ERR2["noncharacterCharacterReference"] = "noncharacter-character-reference";
  ERR2["missingWhitespaceBeforeDoctypeName"] = "missing-whitespace-before-doctype-name";
  ERR2["missingDoctypeName"] = "missing-doctype-name";
  ERR2["invalidCharacterSequenceAfterDoctypeName"] = "invalid-character-sequence-after-doctype-name";
  ERR2["duplicateAttribute"] = "duplicate-attribute";
  ERR2["nonConformingDoctype"] = "non-conforming-doctype";
  ERR2["missingDoctype"] = "missing-doctype";
  ERR2["misplacedDoctype"] = "misplaced-doctype";
  ERR2["endTagWithoutMatchingOpenElement"] = "end-tag-without-matching-open-element";
  ERR2["closingOfElementWithOpenChildElements"] = "closing-of-element-with-open-child-elements";
  ERR2["disallowedContentInNoscriptInHead"] = "disallowed-content-in-noscript-in-head";
  ERR2["openElementsLeftAfterEof"] = "open-elements-left-after-eof";
  ERR2["abandonedHeadElementChild"] = "abandoned-head-element-child";
  ERR2["misplacedStartTagForHeadElement"] = "misplaced-start-tag-for-head-element";
  ERR2["nestedNoscriptInHead"] = "nested-noscript-in-head";
  ERR2["eofInElementThatCanContainOnlyText"] = "eof-in-element-that-can-contain-only-text";
})(ERR || (ERR = {}));

// node_modules/parse5/dist/tokenizer/preprocessor.js
var DEFAULT_BUFFER_WATERLINE = 1 << 16;
var Preprocessor = class {
  constructor(handler2) {
    this.handler = handler2;
    this.html = "";
    this.pos = -1;
    this.lastGapPos = -2;
    this.gapStack = [];
    this.skipNextNewLine = false;
    this.lastChunkWritten = false;
    this.endOfChunkHit = false;
    this.bufferWaterline = DEFAULT_BUFFER_WATERLINE;
    this.isEol = false;
    this.lineStartPos = 0;
    this.droppedBufferSize = 0;
    this.line = 1;
    this.lastErrOffset = -1;
  }
  /** The column on the current line. If we just saw a gap (eg. a surrogate pair), return the index before. */
  get col() {
    return this.pos - this.lineStartPos + Number(this.lastGapPos !== this.pos);
  }
  get offset() {
    return this.droppedBufferSize + this.pos;
  }
  getError(code, cpOffset) {
    const { line, col, offset } = this;
    const startCol = col + cpOffset;
    const startOffset = offset + cpOffset;
    return {
      code,
      startLine: line,
      endLine: line,
      startCol,
      endCol: startCol,
      startOffset,
      endOffset: startOffset
    };
  }
  _err(code) {
    if (this.handler.onParseError && this.lastErrOffset !== this.offset) {
      this.lastErrOffset = this.offset;
      this.handler.onParseError(this.getError(code, 0));
    }
  }
  _addGap() {
    this.gapStack.push(this.lastGapPos);
    this.lastGapPos = this.pos;
  }
  _processSurrogate(cp) {
    if (this.pos !== this.html.length - 1) {
      const nextCp = this.html.charCodeAt(this.pos + 1);
      if (isSurrogatePair(nextCp)) {
        this.pos++;
        this._addGap();
        return getSurrogatePairCodePoint(cp, nextCp);
      }
    } else if (!this.lastChunkWritten) {
      this.endOfChunkHit = true;
      return CODE_POINTS.EOF;
    }
    this._err(ERR.surrogateInInputStream);
    return cp;
  }
  willDropParsedChunk() {
    return this.pos > this.bufferWaterline;
  }
  dropParsedChunk() {
    if (this.willDropParsedChunk()) {
      this.html = this.html.substring(this.pos);
      this.lineStartPos -= this.pos;
      this.droppedBufferSize += this.pos;
      this.pos = 0;
      this.lastGapPos = -2;
      this.gapStack.length = 0;
    }
  }
  write(chunk, isLastChunk) {
    if (this.html.length > 0) {
      this.html += chunk;
    } else {
      this.html = chunk;
    }
    this.endOfChunkHit = false;
    this.lastChunkWritten = isLastChunk;
  }
  insertHtmlAtCurrentPos(chunk) {
    this.html = this.html.substring(0, this.pos + 1) + chunk + this.html.substring(this.pos + 1);
    this.endOfChunkHit = false;
  }
  startsWith(pattern, caseSensitive) {
    if (this.pos + pattern.length > this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return false;
    }
    if (caseSensitive) {
      return this.html.startsWith(pattern, this.pos);
    }
    for (let i = 0; i < pattern.length; i++) {
      const cp = this.html.charCodeAt(this.pos + i) | 32;
      if (cp !== pattern.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
  peek(offset) {
    const pos = this.pos + offset;
    if (pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return CODE_POINTS.EOF;
    }
    const code = this.html.charCodeAt(pos);
    return code === CODE_POINTS.CARRIAGE_RETURN ? CODE_POINTS.LINE_FEED : code;
  }
  advance() {
    this.pos++;
    if (this.isEol) {
      this.isEol = false;
      this.line++;
      this.lineStartPos = this.pos;
    }
    if (this.pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return CODE_POINTS.EOF;
    }
    let cp = this.html.charCodeAt(this.pos);
    if (cp === CODE_POINTS.CARRIAGE_RETURN) {
      this.isEol = true;
      this.skipNextNewLine = true;
      return CODE_POINTS.LINE_FEED;
    }
    if (cp === CODE_POINTS.LINE_FEED) {
      this.isEol = true;
      if (this.skipNextNewLine) {
        this.line--;
        this.skipNextNewLine = false;
        this._addGap();
        return this.advance();
      }
    }
    this.skipNextNewLine = false;
    if (isSurrogate(cp)) {
      cp = this._processSurrogate(cp);
    }
    const isCommonValidRange = this.handler.onParseError === null || cp > 31 && cp < 127 || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.CARRIAGE_RETURN || cp > 159 && cp < 64976;
    if (!isCommonValidRange) {
      this._checkForProblematicCharacters(cp);
    }
    return cp;
  }
  _checkForProblematicCharacters(cp) {
    if (isControlCodePoint(cp)) {
      this._err(ERR.controlCharacterInInputStream);
    } else if (isUndefinedCodePoint(cp)) {
      this._err(ERR.noncharacterInInputStream);
    }
  }
  retreat(count) {
    this.pos -= count;
    while (this.pos < this.lastGapPos) {
      this.lastGapPos = this.gapStack.pop();
      this.pos--;
    }
    this.isEol = false;
  }
};

// node_modules/parse5/dist/common/token.js
var TokenType;
(function(TokenType2) {
  TokenType2[TokenType2["CHARACTER"] = 0] = "CHARACTER";
  TokenType2[TokenType2["NULL_CHARACTER"] = 1] = "NULL_CHARACTER";
  TokenType2[TokenType2["WHITESPACE_CHARACTER"] = 2] = "WHITESPACE_CHARACTER";
  TokenType2[TokenType2["START_TAG"] = 3] = "START_TAG";
  TokenType2[TokenType2["END_TAG"] = 4] = "END_TAG";
  TokenType2[TokenType2["COMMENT"] = 5] = "COMMENT";
  TokenType2[TokenType2["DOCTYPE"] = 6] = "DOCTYPE";
  TokenType2[TokenType2["EOF"] = 7] = "EOF";
  TokenType2[TokenType2["HIBERNATION"] = 8] = "HIBERNATION";
})(TokenType || (TokenType = {}));
function getTokenAttr(token, attrName) {
  for (let i = token.attrs.length - 1; i >= 0; i--) {
    if (token.attrs[i].name === attrName) {
      return token.attrs[i].value;
    }
  }
  return null;
}

// node_modules/entities/dist/decode-codepoint.js
var c1 = [
  8364,
  0,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  0,
  381,
  0,
  0,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  0,
  382,
  376
];
function isInvalidCodePoint(codePoint) {
  return codePoint === 0 || codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111;
}
function replaceCodePoint(codePoint) {
  if (isInvalidCodePoint(codePoint)) {
    return 65533;
  }
  if (codePoint >= 128 && codePoint <= 159) {
    return c1[codePoint - 128] || codePoint;
  }
  return codePoint;
}
function replaceCodePointXML(codePoint) {
  return isInvalidCodePoint(codePoint) ? 65533 : codePoint;
}

// node_modules/entities/dist/internal/decode-shared.js
var BASE91_INVERSE = /* @__PURE__ */ (() => {
  const table = new Uint8Array(127);
  let code = 0;
  for (let char = 33; char <= 126; char++) {
    if (char !== 34 && char !== 36 && char !== 92) {
      table[char] = code++;
    }
  }
  return table;
})();
function decodeTrieDict(input, resultLength, atomCount, dict1AtomCount, ngramCount, dictSize) {
  const base = 91;
  const inputLength = input.length;
  const twoCharBias = dictSize * (base - 1);
  let pos = 0;
  const readSlotCode = () => {
    const c12 = BASE91_INVERSE[input.charCodeAt(pos++)];
    return c12 < dictSize ? c12 : c12 * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
  };
  const dict2AtomCount = atomCount - dict1AtomCount;
  const slotCount = atomCount + ngramCount;
  const single = new Int32Array(slotCount);
  single.fill(-1, dict1AtomCount, dictSize);
  single.fill(-1, dictSize + dict2AtomCount, slotCount);
  const start = new Int32Array(slotCount);
  const length = new Int32Array(slotCount);
  function decodeDelta(count, off) {
    let previous = 0;
    let slot = off;
    const end = off + count;
    while (slot < end) {
      const code = BASE91_INVERSE[input.charCodeAt(pos++)];
      if (code < 89) {
        previous += code;
        single[slot++] = previous;
      } else if (code === 89) {
        let runLength = BASE91_INVERSE[input.charCodeAt(pos++)] + 2;
        while (runLength--)
          single[slot++] = ++previous;
      } else {
        const next = BASE91_INVERSE[input.charCodeAt(pos++)];
        previous += 89 + // eslint-disable-next-line unicorn/prefer-minimal-ternary -- branches read a different number of side-effecting input bytes
        (next < 90 ? next * base + BASE91_INVERSE[input.charCodeAt(pos++)] : BASE91_INVERSE[input.charCodeAt(pos++)] * 8281 + BASE91_INVERSE[input.charCodeAt(pos++)] * base + BASE91_INVERSE[input.charCodeAt(pos++)]);
        single[slot++] = previous;
      }
    }
  }
  decodeDelta(dict1AtomCount, 0);
  decodeDelta(dict2AtomCount, dictSize);
  const references = new Int32Array(ngramCount * 2);
  let poolSize = 0;
  let ngramIndex = 0;
  function readNgramReferences(count, startSlot) {
    for (let index = 0; index < count; index++) {
      const slot = startSlot + index;
      const a = readSlotCode();
      const b = readSlotCode();
      references[ngramIndex * 2] = a;
      references[ngramIndex * 2 + 1] = b;
      ngramIndex += 1;
      start[slot] = poolSize;
      const entryLength = (single[a] < 0 ? length[a] : 1) + (single[b] < 0 ? length[b] : 1);
      length[slot] = entryLength;
      poolSize += entryLength;
    }
  }
  readNgramReferences(ngramCount - dictSize + dict1AtomCount, dictSize + dict2AtomCount);
  readNgramReferences(dictSize - dict1AtomCount, dict1AtomCount);
  const pool = new Uint16Array(poolSize);
  let write = 0;
  for (let index = 0; index < ngramIndex; index++) {
    for (let half = 0; half < 2; half++) {
      const source = references[index * 2 + half];
      const value = single[source];
      if (value < 0) {
        let read = start[source];
        const readEnd = read + length[source];
        while (read < readEnd)
          pool[write++] = pool[read++];
      } else {
        pool[write++] = value;
      }
    }
  }
  const out = new Uint16Array(resultLength);
  let outIndex = 0;
  while (pos < inputLength) {
    let slot = BASE91_INVERSE[input.charCodeAt(pos++)];
    if (slot >= dictSize) {
      slot = slot * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
    }
    const value = single[slot];
    if (value < 0) {
      let read = start[slot];
      const readEnd = read + length[slot];
      while (read < readEnd)
        out[outIndex++] = pool[read++];
    } else {
      out[outIndex++] = value;
    }
  }
  return out;
}

// node_modules/entities/dist/generated/decode-data-html.js
var htmlDecodeTree = /* @__PURE__ */ decodeTrieDict("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P", 13494, 2713, 49, 25, 61);

// node_modules/entities/dist/generated/decode-data-xml.js
var xmlDecodeTree = /* @__PURE__ */ new Uint16Array([
  512,
  26465,
  29036,
  7,
  0,
  2,
  4,
  116,
  24638,
  116,
  24636,
  8693,
  29807,
  24610,
  621,
  1,
  0,
  0,
  3,
  112,
  24614,
  111,
  115,
  24615
]);

// node_modules/entities/dist/internal/bin-trie-flags.js
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags2[BinTrieFlags2["FLAG13"] = 8192] = "FLAG13";
  BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 8064] = "BRANCH_LENGTH";
  BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
  BinTrieFlags2[BinTrieFlags2["VALUE_MASK"] = 8191] = "VALUE_MASK";
})(BinTrieFlags || (BinTrieFlags = {}));

// node_modules/entities/dist/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2["AMP"] = 38] = "AMP";
  CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
  CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
  CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
  CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
  CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
  CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
  CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
function isNumber(code) {
  return code - CharCodes.ZERO >>> 0 <= 9;
}
function isHexadecimalCharacter(code) {
  return (code | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 5;
}
function isAlpha(code) {
  return (code | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 25;
}
function isEntityInAttributeInvalidEnd(code) {
  return code === CharCodes.EQUALS || isAlpha(code) || isNumber(code);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
  DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
  DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
var EntityDecoder = class {
  decodeTree;
  emitCodePoint;
  errors;
  /** The current state of the decoder. */
  state = EntityDecoderState.EntityStart;
  /** Characters that were consumed while parsing an entity. */
  consumed = 1;
  /**
   * The result of the entity.
   *
   * For named entities: the trie index of the best legacy match so far
   * (0 = none). For numeric entities: the accumulated code point.
   */
  result = 0;
  /** The current index in the decode tree. */
  treeIndex = 0;
  /**
   * Characters consumed since the last recorded legacy match, plus one.
   * Invariant at the top of the `stateNamedEntity` loop: `excess` equals
   * the number of unrecorded consumed characters + 1.
   */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: False positive (read via destructuring)
  excess = 1;
  /** The mode in which the decoder is operating. */
  decodeMode = DecodingMode.Strict;
  /** The number of characters that have been consumed in the current run. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: False positive
  runConsumed = 0;
  constructor(decodeTree, emitCodePoint, errors) {
    this.decodeTree = decodeTree;
    this.emitCodePoint = emitCodePoint;
    this.errors = errors;
  }
  /**
   * Resets the instance to make it reusable.
   * @param decodeMode Entity decoding mode to use.
   */
  startEntity(decodeMode) {
    this.decodeMode = decodeMode;
    this.state = EntityDecoderState.EntityStart;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.consumed = 1;
    this.runConsumed = 0;
  }
  /**
   * Write an entity to the decoder. This can be called multiple times with partial entities.
   * If the entity is incomplete, the decoder will return -1.
   *
   * Mirrors the non-streaming `decodeWithTrie`, but with the ability to stop decoding if the
   * entity is incomplete, and resume when the next string is written.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  write(input, offset) {
    switch (this.state) {
      case EntityDecoderState.EntityStart: {
        if (input.charCodeAt(offset) === CharCodes.NUM) {
          this.state = EntityDecoderState.NumericStart;
          this.consumed += 1;
          return this.stateNumericStart(input, offset + 1);
        }
        this.state = EntityDecoderState.NamedEntity;
        return this.stateNamedEntity(input, offset);
      }
      case EntityDecoderState.NumericStart: {
        return this.stateNumericStart(input, offset);
      }
      case EntityDecoderState.NumericDecimal: {
        return this.stateNumericDecimal(input, offset);
      }
      case EntityDecoderState.NumericHex: {
        return this.stateNumericHex(input, offset);
      }
      default: {
        return this.stateNamedEntity(input, offset);
      }
    }
  }
  /**
   * Switches between the numeric decimal and hexadecimal states.
   *
   * Equivalent to the `Numeric character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  // eslint-disable-next-line unicorn/consistent-class-member-order
  stateNumericStart(input, offset) {
    if (offset >= input.length) {
      return -1;
    }
    if ((input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
      this.state = EntityDecoderState.NumericHex;
      this.consumed += 1;
      return this.stateNumericHex(input, offset + 1);
    }
    this.state = EntityDecoderState.NumericDecimal;
    return this.stateNumericDecimal(input, offset);
  }
  /**
   * Parses a hexadecimal numeric entity.
   *
   * Equivalent to the `Hexademical character reference state` in the HTML
   * spec. Digit parsing matches the hex loop in `parseNumericEntity`.
   * The accumulated value is preserved for numeric validation callbacks.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericHex(input, offset) {
    const inputLength = input.length;
    let { result: result2 } = this;
    let { consumed } = this;
    while (offset < inputLength) {
      const char = input.charCodeAt(offset);
      if (isNumber(char) || isHexadecimalCharacter(char)) {
        const digit = char <= CharCodes.NINE ? char - CharCodes.ZERO : (char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10;
        result2 = result2 * 16 + digit;
        consumed += 1;
        offset += 1;
      } else {
        this.result = result2;
        this.consumed = consumed;
        return this.emitNumericEntity(char, 3);
      }
    }
    this.result = result2;
    this.consumed = consumed;
    return -1;
  }
  /**
   * Parses a decimal numeric entity.
   *
   * Equivalent to the `Decimal character reference state` in the HTML
   * spec. Digit parsing matches the decimal loop in `parseNumericEntity`.
   * The accumulated value is preserved for numeric validation callbacks.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericDecimal(input, offset) {
    const inputLength = input.length;
    let { result: result2 } = this;
    let { consumed } = this;
    while (offset < inputLength) {
      const digit = input.charCodeAt(offset) - CharCodes.ZERO;
      if (digit >>> 0 > 9) {
        this.result = result2;
        this.consumed = consumed;
        return this.emitNumericEntity(digit + CharCodes.ZERO, 2);
      }
      result2 = result2 * 10 + digit;
      consumed += 1;
      offset += 1;
    }
    this.result = result2;
    this.consumed = consumed;
    return -1;
  }
  /**
   * Validate and emit a numeric entity.
   *
   * Implements the logic from the `Hexademical character reference start
   * state` and `Numeric character reference end state` in the HTML spec.
   * @param lastCp The last code point of the entity. Used to see if the
   *               entity was terminated with a semicolon.
   * @param expectedLength The minimum number of characters that should be
   *                       consumed. Used to validate that at least one digit
   *                       was consumed.
   * @returns The number of characters that were consumed.
   */
  emitNumericEntity(lastCp, expectedLength) {
    if (this.consumed <= expectedLength) {
      this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed);
      return 0;
    }
    if (lastCp === CharCodes.SEMI) {
      this.consumed += 1;
    } else if (this.decodeMode === DecodingMode.Strict) {
      return 0;
    }
    this.emitCodePoint((this.decodeTree === xmlDecodeTree ? replaceCodePointXML : replaceCodePoint)(this.result), this.consumed);
    if (this.errors) {
      if (lastCp !== CharCodes.SEMI) {
        this.errors.missingSemicolonAfterCharacterReference();
      }
      this.errors.validateNumericCharacterReference(this.result);
    }
    return this.consumed;
  }
  /**
   * Flush locally-tracked walk state back to the fields, then emit the
   * recorded legacy match or reject (cold path — at most once per
   * entity). Called after failed navigation (leaf node, branch miss, or
   * compact-run mismatch). In attribute mode, reject if no legacy was
   * recorded at the current node, if we descended past it, or if the
   * pending input character is an invalid attribute terminator.
   * @param consumed Locally-tracked consumed count.
   * @param excess Locally-tracked excess count.
   * @param char Pending input character (may be the mismatching char).
   * @param valueLength Value length at the current trie node.
   */
  flushAndEmitLegacyOrReject(consumed, excess, char, valueLength2) {
    this.consumed = consumed;
    this.excess = excess;
    return this.result === 0 || this.decodeMode === DecodingMode.Attribute && (valueLength2 === 0 || excess > 1 || isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
  }
  /**
   * Parses a named entity.
   *
   * Equivalent to the `Named character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNamedEntity(input, offset) {
    const { decodeTree } = this;
    const inputLength = input.length;
    const isStrict = this.decodeMode === DecodingMode.Strict;
    let { treeIndex } = this;
    let { excess } = this;
    let { consumed } = this;
    let current = decodeTree[treeIndex];
    while (offset < inputLength) {
      while ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === 0 && (current & BinTrieFlags.JUMP_TABLE) !== 0) {
        const char2 = input.charCodeAt(offset);
        const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
        const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
        if (branchCount === 0) {
          if (char2 !== jumpOffset) {
            return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
          }
          treeIndex += 1;
        } else {
          const slot = char2 - jumpOffset;
          if (slot >>> 0 >= branchCount) {
            return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
          }
          const stored = decodeTree[treeIndex + 1 + slot];
          if (stored === 0) {
            return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
          }
          treeIndex = treeIndex + branchCount + stored & 65535;
        }
        current = decodeTree[treeIndex];
        offset += 1;
        excess += 1;
        if (offset >= inputLength)
          break;
      }
      if (offset >= inputLength)
        break;
      if ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === BinTrieFlags.FLAG13) {
        const runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
        let { runConsumed } = this;
        if (runConsumed === 0) {
          const char2 = input.charCodeAt(offset);
          if (char2 !== (current & BinTrieFlags.JUMP_TABLE)) {
            return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
          }
          offset += 1;
          excess += 1;
          runConsumed = 1;
        }
        while (runConsumed < runLength) {
          if (offset >= inputLength) {
            this.treeIndex = treeIndex;
            this.excess = excess;
            this.consumed = consumed;
            this.runConsumed = runConsumed;
            return -1;
          }
          const charIndexInPacked = runConsumed - 1;
          const packedWord = decodeTree[treeIndex + 1 + (charIndexInPacked >> 1)];
          const expectedChar = packedWord >> ((charIndexInPacked & 1) << 3) & 255;
          const char2 = input.charCodeAt(offset);
          if (char2 !== expectedChar) {
            this.runConsumed = 0;
            return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
          }
          offset += 1;
          excess += 1;
          runConsumed += 1;
        }
        this.runConsumed = 0;
        treeIndex += 1 + (runLength >> 1);
        current = decodeTree[treeIndex];
        continue;
      }
      const valueLength2 = current >>> 14;
      const char = input.charCodeAt(offset);
      if (valueLength2 !== 0) {
        if (!isStrict && (current & BinTrieFlags.FLAG13) === 0) {
          this.result = treeIndex;
          consumed += excess - 1;
          excess = 1;
        }
        if (char === CharCodes.SEMI) {
          return this.emitNamedEntityData(treeIndex, valueLength2, consumed + excess);
        }
        if (valueLength2 === 1) {
          return this.flushAndEmitLegacyOrReject(consumed, excess, char, valueLength2);
        }
      }
      const next = determineBranch(decodeTree, current, treeIndex + (valueLength2 || 1), char);
      if (next < 0) {
        return this.flushAndEmitLegacyOrReject(consumed, excess, char, valueLength2);
      }
      treeIndex = next;
      current = decodeTree[treeIndex];
      offset += 1;
      excess += 1;
    }
    if (!isStrict && current >>> 14 !== 0 && (current & BinTrieFlags.FLAG13) === 0) {
      this.result = treeIndex;
      consumed += excess - 1;
      excess = 1;
    }
    this.treeIndex = treeIndex;
    this.excess = excess;
    this.consumed = consumed;
    return -1;
  }
  /**
   * Emit a named entity that was not terminated with a semicolon.
   * @returns The number of characters consumed.
   */
  emitNotTerminatedNamedEntity() {
    const { result: result2, decodeTree } = this;
    const valueLength2 = decodeTree[result2] >>> 14;
    this.emitNamedEntityData(result2, valueLength2, this.consumed);
    this.errors?.missingSemicolonAfterCharacterReference();
    return this.consumed;
  }
  /**
   * Emit a named entity.
   * @param result The index of the entity in the decode tree.
   * @param valueLength Encoded value length (header plus any value words).
   * @param consumed The number of characters consumed.
   * @returns The number of characters consumed.
   */
  emitNamedEntityData(result2, valueLength2, consumed) {
    const { decodeTree } = this;
    this.emitCodePoint(valueLength2 === 1 ? decodeTree[result2] & BinTrieFlags.VALUE_MASK : decodeTree[result2 + 1], consumed);
    if (valueLength2 === 3) {
      this.emitCodePoint(decodeTree[result2 + 2], consumed);
    }
    return consumed;
  }
  /**
   * Signal to the parser that the end of the input was reached.
   *
   * Remaining data will be emitted and relevant errors will be produced.
   * @returns The number of characters consumed.
   */
  end() {
    switch (this.state) {
      case EntityDecoderState.NamedEntity: {
        return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
      }
      // Otherwise, emit a numeric entity if we have one.
      case EntityDecoderState.NumericDecimal: {
        return this.emitNumericEntity(0, 2);
      }
      case EntityDecoderState.NumericHex: {
        return this.emitNumericEntity(0, 3);
      }
      case EntityDecoderState.NumericStart: {
        this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      default: {
        return 0;
      }
    }
  }
};
function determineBranch(decodeTree, current, nodeIndex, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (jumpOffset) {
    if (branchCount === 0) {
      return char === jumpOffset ? nodeIndex : -1;
    }
    const slot = char - jumpOffset;
    if (slot >>> 0 >= branchCount)
      return -1;
    const stored = decodeTree[nodeIndex + slot];
    return stored === 0 ? -1 : nodeIndex + branchCount + stored - 1 & 65535;
  }
  if (branchCount === 0)
    return -1;
  const packedKeySlots = branchCount + 1 >> 1;
  const branchEnd = nodeIndex + packedKeySlots + branchCount;
  for (let index = 0; index < branchCount; index++) {
    const packed = decodeTree[nodeIndex + (index >> 1)];
    const key = packed >> ((index & 1) << 3) & 255;
    if (key === char) {
      const pointerIndex = nodeIndex + packedKeySlots + index;
      return branchEnd + decodeTree[pointerIndex] & 65535;
    }
    if (key > char)
      return -1;
  }
  return -1;
}

// node_modules/parse5/dist/common/html.js
var NS;
(function(NS2) {
  NS2["HTML"] = "http://www.w3.org/1999/xhtml";
  NS2["MATHML"] = "http://www.w3.org/1998/Math/MathML";
  NS2["SVG"] = "http://www.w3.org/2000/svg";
  NS2["XLINK"] = "http://www.w3.org/1999/xlink";
  NS2["XML"] = "http://www.w3.org/XML/1998/namespace";
  NS2["XMLNS"] = "http://www.w3.org/2000/xmlns/";
})(NS || (NS = {}));
var ATTRS;
(function(ATTRS2) {
  ATTRS2["TYPE"] = "type";
  ATTRS2["ACTION"] = "action";
  ATTRS2["ENCODING"] = "encoding";
  ATTRS2["PROMPT"] = "prompt";
  ATTRS2["NAME"] = "name";
  ATTRS2["COLOR"] = "color";
  ATTRS2["FACE"] = "face";
  ATTRS2["SIZE"] = "size";
})(ATTRS || (ATTRS = {}));
var DOCUMENT_MODE;
(function(DOCUMENT_MODE2) {
  DOCUMENT_MODE2["NO_QUIRKS"] = "no-quirks";
  DOCUMENT_MODE2["QUIRKS"] = "quirks";
  DOCUMENT_MODE2["LIMITED_QUIRKS"] = "limited-quirks";
})(DOCUMENT_MODE || (DOCUMENT_MODE = {}));
var TAG_NAMES;
(function(TAG_NAMES2) {
  TAG_NAMES2["A"] = "a";
  TAG_NAMES2["ADDRESS"] = "address";
  TAG_NAMES2["ANNOTATION_XML"] = "annotation-xml";
  TAG_NAMES2["APPLET"] = "applet";
  TAG_NAMES2["AREA"] = "area";
  TAG_NAMES2["ARTICLE"] = "article";
  TAG_NAMES2["ASIDE"] = "aside";
  TAG_NAMES2["B"] = "b";
  TAG_NAMES2["BASE"] = "base";
  TAG_NAMES2["BASEFONT"] = "basefont";
  TAG_NAMES2["BGSOUND"] = "bgsound";
  TAG_NAMES2["BIG"] = "big";
  TAG_NAMES2["BLOCKQUOTE"] = "blockquote";
  TAG_NAMES2["BODY"] = "body";
  TAG_NAMES2["BR"] = "br";
  TAG_NAMES2["BUTTON"] = "button";
  TAG_NAMES2["CAPTION"] = "caption";
  TAG_NAMES2["CENTER"] = "center";
  TAG_NAMES2["CODE"] = "code";
  TAG_NAMES2["COL"] = "col";
  TAG_NAMES2["COLGROUP"] = "colgroup";
  TAG_NAMES2["DD"] = "dd";
  TAG_NAMES2["DESC"] = "desc";
  TAG_NAMES2["DETAILS"] = "details";
  TAG_NAMES2["DIALOG"] = "dialog";
  TAG_NAMES2["DIR"] = "dir";
  TAG_NAMES2["DIV"] = "div";
  TAG_NAMES2["DL"] = "dl";
  TAG_NAMES2["DT"] = "dt";
  TAG_NAMES2["EM"] = "em";
  TAG_NAMES2["EMBED"] = "embed";
  TAG_NAMES2["FIELDSET"] = "fieldset";
  TAG_NAMES2["FIGCAPTION"] = "figcaption";
  TAG_NAMES2["FIGURE"] = "figure";
  TAG_NAMES2["FONT"] = "font";
  TAG_NAMES2["FOOTER"] = "footer";
  TAG_NAMES2["FOREIGN_OBJECT"] = "foreignObject";
  TAG_NAMES2["FORM"] = "form";
  TAG_NAMES2["FRAME"] = "frame";
  TAG_NAMES2["FRAMESET"] = "frameset";
  TAG_NAMES2["H1"] = "h1";
  TAG_NAMES2["H2"] = "h2";
  TAG_NAMES2["H3"] = "h3";
  TAG_NAMES2["H4"] = "h4";
  TAG_NAMES2["H5"] = "h5";
  TAG_NAMES2["H6"] = "h6";
  TAG_NAMES2["HEAD"] = "head";
  TAG_NAMES2["HEADER"] = "header";
  TAG_NAMES2["HGROUP"] = "hgroup";
  TAG_NAMES2["HR"] = "hr";
  TAG_NAMES2["HTML"] = "html";
  TAG_NAMES2["I"] = "i";
  TAG_NAMES2["IMG"] = "img";
  TAG_NAMES2["IMAGE"] = "image";
  TAG_NAMES2["INPUT"] = "input";
  TAG_NAMES2["IFRAME"] = "iframe";
  TAG_NAMES2["KEYGEN"] = "keygen";
  TAG_NAMES2["LABEL"] = "label";
  TAG_NAMES2["LI"] = "li";
  TAG_NAMES2["LINK"] = "link";
  TAG_NAMES2["LISTING"] = "listing";
  TAG_NAMES2["MAIN"] = "main";
  TAG_NAMES2["MALIGNMARK"] = "malignmark";
  TAG_NAMES2["MARQUEE"] = "marquee";
  TAG_NAMES2["MATH"] = "math";
  TAG_NAMES2["MENU"] = "menu";
  TAG_NAMES2["META"] = "meta";
  TAG_NAMES2["MGLYPH"] = "mglyph";
  TAG_NAMES2["MI"] = "mi";
  TAG_NAMES2["MO"] = "mo";
  TAG_NAMES2["MN"] = "mn";
  TAG_NAMES2["MS"] = "ms";
  TAG_NAMES2["MTEXT"] = "mtext";
  TAG_NAMES2["NAV"] = "nav";
  TAG_NAMES2["NOBR"] = "nobr";
  TAG_NAMES2["NOFRAMES"] = "noframes";
  TAG_NAMES2["NOEMBED"] = "noembed";
  TAG_NAMES2["NOSCRIPT"] = "noscript";
  TAG_NAMES2["OBJECT"] = "object";
  TAG_NAMES2["OL"] = "ol";
  TAG_NAMES2["OPTGROUP"] = "optgroup";
  TAG_NAMES2["OPTION"] = "option";
  TAG_NAMES2["P"] = "p";
  TAG_NAMES2["PARAM"] = "param";
  TAG_NAMES2["PLAINTEXT"] = "plaintext";
  TAG_NAMES2["PRE"] = "pre";
  TAG_NAMES2["RB"] = "rb";
  TAG_NAMES2["RP"] = "rp";
  TAG_NAMES2["RT"] = "rt";
  TAG_NAMES2["RTC"] = "rtc";
  TAG_NAMES2["RUBY"] = "ruby";
  TAG_NAMES2["S"] = "s";
  TAG_NAMES2["SCRIPT"] = "script";
  TAG_NAMES2["SEARCH"] = "search";
  TAG_NAMES2["SECTION"] = "section";
  TAG_NAMES2["SELECT"] = "select";
  TAG_NAMES2["SOURCE"] = "source";
  TAG_NAMES2["SMALL"] = "small";
  TAG_NAMES2["SPAN"] = "span";
  TAG_NAMES2["STRIKE"] = "strike";
  TAG_NAMES2["STRONG"] = "strong";
  TAG_NAMES2["STYLE"] = "style";
  TAG_NAMES2["SUB"] = "sub";
  TAG_NAMES2["SUMMARY"] = "summary";
  TAG_NAMES2["SUP"] = "sup";
  TAG_NAMES2["TABLE"] = "table";
  TAG_NAMES2["TBODY"] = "tbody";
  TAG_NAMES2["TEMPLATE"] = "template";
  TAG_NAMES2["TEXTAREA"] = "textarea";
  TAG_NAMES2["TFOOT"] = "tfoot";
  TAG_NAMES2["TD"] = "td";
  TAG_NAMES2["TH"] = "th";
  TAG_NAMES2["THEAD"] = "thead";
  TAG_NAMES2["TITLE"] = "title";
  TAG_NAMES2["TR"] = "tr";
  TAG_NAMES2["TRACK"] = "track";
  TAG_NAMES2["TT"] = "tt";
  TAG_NAMES2["U"] = "u";
  TAG_NAMES2["UL"] = "ul";
  TAG_NAMES2["SVG"] = "svg";
  TAG_NAMES2["VAR"] = "var";
  TAG_NAMES2["WBR"] = "wbr";
  TAG_NAMES2["XMP"] = "xmp";
})(TAG_NAMES || (TAG_NAMES = {}));
var TAG_ID;
(function(TAG_ID2) {
  TAG_ID2[TAG_ID2["UNKNOWN"] = 0] = "UNKNOWN";
  TAG_ID2[TAG_ID2["A"] = 1] = "A";
  TAG_ID2[TAG_ID2["ADDRESS"] = 2] = "ADDRESS";
  TAG_ID2[TAG_ID2["ANNOTATION_XML"] = 3] = "ANNOTATION_XML";
  TAG_ID2[TAG_ID2["APPLET"] = 4] = "APPLET";
  TAG_ID2[TAG_ID2["AREA"] = 5] = "AREA";
  TAG_ID2[TAG_ID2["ARTICLE"] = 6] = "ARTICLE";
  TAG_ID2[TAG_ID2["ASIDE"] = 7] = "ASIDE";
  TAG_ID2[TAG_ID2["B"] = 8] = "B";
  TAG_ID2[TAG_ID2["BASE"] = 9] = "BASE";
  TAG_ID2[TAG_ID2["BASEFONT"] = 10] = "BASEFONT";
  TAG_ID2[TAG_ID2["BGSOUND"] = 11] = "BGSOUND";
  TAG_ID2[TAG_ID2["BIG"] = 12] = "BIG";
  TAG_ID2[TAG_ID2["BLOCKQUOTE"] = 13] = "BLOCKQUOTE";
  TAG_ID2[TAG_ID2["BODY"] = 14] = "BODY";
  TAG_ID2[TAG_ID2["BR"] = 15] = "BR";
  TAG_ID2[TAG_ID2["BUTTON"] = 16] = "BUTTON";
  TAG_ID2[TAG_ID2["CAPTION"] = 17] = "CAPTION";
  TAG_ID2[TAG_ID2["CENTER"] = 18] = "CENTER";
  TAG_ID2[TAG_ID2["CODE"] = 19] = "CODE";
  TAG_ID2[TAG_ID2["COL"] = 20] = "COL";
  TAG_ID2[TAG_ID2["COLGROUP"] = 21] = "COLGROUP";
  TAG_ID2[TAG_ID2["DD"] = 22] = "DD";
  TAG_ID2[TAG_ID2["DESC"] = 23] = "DESC";
  TAG_ID2[TAG_ID2["DETAILS"] = 24] = "DETAILS";
  TAG_ID2[TAG_ID2["DIALOG"] = 25] = "DIALOG";
  TAG_ID2[TAG_ID2["DIR"] = 26] = "DIR";
  TAG_ID2[TAG_ID2["DIV"] = 27] = "DIV";
  TAG_ID2[TAG_ID2["DL"] = 28] = "DL";
  TAG_ID2[TAG_ID2["DT"] = 29] = "DT";
  TAG_ID2[TAG_ID2["EM"] = 30] = "EM";
  TAG_ID2[TAG_ID2["EMBED"] = 31] = "EMBED";
  TAG_ID2[TAG_ID2["FIELDSET"] = 32] = "FIELDSET";
  TAG_ID2[TAG_ID2["FIGCAPTION"] = 33] = "FIGCAPTION";
  TAG_ID2[TAG_ID2["FIGURE"] = 34] = "FIGURE";
  TAG_ID2[TAG_ID2["FONT"] = 35] = "FONT";
  TAG_ID2[TAG_ID2["FOOTER"] = 36] = "FOOTER";
  TAG_ID2[TAG_ID2["FOREIGN_OBJECT"] = 37] = "FOREIGN_OBJECT";
  TAG_ID2[TAG_ID2["FORM"] = 38] = "FORM";
  TAG_ID2[TAG_ID2["FRAME"] = 39] = "FRAME";
  TAG_ID2[TAG_ID2["FRAMESET"] = 40] = "FRAMESET";
  TAG_ID2[TAG_ID2["H1"] = 41] = "H1";
  TAG_ID2[TAG_ID2["H2"] = 42] = "H2";
  TAG_ID2[TAG_ID2["H3"] = 43] = "H3";
  TAG_ID2[TAG_ID2["H4"] = 44] = "H4";
  TAG_ID2[TAG_ID2["H5"] = 45] = "H5";
  TAG_ID2[TAG_ID2["H6"] = 46] = "H6";
  TAG_ID2[TAG_ID2["HEAD"] = 47] = "HEAD";
  TAG_ID2[TAG_ID2["HEADER"] = 48] = "HEADER";
  TAG_ID2[TAG_ID2["HGROUP"] = 49] = "HGROUP";
  TAG_ID2[TAG_ID2["HR"] = 50] = "HR";
  TAG_ID2[TAG_ID2["HTML"] = 51] = "HTML";
  TAG_ID2[TAG_ID2["I"] = 52] = "I";
  TAG_ID2[TAG_ID2["IMG"] = 53] = "IMG";
  TAG_ID2[TAG_ID2["IMAGE"] = 54] = "IMAGE";
  TAG_ID2[TAG_ID2["INPUT"] = 55] = "INPUT";
  TAG_ID2[TAG_ID2["IFRAME"] = 56] = "IFRAME";
  TAG_ID2[TAG_ID2["KEYGEN"] = 57] = "KEYGEN";
  TAG_ID2[TAG_ID2["LABEL"] = 58] = "LABEL";
  TAG_ID2[TAG_ID2["LI"] = 59] = "LI";
  TAG_ID2[TAG_ID2["LINK"] = 60] = "LINK";
  TAG_ID2[TAG_ID2["LISTING"] = 61] = "LISTING";
  TAG_ID2[TAG_ID2["MAIN"] = 62] = "MAIN";
  TAG_ID2[TAG_ID2["MALIGNMARK"] = 63] = "MALIGNMARK";
  TAG_ID2[TAG_ID2["MARQUEE"] = 64] = "MARQUEE";
  TAG_ID2[TAG_ID2["MATH"] = 65] = "MATH";
  TAG_ID2[TAG_ID2["MENU"] = 66] = "MENU";
  TAG_ID2[TAG_ID2["META"] = 67] = "META";
  TAG_ID2[TAG_ID2["MGLYPH"] = 68] = "MGLYPH";
  TAG_ID2[TAG_ID2["MI"] = 69] = "MI";
  TAG_ID2[TAG_ID2["MO"] = 70] = "MO";
  TAG_ID2[TAG_ID2["MN"] = 71] = "MN";
  TAG_ID2[TAG_ID2["MS"] = 72] = "MS";
  TAG_ID2[TAG_ID2["MTEXT"] = 73] = "MTEXT";
  TAG_ID2[TAG_ID2["NAV"] = 74] = "NAV";
  TAG_ID2[TAG_ID2["NOBR"] = 75] = "NOBR";
  TAG_ID2[TAG_ID2["NOFRAMES"] = 76] = "NOFRAMES";
  TAG_ID2[TAG_ID2["NOEMBED"] = 77] = "NOEMBED";
  TAG_ID2[TAG_ID2["NOSCRIPT"] = 78] = "NOSCRIPT";
  TAG_ID2[TAG_ID2["OBJECT"] = 79] = "OBJECT";
  TAG_ID2[TAG_ID2["OL"] = 80] = "OL";
  TAG_ID2[TAG_ID2["OPTGROUP"] = 81] = "OPTGROUP";
  TAG_ID2[TAG_ID2["OPTION"] = 82] = "OPTION";
  TAG_ID2[TAG_ID2["P"] = 83] = "P";
  TAG_ID2[TAG_ID2["PARAM"] = 84] = "PARAM";
  TAG_ID2[TAG_ID2["PLAINTEXT"] = 85] = "PLAINTEXT";
  TAG_ID2[TAG_ID2["PRE"] = 86] = "PRE";
  TAG_ID2[TAG_ID2["RB"] = 87] = "RB";
  TAG_ID2[TAG_ID2["RP"] = 88] = "RP";
  TAG_ID2[TAG_ID2["RT"] = 89] = "RT";
  TAG_ID2[TAG_ID2["RTC"] = 90] = "RTC";
  TAG_ID2[TAG_ID2["RUBY"] = 91] = "RUBY";
  TAG_ID2[TAG_ID2["S"] = 92] = "S";
  TAG_ID2[TAG_ID2["SCRIPT"] = 93] = "SCRIPT";
  TAG_ID2[TAG_ID2["SEARCH"] = 94] = "SEARCH";
  TAG_ID2[TAG_ID2["SECTION"] = 95] = "SECTION";
  TAG_ID2[TAG_ID2["SELECT"] = 96] = "SELECT";
  TAG_ID2[TAG_ID2["SOURCE"] = 97] = "SOURCE";
  TAG_ID2[TAG_ID2["SMALL"] = 98] = "SMALL";
  TAG_ID2[TAG_ID2["SPAN"] = 99] = "SPAN";
  TAG_ID2[TAG_ID2["STRIKE"] = 100] = "STRIKE";
  TAG_ID2[TAG_ID2["STRONG"] = 101] = "STRONG";
  TAG_ID2[TAG_ID2["STYLE"] = 102] = "STYLE";
  TAG_ID2[TAG_ID2["SUB"] = 103] = "SUB";
  TAG_ID2[TAG_ID2["SUMMARY"] = 104] = "SUMMARY";
  TAG_ID2[TAG_ID2["SUP"] = 105] = "SUP";
  TAG_ID2[TAG_ID2["TABLE"] = 106] = "TABLE";
  TAG_ID2[TAG_ID2["TBODY"] = 107] = "TBODY";
  TAG_ID2[TAG_ID2["TEMPLATE"] = 108] = "TEMPLATE";
  TAG_ID2[TAG_ID2["TEXTAREA"] = 109] = "TEXTAREA";
  TAG_ID2[TAG_ID2["TFOOT"] = 110] = "TFOOT";
  TAG_ID2[TAG_ID2["TD"] = 111] = "TD";
  TAG_ID2[TAG_ID2["TH"] = 112] = "TH";
  TAG_ID2[TAG_ID2["THEAD"] = 113] = "THEAD";
  TAG_ID2[TAG_ID2["TITLE"] = 114] = "TITLE";
  TAG_ID2[TAG_ID2["TR"] = 115] = "TR";
  TAG_ID2[TAG_ID2["TRACK"] = 116] = "TRACK";
  TAG_ID2[TAG_ID2["TT"] = 117] = "TT";
  TAG_ID2[TAG_ID2["U"] = 118] = "U";
  TAG_ID2[TAG_ID2["UL"] = 119] = "UL";
  TAG_ID2[TAG_ID2["SVG"] = 120] = "SVG";
  TAG_ID2[TAG_ID2["VAR"] = 121] = "VAR";
  TAG_ID2[TAG_ID2["WBR"] = 122] = "WBR";
  TAG_ID2[TAG_ID2["XMP"] = 123] = "XMP";
})(TAG_ID || (TAG_ID = {}));
var TAG_NAME_TO_ID = /* @__PURE__ */ new Map([
  [TAG_NAMES.A, TAG_ID.A],
  [TAG_NAMES.ADDRESS, TAG_ID.ADDRESS],
  [TAG_NAMES.ANNOTATION_XML, TAG_ID.ANNOTATION_XML],
  [TAG_NAMES.APPLET, TAG_ID.APPLET],
  [TAG_NAMES.AREA, TAG_ID.AREA],
  [TAG_NAMES.ARTICLE, TAG_ID.ARTICLE],
  [TAG_NAMES.ASIDE, TAG_ID.ASIDE],
  [TAG_NAMES.B, TAG_ID.B],
  [TAG_NAMES.BASE, TAG_ID.BASE],
  [TAG_NAMES.BASEFONT, TAG_ID.BASEFONT],
  [TAG_NAMES.BGSOUND, TAG_ID.BGSOUND],
  [TAG_NAMES.BIG, TAG_ID.BIG],
  [TAG_NAMES.BLOCKQUOTE, TAG_ID.BLOCKQUOTE],
  [TAG_NAMES.BODY, TAG_ID.BODY],
  [TAG_NAMES.BR, TAG_ID.BR],
  [TAG_NAMES.BUTTON, TAG_ID.BUTTON],
  [TAG_NAMES.CAPTION, TAG_ID.CAPTION],
  [TAG_NAMES.CENTER, TAG_ID.CENTER],
  [TAG_NAMES.CODE, TAG_ID.CODE],
  [TAG_NAMES.COL, TAG_ID.COL],
  [TAG_NAMES.COLGROUP, TAG_ID.COLGROUP],
  [TAG_NAMES.DD, TAG_ID.DD],
  [TAG_NAMES.DESC, TAG_ID.DESC],
  [TAG_NAMES.DETAILS, TAG_ID.DETAILS],
  [TAG_NAMES.DIALOG, TAG_ID.DIALOG],
  [TAG_NAMES.DIR, TAG_ID.DIR],
  [TAG_NAMES.DIV, TAG_ID.DIV],
  [TAG_NAMES.DL, TAG_ID.DL],
  [TAG_NAMES.DT, TAG_ID.DT],
  [TAG_NAMES.EM, TAG_ID.EM],
  [TAG_NAMES.EMBED, TAG_ID.EMBED],
  [TAG_NAMES.FIELDSET, TAG_ID.FIELDSET],
  [TAG_NAMES.FIGCAPTION, TAG_ID.FIGCAPTION],
  [TAG_NAMES.FIGURE, TAG_ID.FIGURE],
  [TAG_NAMES.FONT, TAG_ID.FONT],
  [TAG_NAMES.FOOTER, TAG_ID.FOOTER],
  [TAG_NAMES.FOREIGN_OBJECT, TAG_ID.FOREIGN_OBJECT],
  [TAG_NAMES.FORM, TAG_ID.FORM],
  [TAG_NAMES.FRAME, TAG_ID.FRAME],
  [TAG_NAMES.FRAMESET, TAG_ID.FRAMESET],
  [TAG_NAMES.H1, TAG_ID.H1],
  [TAG_NAMES.H2, TAG_ID.H2],
  [TAG_NAMES.H3, TAG_ID.H3],
  [TAG_NAMES.H4, TAG_ID.H4],
  [TAG_NAMES.H5, TAG_ID.H5],
  [TAG_NAMES.H6, TAG_ID.H6],
  [TAG_NAMES.HEAD, TAG_ID.HEAD],
  [TAG_NAMES.HEADER, TAG_ID.HEADER],
  [TAG_NAMES.HGROUP, TAG_ID.HGROUP],
  [TAG_NAMES.HR, TAG_ID.HR],
  [TAG_NAMES.HTML, TAG_ID.HTML],
  [TAG_NAMES.I, TAG_ID.I],
  [TAG_NAMES.IMG, TAG_ID.IMG],
  [TAG_NAMES.IMAGE, TAG_ID.IMAGE],
  [TAG_NAMES.INPUT, TAG_ID.INPUT],
  [TAG_NAMES.IFRAME, TAG_ID.IFRAME],
  [TAG_NAMES.KEYGEN, TAG_ID.KEYGEN],
  [TAG_NAMES.LABEL, TAG_ID.LABEL],
  [TAG_NAMES.LI, TAG_ID.LI],
  [TAG_NAMES.LINK, TAG_ID.LINK],
  [TAG_NAMES.LISTING, TAG_ID.LISTING],
  [TAG_NAMES.MAIN, TAG_ID.MAIN],
  [TAG_NAMES.MALIGNMARK, TAG_ID.MALIGNMARK],
  [TAG_NAMES.MARQUEE, TAG_ID.MARQUEE],
  [TAG_NAMES.MATH, TAG_ID.MATH],
  [TAG_NAMES.MENU, TAG_ID.MENU],
  [TAG_NAMES.META, TAG_ID.META],
  [TAG_NAMES.MGLYPH, TAG_ID.MGLYPH],
  [TAG_NAMES.MI, TAG_ID.MI],
  [TAG_NAMES.MO, TAG_ID.MO],
  [TAG_NAMES.MN, TAG_ID.MN],
  [TAG_NAMES.MS, TAG_ID.MS],
  [TAG_NAMES.MTEXT, TAG_ID.MTEXT],
  [TAG_NAMES.NAV, TAG_ID.NAV],
  [TAG_NAMES.NOBR, TAG_ID.NOBR],
  [TAG_NAMES.NOFRAMES, TAG_ID.NOFRAMES],
  [TAG_NAMES.NOEMBED, TAG_ID.NOEMBED],
  [TAG_NAMES.NOSCRIPT, TAG_ID.NOSCRIPT],
  [TAG_NAMES.OBJECT, TAG_ID.OBJECT],
  [TAG_NAMES.OL, TAG_ID.OL],
  [TAG_NAMES.OPTGROUP, TAG_ID.OPTGROUP],
  [TAG_NAMES.OPTION, TAG_ID.OPTION],
  [TAG_NAMES.P, TAG_ID.P],
  [TAG_NAMES.PARAM, TAG_ID.PARAM],
  [TAG_NAMES.PLAINTEXT, TAG_ID.PLAINTEXT],
  [TAG_NAMES.PRE, TAG_ID.PRE],
  [TAG_NAMES.RB, TAG_ID.RB],
  [TAG_NAMES.RP, TAG_ID.RP],
  [TAG_NAMES.RT, TAG_ID.RT],
  [TAG_NAMES.RTC, TAG_ID.RTC],
  [TAG_NAMES.RUBY, TAG_ID.RUBY],
  [TAG_NAMES.S, TAG_ID.S],
  [TAG_NAMES.SCRIPT, TAG_ID.SCRIPT],
  [TAG_NAMES.SEARCH, TAG_ID.SEARCH],
  [TAG_NAMES.SECTION, TAG_ID.SECTION],
  [TAG_NAMES.SELECT, TAG_ID.SELECT],
  [TAG_NAMES.SOURCE, TAG_ID.SOURCE],
  [TAG_NAMES.SMALL, TAG_ID.SMALL],
  [TAG_NAMES.SPAN, TAG_ID.SPAN],
  [TAG_NAMES.STRIKE, TAG_ID.STRIKE],
  [TAG_NAMES.STRONG, TAG_ID.STRONG],
  [TAG_NAMES.STYLE, TAG_ID.STYLE],
  [TAG_NAMES.SUB, TAG_ID.SUB],
  [TAG_NAMES.SUMMARY, TAG_ID.SUMMARY],
  [TAG_NAMES.SUP, TAG_ID.SUP],
  [TAG_NAMES.TABLE, TAG_ID.TABLE],
  [TAG_NAMES.TBODY, TAG_ID.TBODY],
  [TAG_NAMES.TEMPLATE, TAG_ID.TEMPLATE],
  [TAG_NAMES.TEXTAREA, TAG_ID.TEXTAREA],
  [TAG_NAMES.TFOOT, TAG_ID.TFOOT],
  [TAG_NAMES.TD, TAG_ID.TD],
  [TAG_NAMES.TH, TAG_ID.TH],
  [TAG_NAMES.THEAD, TAG_ID.THEAD],
  [TAG_NAMES.TITLE, TAG_ID.TITLE],
  [TAG_NAMES.TR, TAG_ID.TR],
  [TAG_NAMES.TRACK, TAG_ID.TRACK],
  [TAG_NAMES.TT, TAG_ID.TT],
  [TAG_NAMES.U, TAG_ID.U],
  [TAG_NAMES.UL, TAG_ID.UL],
  [TAG_NAMES.SVG, TAG_ID.SVG],
  [TAG_NAMES.VAR, TAG_ID.VAR],
  [TAG_NAMES.WBR, TAG_ID.WBR],
  [TAG_NAMES.XMP, TAG_ID.XMP]
]);
function getTagID(tagName) {
  var _a;
  return (_a = TAG_NAME_TO_ID.get(tagName)) !== null && _a !== void 0 ? _a : TAG_ID.UNKNOWN;
}
var $ = TAG_ID;
var SPECIAL_ELEMENTS = {
  [NS.HTML]: /* @__PURE__ */ new Set([
    $.ADDRESS,
    $.APPLET,
    $.AREA,
    $.ARTICLE,
    $.ASIDE,
    $.BASE,
    $.BASEFONT,
    $.BGSOUND,
    $.BLOCKQUOTE,
    $.BODY,
    $.BR,
    $.BUTTON,
    $.CAPTION,
    $.CENTER,
    $.COL,
    $.COLGROUP,
    $.DD,
    $.DETAILS,
    $.DIR,
    $.DIV,
    $.DL,
    $.DT,
    $.EMBED,
    $.FIELDSET,
    $.FIGCAPTION,
    $.FIGURE,
    $.FOOTER,
    $.FORM,
    $.FRAME,
    $.FRAMESET,
    $.H1,
    $.H2,
    $.H3,
    $.H4,
    $.H5,
    $.H6,
    $.HEAD,
    $.HEADER,
    $.HGROUP,
    $.HR,
    $.HTML,
    $.IFRAME,
    $.IMG,
    $.INPUT,
    $.LI,
    $.LINK,
    $.LISTING,
    $.MAIN,
    $.MARQUEE,
    $.MENU,
    $.META,
    $.NAV,
    $.NOEMBED,
    $.NOFRAMES,
    $.NOSCRIPT,
    $.OBJECT,
    $.OL,
    $.P,
    $.PARAM,
    $.PLAINTEXT,
    $.PRE,
    $.SCRIPT,
    $.SECTION,
    $.SELECT,
    $.SOURCE,
    $.STYLE,
    $.SUMMARY,
    $.TABLE,
    $.TBODY,
    $.TD,
    $.TEMPLATE,
    $.TEXTAREA,
    $.TFOOT,
    $.TH,
    $.THEAD,
    $.TITLE,
    $.TR,
    $.TRACK,
    $.UL,
    $.WBR,
    $.XMP
  ]),
  [NS.MATHML]: /* @__PURE__ */ new Set([$.MI, $.MO, $.MN, $.MS, $.MTEXT, $.ANNOTATION_XML]),
  [NS.SVG]: /* @__PURE__ */ new Set([$.TITLE, $.FOREIGN_OBJECT, $.DESC]),
  [NS.XLINK]: /* @__PURE__ */ new Set(),
  [NS.XML]: /* @__PURE__ */ new Set(),
  [NS.XMLNS]: /* @__PURE__ */ new Set()
};
var NUMBERED_HEADERS = /* @__PURE__ */ new Set([$.H1, $.H2, $.H3, $.H4, $.H5, $.H6]);
var UNESCAPED_TEXT = /* @__PURE__ */ new Set([
  TAG_NAMES.STYLE,
  TAG_NAMES.SCRIPT,
  TAG_NAMES.XMP,
  TAG_NAMES.IFRAME,
  TAG_NAMES.NOEMBED,
  TAG_NAMES.NOFRAMES,
  TAG_NAMES.PLAINTEXT
]);
function hasUnescapedText(tn, scriptingEnabled) {
  return UNESCAPED_TEXT.has(tn) || scriptingEnabled && tn === TAG_NAMES.NOSCRIPT;
}

// node_modules/parse5/dist/tokenizer/index.js
var State;
(function(State2) {
  State2[State2["DATA"] = 0] = "DATA";
  State2[State2["RCDATA"] = 1] = "RCDATA";
  State2[State2["RAWTEXT"] = 2] = "RAWTEXT";
  State2[State2["SCRIPT_DATA"] = 3] = "SCRIPT_DATA";
  State2[State2["PLAINTEXT"] = 4] = "PLAINTEXT";
  State2[State2["TAG_OPEN"] = 5] = "TAG_OPEN";
  State2[State2["END_TAG_OPEN"] = 6] = "END_TAG_OPEN";
  State2[State2["TAG_NAME"] = 7] = "TAG_NAME";
  State2[State2["RCDATA_LESS_THAN_SIGN"] = 8] = "RCDATA_LESS_THAN_SIGN";
  State2[State2["RCDATA_END_TAG_OPEN"] = 9] = "RCDATA_END_TAG_OPEN";
  State2[State2["RCDATA_END_TAG_NAME"] = 10] = "RCDATA_END_TAG_NAME";
  State2[State2["RAWTEXT_LESS_THAN_SIGN"] = 11] = "RAWTEXT_LESS_THAN_SIGN";
  State2[State2["RAWTEXT_END_TAG_OPEN"] = 12] = "RAWTEXT_END_TAG_OPEN";
  State2[State2["RAWTEXT_END_TAG_NAME"] = 13] = "RAWTEXT_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_LESS_THAN_SIGN"] = 14] = "SCRIPT_DATA_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_END_TAG_OPEN"] = 15] = "SCRIPT_DATA_END_TAG_OPEN";
  State2[State2["SCRIPT_DATA_END_TAG_NAME"] = 16] = "SCRIPT_DATA_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_ESCAPE_START"] = 17] = "SCRIPT_DATA_ESCAPE_START";
  State2[State2["SCRIPT_DATA_ESCAPE_START_DASH"] = 18] = "SCRIPT_DATA_ESCAPE_START_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED"] = 19] = "SCRIPT_DATA_ESCAPED";
  State2[State2["SCRIPT_DATA_ESCAPED_DASH"] = 20] = "SCRIPT_DATA_ESCAPED_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED_DASH_DASH"] = 21] = "SCRIPT_DATA_ESCAPED_DASH_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN"] = 22] = "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_OPEN"] = 23] = "SCRIPT_DATA_ESCAPED_END_TAG_OPEN";
  State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_NAME"] = 24] = "SCRIPT_DATA_ESCAPED_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_START"] = 25] = "SCRIPT_DATA_DOUBLE_ESCAPE_START";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED"] = 26] = "SCRIPT_DATA_DOUBLE_ESCAPED";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH"] = 27] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH"] = 28] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN"] = 29] = "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_END"] = 30] = "SCRIPT_DATA_DOUBLE_ESCAPE_END";
  State2[State2["BEFORE_ATTRIBUTE_NAME"] = 31] = "BEFORE_ATTRIBUTE_NAME";
  State2[State2["ATTRIBUTE_NAME"] = 32] = "ATTRIBUTE_NAME";
  State2[State2["AFTER_ATTRIBUTE_NAME"] = 33] = "AFTER_ATTRIBUTE_NAME";
  State2[State2["BEFORE_ATTRIBUTE_VALUE"] = 34] = "BEFORE_ATTRIBUTE_VALUE";
  State2[State2["ATTRIBUTE_VALUE_DOUBLE_QUOTED"] = 35] = "ATTRIBUTE_VALUE_DOUBLE_QUOTED";
  State2[State2["ATTRIBUTE_VALUE_SINGLE_QUOTED"] = 36] = "ATTRIBUTE_VALUE_SINGLE_QUOTED";
  State2[State2["ATTRIBUTE_VALUE_UNQUOTED"] = 37] = "ATTRIBUTE_VALUE_UNQUOTED";
  State2[State2["AFTER_ATTRIBUTE_VALUE_QUOTED"] = 38] = "AFTER_ATTRIBUTE_VALUE_QUOTED";
  State2[State2["SELF_CLOSING_START_TAG"] = 39] = "SELF_CLOSING_START_TAG";
  State2[State2["BOGUS_COMMENT"] = 40] = "BOGUS_COMMENT";
  State2[State2["MARKUP_DECLARATION_OPEN"] = 41] = "MARKUP_DECLARATION_OPEN";
  State2[State2["COMMENT_START"] = 42] = "COMMENT_START";
  State2[State2["COMMENT_START_DASH"] = 43] = "COMMENT_START_DASH";
  State2[State2["COMMENT"] = 44] = "COMMENT";
  State2[State2["COMMENT_LESS_THAN_SIGN"] = 45] = "COMMENT_LESS_THAN_SIGN";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG"] = 46] = "COMMENT_LESS_THAN_SIGN_BANG";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH"] = 47] = "COMMENT_LESS_THAN_SIGN_BANG_DASH";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH"] = 48] = "COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH";
  State2[State2["COMMENT_END_DASH"] = 49] = "COMMENT_END_DASH";
  State2[State2["COMMENT_END"] = 50] = "COMMENT_END";
  State2[State2["COMMENT_END_BANG"] = 51] = "COMMENT_END_BANG";
  State2[State2["DOCTYPE"] = 52] = "DOCTYPE";
  State2[State2["BEFORE_DOCTYPE_NAME"] = 53] = "BEFORE_DOCTYPE_NAME";
  State2[State2["DOCTYPE_NAME"] = 54] = "DOCTYPE_NAME";
  State2[State2["AFTER_DOCTYPE_NAME"] = 55] = "AFTER_DOCTYPE_NAME";
  State2[State2["AFTER_DOCTYPE_PUBLIC_KEYWORD"] = 56] = "AFTER_DOCTYPE_PUBLIC_KEYWORD";
  State2[State2["BEFORE_DOCTYPE_PUBLIC_IDENTIFIER"] = 57] = "BEFORE_DOCTYPE_PUBLIC_IDENTIFIER";
  State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED"] = 58] = "DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED";
  State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED"] = 59] = "DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED";
  State2[State2["AFTER_DOCTYPE_PUBLIC_IDENTIFIER"] = 60] = "AFTER_DOCTYPE_PUBLIC_IDENTIFIER";
  State2[State2["BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS"] = 61] = "BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS";
  State2[State2["AFTER_DOCTYPE_SYSTEM_KEYWORD"] = 62] = "AFTER_DOCTYPE_SYSTEM_KEYWORD";
  State2[State2["BEFORE_DOCTYPE_SYSTEM_IDENTIFIER"] = 63] = "BEFORE_DOCTYPE_SYSTEM_IDENTIFIER";
  State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED"] = 64] = "DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED";
  State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED"] = 65] = "DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED";
  State2[State2["AFTER_DOCTYPE_SYSTEM_IDENTIFIER"] = 66] = "AFTER_DOCTYPE_SYSTEM_IDENTIFIER";
  State2[State2["BOGUS_DOCTYPE"] = 67] = "BOGUS_DOCTYPE";
  State2[State2["CDATA_SECTION"] = 68] = "CDATA_SECTION";
  State2[State2["CDATA_SECTION_BRACKET"] = 69] = "CDATA_SECTION_BRACKET";
  State2[State2["CDATA_SECTION_END"] = 70] = "CDATA_SECTION_END";
  State2[State2["CHARACTER_REFERENCE"] = 71] = "CHARACTER_REFERENCE";
  State2[State2["AMBIGUOUS_AMPERSAND"] = 72] = "AMBIGUOUS_AMPERSAND";
})(State || (State = {}));
var TokenizerMode = {
  DATA: State.DATA,
  RCDATA: State.RCDATA,
  RAWTEXT: State.RAWTEXT,
  SCRIPT_DATA: State.SCRIPT_DATA,
  PLAINTEXT: State.PLAINTEXT,
  CDATA_SECTION: State.CDATA_SECTION
};
function isAsciiDigit(cp) {
  return cp >= CODE_POINTS.DIGIT_0 && cp <= CODE_POINTS.DIGIT_9;
}
function isAsciiUpper(cp) {
  return cp >= CODE_POINTS.LATIN_CAPITAL_A && cp <= CODE_POINTS.LATIN_CAPITAL_Z;
}
function isAsciiLower(cp) {
  return cp >= CODE_POINTS.LATIN_SMALL_A && cp <= CODE_POINTS.LATIN_SMALL_Z;
}
function isAsciiLetter(cp) {
  return isAsciiLower(cp) || isAsciiUpper(cp);
}
function isAsciiAlphaNumeric(cp) {
  return isAsciiLetter(cp) || isAsciiDigit(cp);
}
function toAsciiLower(cp) {
  return cp + 32;
}
function isWhitespace(cp) {
  return cp === CODE_POINTS.SPACE || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.TABULATION || cp === CODE_POINTS.FORM_FEED;
}
function isScriptDataDoubleEscapeSequenceEnd(cp) {
  return isWhitespace(cp) || cp === CODE_POINTS.SOLIDUS || cp === CODE_POINTS.GREATER_THAN_SIGN;
}
function getErrorForNumericCharacterReference(code) {
  if (code === CODE_POINTS.NULL) {
    return ERR.nullCharacterReference;
  } else if (code > 1114111) {
    return ERR.characterReferenceOutsideUnicodeRange;
  } else if (isSurrogate(code)) {
    return ERR.surrogateCharacterReference;
  } else if (isUndefinedCodePoint(code)) {
    return ERR.noncharacterCharacterReference;
  } else if (isControlCodePoint(code) || code === CODE_POINTS.CARRIAGE_RETURN) {
    return ERR.controlCharacterReference;
  }
  return null;
}
var Tokenizer = class {
  constructor(options, handler2) {
    this.options = options;
    this.handler = handler2;
    this.paused = false;
    this.inLoop = false;
    this.inForeignNode = false;
    this.lastStartTagName = "";
    this.active = false;
    this.state = State.DATA;
    this.returnState = State.DATA;
    this.entityStartPos = 0;
    this.consumedAfterSnapshot = -1;
    this.currentCharacterToken = null;
    this.currentToken = null;
    this.currentAttr = { name: "", value: "" };
    this.preprocessor = new Preprocessor(handler2);
    this.currentLocation = this.getCurrentLocation(-1);
    this.entityDecoder = new EntityDecoder(htmlDecodeTree, (cp, consumed) => {
      this.preprocessor.pos = this.entityStartPos + consumed - 1;
      this._flushCodePointConsumedAsCharacterReference(cp);
    }, handler2.onParseError ? {
      missingSemicolonAfterCharacterReference: () => {
        this._err(ERR.missingSemicolonAfterCharacterReference, 1);
      },
      absenceOfDigitsInNumericCharacterReference: (consumed) => {
        this._err(ERR.absenceOfDigitsInNumericCharacterReference, this.entityStartPos - this.preprocessor.pos + consumed);
      },
      validateNumericCharacterReference: (code) => {
        const error = getErrorForNumericCharacterReference(code);
        if (error)
          this._err(error, 1);
      }
    } : void 0);
  }
  //Errors
  _err(code, cpOffset = 0) {
    var _a, _b;
    (_b = (_a = this.handler).onParseError) === null || _b === void 0 ? void 0 : _b.call(_a, this.preprocessor.getError(code, cpOffset));
  }
  // NOTE: `offset` may never run across line boundaries.
  getCurrentLocation(offset) {
    if (!this.options.sourceCodeLocationInfo) {
      return null;
    }
    return {
      startLine: this.preprocessor.line,
      startCol: this.preprocessor.col - offset,
      startOffset: this.preprocessor.offset - offset,
      endLine: -1,
      endCol: -1,
      endOffset: -1
    };
  }
  _runParsingLoop() {
    if (this.inLoop)
      return;
    this.inLoop = true;
    while (this.active && !this.paused) {
      this.consumedAfterSnapshot = 0;
      const cp = this._consume();
      if (!this._ensureHibernation()) {
        this._callState(cp);
      }
    }
    this.inLoop = false;
  }
  //API
  pause() {
    this.paused = true;
  }
  resume(writeCallback) {
    if (!this.paused) {
      throw new Error("Parser was already resumed");
    }
    this.paused = false;
    if (this.inLoop)
      return;
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
    }
  }
  write(chunk, isLastChunk, writeCallback) {
    this.active = true;
    this.preprocessor.write(chunk, isLastChunk);
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
    }
  }
  insertHtmlAtCurrentPos(chunk) {
    this.active = true;
    this.preprocessor.insertHtmlAtCurrentPos(chunk);
    this._runParsingLoop();
  }
  //Hibernation
  _ensureHibernation() {
    if (this.preprocessor.endOfChunkHit) {
      this.preprocessor.retreat(this.consumedAfterSnapshot);
      this.consumedAfterSnapshot = 0;
      this.active = false;
      return true;
    }
    return false;
  }
  //Consumption
  _consume() {
    this.consumedAfterSnapshot++;
    return this.preprocessor.advance();
  }
  _advanceBy(count) {
    this.consumedAfterSnapshot += count;
    for (let i = 0; i < count; i++) {
      this.preprocessor.advance();
    }
  }
  _consumeSequenceIfMatch(pattern, caseSensitive) {
    if (this.preprocessor.startsWith(pattern, caseSensitive)) {
      this._advanceBy(pattern.length - 1);
      return true;
    }
    return false;
  }
  //Token creation
  _createStartTagToken() {
    this.currentToken = {
      type: TokenType.START_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(1)
    };
  }
  _createEndTagToken() {
    this.currentToken = {
      type: TokenType.END_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(2)
    };
  }
  _createCommentToken(offset) {
    this.currentToken = {
      type: TokenType.COMMENT,
      data: "",
      location: this.getCurrentLocation(offset)
    };
  }
  _createDoctypeToken(initialName) {
    this.currentToken = {
      type: TokenType.DOCTYPE,
      name: initialName,
      forceQuirks: false,
      publicId: null,
      systemId: null,
      location: this.currentLocation
    };
  }
  _createCharacterToken(type, chars) {
    this.currentCharacterToken = {
      type,
      chars,
      location: this.currentLocation
    };
  }
  //Tag attributes
  _createAttr(attrNameFirstCh) {
    this.currentAttr = {
      name: attrNameFirstCh,
      value: ""
    };
    this.currentLocation = this.getCurrentLocation(0);
  }
  _leaveAttrName() {
    var _a;
    var _b;
    const token = this.currentToken;
    if (getTokenAttr(token, this.currentAttr.name) === null) {
      token.attrs.push(this.currentAttr);
      if (token.location && this.currentLocation) {
        const attrLocations = (_a = (_b = token.location).attrs) !== null && _a !== void 0 ? _a : _b.attrs = /* @__PURE__ */ Object.create(null);
        attrLocations[this.currentAttr.name] = this.currentLocation;
        this._leaveAttrValue();
      }
    } else {
      this._err(ERR.duplicateAttribute);
    }
  }
  _leaveAttrValue() {
    if (this.currentLocation) {
      this.currentLocation.endLine = this.preprocessor.line;
      this.currentLocation.endCol = this.preprocessor.col;
      this.currentLocation.endOffset = this.preprocessor.offset;
    }
  }
  //Token emission
  prepareToken(ct) {
    this._emitCurrentCharacterToken(ct.location);
    this.currentToken = null;
    if (ct.location) {
      ct.location.endLine = this.preprocessor.line;
      ct.location.endCol = this.preprocessor.col + 1;
      ct.location.endOffset = this.preprocessor.offset + 1;
    }
    this.currentLocation = this.getCurrentLocation(-1);
  }
  emitCurrentTagToken() {
    const ct = this.currentToken;
    this.prepareToken(ct);
    ct.tagID = getTagID(ct.tagName);
    if (ct.type === TokenType.START_TAG) {
      this.lastStartTagName = ct.tagName;
      this.handler.onStartTag(ct);
    } else {
      if (ct.attrs.length > 0) {
        this._err(ERR.endTagWithAttributes);
      }
      if (ct.selfClosing) {
        this._err(ERR.endTagWithTrailingSolidus);
      }
      this.handler.onEndTag(ct);
    }
    this.preprocessor.dropParsedChunk();
  }
  emitCurrentComment(ct) {
    this.prepareToken(ct);
    this.handler.onComment(ct);
    this.preprocessor.dropParsedChunk();
  }
  emitCurrentDoctype(ct) {
    this.prepareToken(ct);
    this.handler.onDoctype(ct);
    this.preprocessor.dropParsedChunk();
  }
  _emitCurrentCharacterToken(nextLocation) {
    if (this.currentCharacterToken) {
      if (nextLocation && this.currentCharacterToken.location) {
        this.currentCharacterToken.location.endLine = nextLocation.startLine;
        this.currentCharacterToken.location.endCol = nextLocation.startCol;
        this.currentCharacterToken.location.endOffset = nextLocation.startOffset;
      }
      switch (this.currentCharacterToken.type) {
        case TokenType.CHARACTER: {
          this.handler.onCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.NULL_CHARACTER: {
          this.handler.onNullCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          this.handler.onWhitespaceCharacter(this.currentCharacterToken);
          break;
        }
      }
      this.currentCharacterToken = null;
    }
  }
  _emitEOFToken() {
    const location = this.getCurrentLocation(0);
    if (location) {
      location.endLine = location.startLine;
      location.endCol = location.startCol;
      location.endOffset = location.startOffset;
    }
    this._emitCurrentCharacterToken(location);
    this.handler.onEof({ type: TokenType.EOF, location });
    this.active = false;
  }
  //Characters emission
  //OPTIMIZATION: The specification uses only one type of character token (one token per character).
  //This causes a huge memory overhead and a lot of unnecessary parser loops. parse5 uses 3 groups of characters.
  //If we have a sequence of characters that belong to the same group, the parser can process it
  //as a single solid character token.
  //So, there are 3 types of character tokens in parse5:
  //1)TokenType.NULL_CHARACTER - \u0000-character sequences (e.g. '\u0000\u0000\u0000')
  //2)TokenType.WHITESPACE_CHARACTER - any whitespace/new-line character sequences (e.g. '\n  \r\t   \f')
  //3)TokenType.CHARACTER - any character sequence which don't belong to groups 1 and 2 (e.g. 'abcdef1234@@#$%^')
  _appendCharToCurrentCharacterToken(type, ch) {
    if (this.currentCharacterToken) {
      if (this.currentCharacterToken.type === type) {
        this.currentCharacterToken.chars += ch;
        return;
      } else {
        this.currentLocation = this.getCurrentLocation(0);
        this._emitCurrentCharacterToken(this.currentLocation);
        this.preprocessor.dropParsedChunk();
      }
    }
    this._createCharacterToken(type, ch);
  }
  _emitCodePoint(cp) {
    const type = isWhitespace(cp) ? TokenType.WHITESPACE_CHARACTER : cp === CODE_POINTS.NULL ? TokenType.NULL_CHARACTER : TokenType.CHARACTER;
    this._appendCharToCurrentCharacterToken(type, cp < 65536 ? String.fromCharCode(cp) : String.fromCodePoint(cp));
  }
  //NOTE: used when we emit characters explicitly.
  //This is always for non-whitespace and non-null characters, which allows us to avoid additional checks.
  _emitChars(ch) {
    this._appendCharToCurrentCharacterToken(TokenType.CHARACTER, ch);
  }
  // Character reference helpers
  _startCharacterReference() {
    this.returnState = this.state;
    this.state = State.CHARACTER_REFERENCE;
    this.entityStartPos = this.preprocessor.pos;
    this.entityDecoder.startEntity(this._isCharacterReferenceInAttribute() ? DecodingMode.Attribute : DecodingMode.Legacy);
  }
  _isCharacterReferenceInAttribute() {
    return this.returnState === State.ATTRIBUTE_VALUE_DOUBLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_SINGLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_UNQUOTED;
  }
  _flushCodePointConsumedAsCharacterReference(cp) {
    if (this._isCharacterReferenceInAttribute()) {
      this.currentAttr.value += String.fromCodePoint(cp);
    } else {
      this._emitCodePoint(cp);
    }
  }
  // Calling states this way turns out to be much faster than any other approach.
  _callState(cp) {
    switch (this.state) {
      case State.DATA: {
        this._stateData(cp);
        break;
      }
      case State.RCDATA: {
        this._stateRcdata(cp);
        break;
      }
      case State.RAWTEXT: {
        this._stateRawtext(cp);
        break;
      }
      case State.SCRIPT_DATA: {
        this._stateScriptData(cp);
        break;
      }
      case State.PLAINTEXT: {
        this._statePlaintext(cp);
        break;
      }
      case State.TAG_OPEN: {
        this._stateTagOpen(cp);
        break;
      }
      case State.END_TAG_OPEN: {
        this._stateEndTagOpen(cp);
        break;
      }
      case State.TAG_NAME: {
        this._stateTagName(cp);
        break;
      }
      case State.RCDATA_LESS_THAN_SIGN: {
        this._stateRcdataLessThanSign(cp);
        break;
      }
      case State.RCDATA_END_TAG_OPEN: {
        this._stateRcdataEndTagOpen(cp);
        break;
      }
      case State.RCDATA_END_TAG_NAME: {
        this._stateRcdataEndTagName(cp);
        break;
      }
      case State.RAWTEXT_LESS_THAN_SIGN: {
        this._stateRawtextLessThanSign(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_OPEN: {
        this._stateRawtextEndTagOpen(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_NAME: {
        this._stateRawtextEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_LESS_THAN_SIGN: {
        this._stateScriptDataLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_OPEN: {
        this._stateScriptDataEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_NAME: {
        this._stateScriptDataEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START: {
        this._stateScriptDataEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START_DASH: {
        this._stateScriptDataEscapeStartDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED: {
        this._stateScriptDataEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH: {
        this._stateScriptDataEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH_DASH: {
        this._stateScriptDataEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN: {
        this._stateScriptDataEscapedEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_NAME: {
        this._stateScriptDataEscapedEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_START: {
        this._stateScriptDataDoubleEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED: {
        this._stateScriptDataDoubleEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH: {
        this._stateScriptDataDoubleEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: {
        this._stateScriptDataDoubleEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataDoubleEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_END: {
        this._stateScriptDataDoubleEscapeEnd(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_NAME: {
        this._stateBeforeAttributeName(cp);
        break;
      }
      case State.ATTRIBUTE_NAME: {
        this._stateAttributeName(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_NAME: {
        this._stateAfterAttributeName(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_VALUE: {
        this._stateBeforeAttributeValue(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_DOUBLE_QUOTED: {
        this._stateAttributeValueDoubleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_SINGLE_QUOTED: {
        this._stateAttributeValueSingleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_UNQUOTED: {
        this._stateAttributeValueUnquoted(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_VALUE_QUOTED: {
        this._stateAfterAttributeValueQuoted(cp);
        break;
      }
      case State.SELF_CLOSING_START_TAG: {
        this._stateSelfClosingStartTag(cp);
        break;
      }
      case State.BOGUS_COMMENT: {
        this._stateBogusComment(cp);
        break;
      }
      case State.MARKUP_DECLARATION_OPEN: {
        this._stateMarkupDeclarationOpen(cp);
        break;
      }
      case State.COMMENT_START: {
        this._stateCommentStart(cp);
        break;
      }
      case State.COMMENT_START_DASH: {
        this._stateCommentStartDash(cp);
        break;
      }
      case State.COMMENT: {
        this._stateComment(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN: {
        this._stateCommentLessThanSign(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG: {
        this._stateCommentLessThanSignBang(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH: {
        this._stateCommentLessThanSignBangDash(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH: {
        this._stateCommentLessThanSignBangDashDash(cp);
        break;
      }
      case State.COMMENT_END_DASH: {
        this._stateCommentEndDash(cp);
        break;
      }
      case State.COMMENT_END: {
        this._stateCommentEnd(cp);
        break;
      }
      case State.COMMENT_END_BANG: {
        this._stateCommentEndBang(cp);
        break;
      }
      case State.DOCTYPE: {
        this._stateDoctype(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_NAME: {
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case State.DOCTYPE_NAME: {
        this._stateDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_NAME: {
        this._stateAfterDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_KEYWORD: {
        this._stateAfterDoctypePublicKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateBeforeDoctypePublicIdentifier(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypePublicIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypePublicIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateAfterDoctypePublicIdentifier(cp);
        break;
      }
      case State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS: {
        this._stateBetweenDoctypePublicAndSystemIdentifiers(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_KEYWORD: {
        this._stateAfterDoctypeSystemKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateBeforeDoctypeSystemIdentifier(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypeSystemIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypeSystemIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateAfterDoctypeSystemIdentifier(cp);
        break;
      }
      case State.BOGUS_DOCTYPE: {
        this._stateBogusDoctype(cp);
        break;
      }
      case State.CDATA_SECTION: {
        this._stateCdataSection(cp);
        break;
      }
      case State.CDATA_SECTION_BRACKET: {
        this._stateCdataSectionBracket(cp);
        break;
      }
      case State.CDATA_SECTION_END: {
        this._stateCdataSectionEnd(cp);
        break;
      }
      case State.CHARACTER_REFERENCE: {
        this._stateCharacterReference();
        break;
      }
      case State.AMBIGUOUS_AMPERSAND: {
        this._stateAmbiguousAmpersand(cp);
        break;
      }
      default: {
        throw new Error("Unknown state");
      }
    }
  }
  // State machine
  // Data state
  //------------------------------------------------------------------
  _stateData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.TAG_OPEN;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  //  RCDATA state
  //------------------------------------------------------------------
  _stateRcdata(cp) {
    switch (cp) {
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RCDATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // RAWTEXT state
  //------------------------------------------------------------------
  _stateRawtext(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RAWTEXT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data state
  //------------------------------------------------------------------
  _stateScriptData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // PLAINTEXT state
  //------------------------------------------------------------------
  _statePlaintext(cp) {
    switch (cp) {
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Tag open state
  //------------------------------------------------------------------
  _stateTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createStartTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case CODE_POINTS.EXCLAMATION_MARK: {
          this.state = State.MARKUP_DECLARATION_OPEN;
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this.state = State.END_TAG_OPEN;
          break;
        }
        case CODE_POINTS.QUESTION_MARK: {
          this._err(ERR.unexpectedQuestionMarkInsteadOfTagName);
          this._createCommentToken(1);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName);
          this._emitChars("<");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.invalidFirstCharacterOfTagName);
          this._emitChars("<");
          this.state = State.DATA;
          this._stateData(cp);
        }
      }
  }
  // End tag open state
  //------------------------------------------------------------------
  _stateEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createEndTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingEndTagName);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName);
          this._emitChars("</");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.invalidFirstCharacterOfTagName);
          this._createCommentToken(2);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
        }
      }
  }
  // Tag name state
  //------------------------------------------------------------------
  _stateTagName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.tagName += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        token.tagName += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // RCDATA less-than sign state
  //------------------------------------------------------------------
  _stateRcdataLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.RCDATA_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  // RCDATA end tag open state
  //------------------------------------------------------------------
  _stateRcdataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RCDATA_END_TAG_NAME;
      this._stateRcdataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  handleSpecialEndTag(_cp) {
    if (!this.preprocessor.startsWith(this.lastStartTagName, false)) {
      return !this._ensureHibernation();
    }
    this._createEndTagToken();
    const token = this.currentToken;
    token.tagName = this.lastStartTagName;
    const cp = this.preprocessor.peek(this.lastStartTagName.length);
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        return false;
      }
      case CODE_POINTS.SOLIDUS: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.SELF_CLOSING_START_TAG;
        return false;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._advanceBy(this.lastStartTagName.length);
        this.emitCurrentTagToken();
        this.state = State.DATA;
        return false;
      }
      default: {
        return !this._ensureHibernation();
      }
    }
  }
  // RCDATA end tag name state
  //------------------------------------------------------------------
  _stateRcdataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  // RAWTEXT less-than sign state
  //------------------------------------------------------------------
  _stateRawtextLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.RAWTEXT_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // RAWTEXT end tag open state
  //------------------------------------------------------------------
  _stateRawtextEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RAWTEXT_END_TAG_NAME;
      this._stateRawtextEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // RAWTEXT end tag name state
  //------------------------------------------------------------------
  _stateRawtextEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // Script data less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataLessThanSign(cp) {
    switch (cp) {
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SCRIPT_DATA_END_TAG_OPEN;
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.SCRIPT_DATA_ESCAPE_START;
        this._emitChars("<!");
        break;
      }
      default: {
        this._emitChars("<");
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
  }
  // Script data end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_END_TAG_NAME;
      this._stateScriptDataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escape start state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStart(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPE_START_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escape start dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStartDash(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escaped state
  //------------------------------------------------------------------
  _stateScriptDataEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataEscapedLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN;
    } else if (isAsciiLetter(cp)) {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_START;
      this._stateScriptDataDoubleEscapeStart(cp);
    } else {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data escaped end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_NAME;
      this._stateScriptDataEscapedEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data escaped end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data double escape start state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeStart(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data double escaped state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_END;
      this._emitChars("/");
    } else {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }
  // Script data double escape end state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeEnd(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }
      this.state = State.SCRIPT_DATA_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }
  // Before attribute name state
  //------------------------------------------------------------------
  _stateBeforeAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._err(ERR.unexpectedEqualsSignBeforeAttributeName);
        this._createAttr("=");
        this.state = State.ATTRIBUTE_NAME;
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }
  // Attribute name state
  //------------------------------------------------------------------
  _stateAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this._leaveAttrName();
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._leaveAttrName();
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN: {
        this._err(ERR.unexpectedCharacterInAttributeName);
        this.currentAttr.name += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.name += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        this.currentAttr.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // After attribute name state
  //------------------------------------------------------------------
  _stateAfterAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }
  // Before attribute value state
  //------------------------------------------------------------------
  _stateBeforeAttributeValue(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.ATTRIBUTE_VALUE_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingAttributeValue);
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      default: {
        this.state = State.ATTRIBUTE_VALUE_UNQUOTED;
        this._stateAttributeValueUnquoted(cp);
      }
    }
  }
  // Attribute value (double-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueDoubleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // Attribute value (single-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueSingleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // Attribute value (unquoted) state
  //------------------------------------------------------------------
  _stateAttributeValueUnquoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN:
      case CODE_POINTS.EQUALS_SIGN:
      case CODE_POINTS.GRAVE_ACCENT: {
        this._err(ERR.unexpectedCharacterInUnquotedAttributeValue);
        this.currentAttr.value += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // After attribute value (quoted) state
  //------------------------------------------------------------------
  _stateAfterAttributeValueQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this._leaveAttrValue();
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingWhitespaceBetweenAttributes);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }
  // Self-closing start tag state
  //------------------------------------------------------------------
  _stateSelfClosingStartTag(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        const token = this.currentToken;
        token.selfClosing = true;
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.unexpectedSolidusInTag);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }
  // Bogus comment state
  //------------------------------------------------------------------
  _stateBogusComment(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }
  // Markup declaration open state
  //------------------------------------------------------------------
  _stateMarkupDeclarationOpen(cp) {
    if (this._consumeSequenceIfMatch(SEQUENCES.DASH_DASH, true)) {
      this._createCommentToken(SEQUENCES.DASH_DASH.length + 1);
      this.state = State.COMMENT_START;
    } else if (this._consumeSequenceIfMatch(SEQUENCES.DOCTYPE, false)) {
      this.currentLocation = this.getCurrentLocation(SEQUENCES.DOCTYPE.length + 1);
      this.state = State.DOCTYPE;
    } else if (this._consumeSequenceIfMatch(SEQUENCES.CDATA_START, true)) {
      if (this.inForeignNode) {
        this.state = State.CDATA_SECTION;
      } else {
        this._err(ERR.cdataInHtmlContent);
        this._createCommentToken(SEQUENCES.CDATA_START.length + 1);
        this.currentToken.data = "[CDATA[";
        this.state = State.BOGUS_COMMENT;
      }
    } else if (!this._ensureHibernation()) {
      this._err(ERR.incorrectlyOpenedComment);
      this._createCommentToken(2);
      this.state = State.BOGUS_COMMENT;
      this._stateBogusComment(cp);
    }
  }
  // Comment start state
  //------------------------------------------------------------------
  _stateCommentStart(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_START_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        const token = this.currentToken;
        this.emitCurrentComment(token);
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment start dash state
  //------------------------------------------------------------------
  _stateCommentStartDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment state
  //------------------------------------------------------------------
  _stateComment(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<";
        this.state = State.COMMENT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }
  // Comment less-than sign state
  //------------------------------------------------------------------
  _stateCommentLessThanSign(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.EXCLAMATION_MARK: {
        token.data += "!";
        this.state = State.COMMENT_LESS_THAN_SIGN_BANG;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<";
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment less-than sign bang state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBang(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH;
    } else {
      this.state = State.COMMENT;
      this._stateComment(cp);
    }
  }
  // Comment less-than sign bang dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDash(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH;
    } else {
      this.state = State.COMMENT_END_DASH;
      this._stateCommentEndDash(cp);
    }
  }
  // Comment less-than sign bang dash dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDashDash(cp) {
    if (cp !== CODE_POINTS.GREATER_THAN_SIGN && cp !== CODE_POINTS.EOF) {
      this._err(ERR.nestedComment);
    }
    this.state = State.COMMENT_END;
    this._stateCommentEnd(cp);
  }
  // Comment end dash state
  //------------------------------------------------------------------
  _stateCommentEndDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment end state
  //------------------------------------------------------------------
  _stateCommentEnd(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.COMMENT_END_BANG;
        break;
      }
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "-";
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment end bang state
  //------------------------------------------------------------------
  _stateCommentEndBang(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "--!";
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.incorrectlyClosedComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--!";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // DOCTYPE state
  //------------------------------------------------------------------
  _stateDoctype(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        this._createDoctypeToken(null);
        const token = this.currentToken;
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingWhitespaceBeforeDoctypeName);
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
      }
    }
  }
  // Before DOCTYPE name state
  //------------------------------------------------------------------
  _stateBeforeDoctypeName(cp) {
    if (isAsciiUpper(cp)) {
      this._createDoctypeToken(String.fromCharCode(toAsciiLower(cp)));
      this.state = State.DOCTYPE_NAME;
    } else
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._createDoctypeToken(REPLACEMENT_CHARACTER);
          this.state = State.DOCTYPE_NAME;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypeName);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._createDoctypeToken(String.fromCodePoint(cp));
          this.state = State.DOCTYPE_NAME;
        }
      }
  }
  // DOCTYPE name state
  //------------------------------------------------------------------
  _stateDoctypeName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.AFTER_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.name += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // After DOCTYPE name state
  //------------------------------------------------------------------
  _stateAfterDoctypeName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        if (this._consumeSequenceIfMatch(SEQUENCES.PUBLIC, false)) {
          this.state = State.AFTER_DOCTYPE_PUBLIC_KEYWORD;
        } else if (this._consumeSequenceIfMatch(SEQUENCES.SYSTEM, false)) {
          this.state = State.AFTER_DOCTYPE_SYSTEM_KEYWORD;
        } else if (!this._ensureHibernation()) {
          this._err(ERR.invalidCharacterSequenceAfterDoctypeName);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
  }
  // After DOCTYPE public keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicKeyword(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Before DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypePublicIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // DOCTYPE public identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }
  // DOCTYPE public identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierSingleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }
  // After DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Between DOCTYPE public and system identifiers state
  //------------------------------------------------------------------
  _stateBetweenDoctypePublicAndSystemIdentifiers(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // After DOCTYPE system keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemKeyword(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Before DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // DOCTYPE system identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }
  // DOCTYPE system identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierSingleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }
  // After DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.unexpectedCharacterAfterDoctypeSystemIdentifier);
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Bogus DOCTYPE state
  //------------------------------------------------------------------
  _stateBogusDoctype(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default:
    }
  }
  // CDATA section state
  //------------------------------------------------------------------
  _stateCdataSection(cp) {
    switch (cp) {
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this.state = State.CDATA_SECTION_BRACKET;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInCdata);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // CDATA section bracket state
  //------------------------------------------------------------------
  _stateCdataSectionBracket(cp) {
    if (cp === CODE_POINTS.RIGHT_SQUARE_BRACKET) {
      this.state = State.CDATA_SECTION_END;
    } else {
      this._emitChars("]");
      this.state = State.CDATA_SECTION;
      this._stateCdataSection(cp);
    }
  }
  // CDATA section end state
  //------------------------------------------------------------------
  _stateCdataSectionEnd(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this._emitChars("]");
        break;
      }
      default: {
        this._emitChars("]]");
        this.state = State.CDATA_SECTION;
        this._stateCdataSection(cp);
      }
    }
  }
  // Character reference state
  //------------------------------------------------------------------
  _stateCharacterReference() {
    let length = this.entityDecoder.write(this.preprocessor.html, this.preprocessor.pos);
    if (length < 0) {
      if (this.preprocessor.lastChunkWritten) {
        length = this.entityDecoder.end();
      } else {
        this.active = false;
        this.preprocessor.pos = this.preprocessor.html.length - 1;
        this.consumedAfterSnapshot = 0;
        this.preprocessor.endOfChunkHit = true;
        return;
      }
    }
    if (length === 0) {
      this.preprocessor.pos = this.entityStartPos;
      this._flushCodePointConsumedAsCharacterReference(CODE_POINTS.AMPERSAND);
      this.state = !this._isCharacterReferenceInAttribute() && isAsciiAlphaNumeric(this.preprocessor.peek(1)) ? State.AMBIGUOUS_AMPERSAND : this.returnState;
    } else {
      this.state = this.returnState;
    }
  }
  // Ambiguos ampersand state
  //------------------------------------------------------------------
  _stateAmbiguousAmpersand(cp) {
    if (isAsciiAlphaNumeric(cp)) {
      this._flushCodePointConsumedAsCharacterReference(cp);
    } else {
      if (cp === CODE_POINTS.SEMICOLON) {
        this._err(ERR.unknownNamedCharacterReference);
      }
      this.state = this.returnState;
      this._callState(cp);
    }
  }
};

// node_modules/parse5/dist/parser/open-element-stack.js
var IMPLICIT_END_TAG_REQUIRED = /* @__PURE__ */ new Set([TAG_ID.DD, TAG_ID.DT, TAG_ID.LI, TAG_ID.OPTGROUP, TAG_ID.OPTION, TAG_ID.P, TAG_ID.RB, TAG_ID.RP, TAG_ID.RT, TAG_ID.RTC]);
var IMPLICIT_END_TAG_REQUIRED_THOROUGHLY = /* @__PURE__ */ new Set([
  ...IMPLICIT_END_TAG_REQUIRED,
  TAG_ID.CAPTION,
  TAG_ID.COLGROUP,
  TAG_ID.TBODY,
  TAG_ID.TD,
  TAG_ID.TFOOT,
  TAG_ID.TH,
  TAG_ID.THEAD,
  TAG_ID.TR
]);
var SCOPING_ELEMENTS_HTML = /* @__PURE__ */ new Set([
  TAG_ID.APPLET,
  TAG_ID.CAPTION,
  TAG_ID.HTML,
  TAG_ID.MARQUEE,
  TAG_ID.OBJECT,
  TAG_ID.TABLE,
  TAG_ID.TD,
  TAG_ID.TEMPLATE,
  TAG_ID.TH
]);
var SCOPING_ELEMENTS_HTML_LIST = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.OL, TAG_ID.UL]);
var SCOPING_ELEMENTS_HTML_BUTTON = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.BUTTON]);
var SCOPING_ELEMENTS_MATHML = /* @__PURE__ */ new Set([TAG_ID.ANNOTATION_XML, TAG_ID.MI, TAG_ID.MN, TAG_ID.MO, TAG_ID.MS, TAG_ID.MTEXT]);
var SCOPING_ELEMENTS_SVG = /* @__PURE__ */ new Set([TAG_ID.DESC, TAG_ID.FOREIGN_OBJECT, TAG_ID.TITLE]);
var TABLE_ROW_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TR, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_BODY_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_CELLS = /* @__PURE__ */ new Set([TAG_ID.TD, TAG_ID.TH]);
var OpenElementStack = class {
  get currentTmplContentOrNode() {
    return this._isInTemplate() ? this.treeAdapter.getTemplateContent(this.current) : this.current;
  }
  constructor(document, treeAdapter, handler2) {
    this.treeAdapter = treeAdapter;
    this.handler = handler2;
    this.items = [];
    this.tagIDs = [];
    this.stackTop = -1;
    this.tmplCount = 0;
    this.currentTagId = TAG_ID.UNKNOWN;
    this.current = document;
  }
  //Index of element
  _indexOf(element) {
    return this.items.lastIndexOf(element, this.stackTop);
  }
  //Update current element
  _isInTemplate() {
    return this.currentTagId === TAG_ID.TEMPLATE && this.treeAdapter.getNamespaceURI(this.current) === NS.HTML;
  }
  _updateCurrentElement() {
    this.current = this.items[this.stackTop];
    this.currentTagId = this.tagIDs[this.stackTop];
  }
  //Mutations
  push(element, tagID) {
    this.stackTop++;
    this.items[this.stackTop] = element;
    this.current = element;
    this.tagIDs[this.stackTop] = tagID;
    this.currentTagId = tagID;
    if (this._isInTemplate()) {
      this.tmplCount++;
    }
    this.handler.onItemPush(element, tagID, true);
  }
  pop() {
    const popped = this.current;
    if (this.tmplCount > 0 && this._isInTemplate()) {
      this.tmplCount--;
    }
    this.stackTop--;
    this._updateCurrentElement();
    this.handler.onItemPop(popped, true);
  }
  replace(oldElement, newElement) {
    const idx = this._indexOf(oldElement);
    this.items[idx] = newElement;
    if (idx === this.stackTop) {
      this.current = newElement;
    }
  }
  insertAfter(referenceElement, newElement, newElementID) {
    const insertionIdx = this._indexOf(referenceElement) + 1;
    this.items.splice(insertionIdx, 0, newElement);
    this.tagIDs.splice(insertionIdx, 0, newElementID);
    this.stackTop++;
    if (insertionIdx === this.stackTop) {
      this._updateCurrentElement();
    }
    if (this.current && this.currentTagId !== void 0) {
      this.handler.onItemPush(this.current, this.currentTagId, insertionIdx === this.stackTop);
    }
  }
  popUntilTagNamePopped(tagName) {
    let targetIdx = this.stackTop + 1;
    do {
      targetIdx = this.tagIDs.lastIndexOf(tagName, targetIdx - 1);
    } while (targetIdx > 0 && this.treeAdapter.getNamespaceURI(this.items[targetIdx]) !== NS.HTML);
    this.shortenToLength(Math.max(targetIdx, 0));
  }
  shortenToLength(idx) {
    while (this.stackTop >= idx) {
      const popped = this.current;
      if (this.tmplCount > 0 && this._isInTemplate()) {
        this.tmplCount -= 1;
      }
      this.stackTop--;
      this._updateCurrentElement();
      this.handler.onItemPop(popped, this.stackTop < idx);
    }
  }
  popUntilElementPopped(element) {
    const idx = this._indexOf(element);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilPopped(tagNames, targetNS) {
    const idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilNumberedHeaderPopped() {
    this.popUntilPopped(NUMBERED_HEADERS, NS.HTML);
  }
  popUntilTableCellPopped() {
    this.popUntilPopped(TABLE_CELLS, NS.HTML);
  }
  popAllUpToHtmlElement() {
    this.tmplCount = 0;
    this.shortenToLength(1);
  }
  _indexOfTagNames(tagNames, namespace) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (tagNames.has(this.tagIDs[i]) && this.treeAdapter.getNamespaceURI(this.items[i]) === namespace) {
        return i;
      }
    }
    return -1;
  }
  clearBackTo(tagNames, targetNS) {
    const idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(idx + 1);
  }
  clearBackToTableContext() {
    this.clearBackTo(TABLE_CONTEXT, NS.HTML);
  }
  clearBackToTableBodyContext() {
    this.clearBackTo(TABLE_BODY_CONTEXT, NS.HTML);
  }
  clearBackToTableRowContext() {
    this.clearBackTo(TABLE_ROW_CONTEXT, NS.HTML);
  }
  remove(element) {
    const idx = this._indexOf(element);
    if (idx >= 0) {
      if (idx === this.stackTop) {
        this.pop();
      } else {
        this.items.splice(idx, 1);
        this.tagIDs.splice(idx, 1);
        this.stackTop--;
        this._updateCurrentElement();
        this.handler.onItemPop(element, false);
      }
    }
  }
  //Search
  tryPeekProperlyNestedBodyElement() {
    return this.stackTop >= 1 && this.tagIDs[1] === TAG_ID.BODY ? this.items[1] : null;
  }
  contains(element) {
    return this._indexOf(element) > -1;
  }
  getCommonAncestor(element) {
    const elementIdx = this._indexOf(element) - 1;
    return elementIdx >= 0 ? this.items[elementIdx] : null;
  }
  isRootHtmlElementCurrent() {
    return this.stackTop === 0 && this.tagIDs[0] === TAG_ID.HTML;
  }
  //Element in scope
  hasInDynamicScope(tagName, htmlScope) {
    for (let i = this.stackTop; i >= 0; i--) {
      const tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (tn === tagName)
            return true;
          if (htmlScope.has(tn))
            return false;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return false;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return false;
          break;
        }
      }
    }
    return true;
  }
  hasInScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML);
  }
  hasInListItemScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_LIST);
  }
  hasInButtonScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_BUTTON);
  }
  hasNumberedHeaderInScope() {
    for (let i = this.stackTop; i >= 0; i--) {
      const tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (NUMBERED_HEADERS.has(tn))
            return true;
          if (SCOPING_ELEMENTS_HTML.has(tn))
            return false;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return false;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return false;
          break;
        }
      }
    }
    return true;
  }
  hasInTableScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case tagName: {
          return true;
        }
        case TAG_ID.TABLE:
        case TAG_ID.HTML: {
          return false;
        }
      }
    }
    return true;
  }
  hasTableBodyContextInTableScope() {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case TAG_ID.TBODY:
        case TAG_ID.THEAD:
        case TAG_ID.TFOOT: {
          return true;
        }
        case TAG_ID.TABLE:
        case TAG_ID.HTML: {
          return false;
        }
      }
    }
    return true;
  }
  hasInSelectScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case tagName: {
          return true;
        }
        case TAG_ID.OPTION:
        case TAG_ID.OPTGROUP: {
          break;
        }
        default: {
          return false;
        }
      }
    }
    return true;
  }
  //Implied end tags
  generateImpliedEndTags() {
    while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED.has(this.currentTagId)) {
      this.pop();
    }
  }
  generateImpliedEndTagsThoroughly() {
    while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
      this.pop();
    }
  }
  generateImpliedEndTagsWithExclusion(exclusionId) {
    while (this.currentTagId !== void 0 && this.currentTagId !== exclusionId && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
      this.pop();
    }
  }
};

// node_modules/parse5/dist/parser/formatting-element-list.js
var NOAH_ARK_CAPACITY = 3;
var EntryType;
(function(EntryType2) {
  EntryType2[EntryType2["Marker"] = 0] = "Marker";
  EntryType2[EntryType2["Element"] = 1] = "Element";
})(EntryType || (EntryType = {}));
var MARKER = { type: EntryType.Marker };
var FormattingElementList = class {
  constructor(treeAdapter) {
    this.treeAdapter = treeAdapter;
    this.entries = [];
    this.bookmark = null;
  }
  //Noah Ark's condition
  //OPTIMIZATION: at first we try to find possible candidates for exclusion using
  //lightweight heuristics without thorough attributes check.
  _getNoahArkConditionCandidates(newElement, neAttrs) {
    const candidates = [];
    const neAttrsLength = neAttrs.length;
    const neTagName = this.treeAdapter.getTagName(newElement);
    const neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.type === EntryType.Marker) {
        break;
      }
      const { element } = entry;
      if (this.treeAdapter.getTagName(element) === neTagName && this.treeAdapter.getNamespaceURI(element) === neNamespaceURI) {
        const elementAttrs = this.treeAdapter.getAttrList(element);
        if (elementAttrs.length === neAttrsLength) {
          candidates.push({ idx: i, attrs: elementAttrs });
        }
      }
    }
    return candidates;
  }
  _ensureNoahArkCondition(newElement) {
    if (this.entries.length < NOAH_ARK_CAPACITY)
      return;
    const neAttrs = this.treeAdapter.getAttrList(newElement);
    const candidates = this._getNoahArkConditionCandidates(newElement, neAttrs);
    if (candidates.length < NOAH_ARK_CAPACITY)
      return;
    const neAttrsMap = new Map(neAttrs.map((neAttr) => [neAttr.name, neAttr.value]));
    let validCandidates = 0;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.attrs.every((cAttr) => neAttrsMap.get(cAttr.name) === cAttr.value)) {
        validCandidates += 1;
        if (validCandidates >= NOAH_ARK_CAPACITY) {
          this.entries.splice(candidate.idx, 1);
        }
      }
    }
  }
  //Mutations
  insertMarker() {
    this.entries.unshift(MARKER);
  }
  pushElement(element, token) {
    this._ensureNoahArkCondition(element);
    this.entries.unshift({
      type: EntryType.Element,
      element,
      token
    });
  }
  insertElementAfterBookmark(element, token) {
    const bookmarkIdx = this.entries.indexOf(this.bookmark);
    this.entries.splice(bookmarkIdx, 0, {
      type: EntryType.Element,
      element,
      token
    });
  }
  removeEntry(entry) {
    const entryIndex = this.entries.indexOf(entry);
    if (entryIndex !== -1) {
      this.entries.splice(entryIndex, 1);
    }
  }
  /**
   * Clears the list of formatting elements up to the last marker.
   *
   * @see https://html.spec.whatwg.org/multipage/parsing.html#clear-the-list-of-active-formatting-elements-up-to-the-last-marker
   */
  clearToLastMarker() {
    const markerIdx = this.entries.indexOf(MARKER);
    if (markerIdx === -1) {
      this.entries.length = 0;
    } else {
      this.entries.splice(0, markerIdx + 1);
    }
  }
  //Search
  getElementEntryInScopeWithTagName(tagName) {
    const entry = this.entries.find((entry2) => entry2.type === EntryType.Marker || this.treeAdapter.getTagName(entry2.element) === tagName);
    return entry && entry.type === EntryType.Element ? entry : null;
  }
  getElementEntry(element) {
    return this.entries.find((entry) => entry.type === EntryType.Element && entry.element === element);
  }
};

// node_modules/parse5/dist/tree-adapters/default.js
var defaultTreeAdapter = {
  //Node construction
  createDocument() {
    return {
      nodeName: "#document",
      mode: DOCUMENT_MODE.NO_QUIRKS,
      childNodes: []
    };
  },
  createDocumentFragment() {
    return {
      nodeName: "#document-fragment",
      childNodes: []
    };
  },
  createElement(tagName, namespaceURI, attrs) {
    return {
      nodeName: tagName,
      tagName,
      attrs,
      namespaceURI,
      childNodes: [],
      parentNode: null
    };
  },
  createCommentNode(data) {
    return {
      nodeName: "#comment",
      data,
      parentNode: null
    };
  },
  createTextNode(value) {
    return {
      nodeName: "#text",
      value,
      parentNode: null
    };
  },
  //Tree mutation
  appendChild(parentNode, newNode) {
    parentNode.childNodes.push(newNode);
    newNode.parentNode = parentNode;
  },
  insertBefore(parentNode, newNode, referenceNode) {
    const insertionIdx = parentNode.childNodes.indexOf(referenceNode);
    parentNode.childNodes.splice(insertionIdx, 0, newNode);
    newNode.parentNode = parentNode;
  },
  setTemplateContent(templateElement, contentElement) {
    templateElement.content = contentElement;
  },
  getTemplateContent(templateElement) {
    return templateElement.content;
  },
  setDocumentType(document, name, publicId, systemId) {
    const doctypeNode = document.childNodes.find((node) => node.nodeName === "#documentType");
    if (doctypeNode) {
      doctypeNode.name = name;
      doctypeNode.publicId = publicId;
      doctypeNode.systemId = systemId;
    } else {
      const node = {
        nodeName: "#documentType",
        name,
        publicId,
        systemId,
        parentNode: null
      };
      defaultTreeAdapter.appendChild(document, node);
    }
  },
  setDocumentMode(document, mode) {
    document.mode = mode;
  },
  getDocumentMode(document) {
    return document.mode;
  },
  detachNode(node) {
    if (node.parentNode) {
      const idx = node.parentNode.childNodes.indexOf(node);
      node.parentNode.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
  },
  insertText(parentNode, text) {
    if (parentNode.childNodes.length > 0) {
      const prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];
      if (defaultTreeAdapter.isTextNode(prevNode)) {
        prevNode.value += text;
        return;
      }
    }
    defaultTreeAdapter.appendChild(parentNode, defaultTreeAdapter.createTextNode(text));
  },
  insertTextBefore(parentNode, text, referenceNode) {
    const prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];
    if (prevNode && defaultTreeAdapter.isTextNode(prevNode)) {
      prevNode.value += text;
    } else {
      defaultTreeAdapter.insertBefore(parentNode, defaultTreeAdapter.createTextNode(text), referenceNode);
    }
  },
  adoptAttributes(recipient, attrs) {
    const recipientAttrsMap = new Set(recipient.attrs.map((attr) => attr.name));
    for (let j = 0; j < attrs.length; j++) {
      if (!recipientAttrsMap.has(attrs[j].name)) {
        recipient.attrs.push(attrs[j]);
      }
    }
  },
  //Tree traversing
  getFirstChild(node) {
    return node.childNodes[0];
  },
  getChildNodes(node) {
    return node.childNodes;
  },
  getParentNode(node) {
    return node.parentNode;
  },
  getAttrList(element) {
    return element.attrs;
  },
  //Node data
  getTagName(element) {
    return element.tagName;
  },
  getNamespaceURI(element) {
    return element.namespaceURI;
  },
  getTextNodeContent(textNode) {
    return textNode.value;
  },
  getCommentNodeContent(commentNode) {
    return commentNode.data;
  },
  getDocumentTypeNodeName(doctypeNode) {
    return doctypeNode.name;
  },
  getDocumentTypeNodePublicId(doctypeNode) {
    return doctypeNode.publicId;
  },
  getDocumentTypeNodeSystemId(doctypeNode) {
    return doctypeNode.systemId;
  },
  //Node types
  isTextNode(node) {
    return node.nodeName === "#text";
  },
  isCommentNode(node) {
    return node.nodeName === "#comment";
  },
  isDocumentTypeNode(node) {
    return node.nodeName === "#documentType";
  },
  isElementNode(node) {
    return Object.prototype.hasOwnProperty.call(node, "tagName");
  },
  // Source code location
  setNodeSourceCodeLocation(node, location) {
    node.sourceCodeLocation = location;
  },
  getNodeSourceCodeLocation(node) {
    return node.sourceCodeLocation;
  },
  updateNodeSourceCodeLocation(node, endLocation) {
    node.sourceCodeLocation = { ...node.sourceCodeLocation, ...endLocation };
  }
};

// node_modules/parse5/dist/common/doctype.js
var VALID_DOCTYPE_NAME = "html";
var VALID_SYSTEM_ID = "about:legacy-compat";
var QUIRKS_MODE_SYSTEM_ID = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd";
var QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
  "+//silmaril//dtd html pro v0r11 19970101//",
  "-//as//dtd html 3.0 aswedit + extensions//",
  "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
  "-//ietf//dtd html 2.0 level 1//",
  "-//ietf//dtd html 2.0 level 2//",
  "-//ietf//dtd html 2.0 strict level 1//",
  "-//ietf//dtd html 2.0 strict level 2//",
  "-//ietf//dtd html 2.0 strict//",
  "-//ietf//dtd html 2.0//",
  "-//ietf//dtd html 2.1e//",
  "-//ietf//dtd html 3.0//",
  "-//ietf//dtd html 3.2 final//",
  "-//ietf//dtd html 3.2//",
  "-//ietf//dtd html 3//",
  "-//ietf//dtd html level 0//",
  "-//ietf//dtd html level 1//",
  "-//ietf//dtd html level 2//",
  "-//ietf//dtd html level 3//",
  "-//ietf//dtd html strict level 0//",
  "-//ietf//dtd html strict level 1//",
  "-//ietf//dtd html strict level 2//",
  "-//ietf//dtd html strict level 3//",
  "-//ietf//dtd html strict//",
  "-//ietf//dtd html//",
  "-//metrius//dtd metrius presentational//",
  "-//microsoft//dtd internet explorer 2.0 html strict//",
  "-//microsoft//dtd internet explorer 2.0 html//",
  "-//microsoft//dtd internet explorer 2.0 tables//",
  "-//microsoft//dtd internet explorer 3.0 html strict//",
  "-//microsoft//dtd internet explorer 3.0 html//",
  "-//microsoft//dtd internet explorer 3.0 tables//",
  "-//netscape comm. corp.//dtd html//",
  "-//netscape comm. corp.//dtd strict html//",
  "-//o'reilly and associates//dtd html 2.0//",
  "-//o'reilly and associates//dtd html extended 1.0//",
  "-//o'reilly and associates//dtd html extended relaxed 1.0//",
  "-//sq//dtd html 2.0 hotmetal + extensions//",
  "-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//",
  "-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//",
  "-//spyglass//dtd html 2.0 extended//",
  "-//sun microsystems corp.//dtd hotjava html//",
  "-//sun microsystems corp.//dtd hotjava strict html//",
  "-//w3c//dtd html 3 1995-03-24//",
  "-//w3c//dtd html 3.2 draft//",
  "-//w3c//dtd html 3.2 final//",
  "-//w3c//dtd html 3.2//",
  "-//w3c//dtd html 3.2s draft//",
  "-//w3c//dtd html 4.0 frameset//",
  "-//w3c//dtd html 4.0 transitional//",
  "-//w3c//dtd html experimental 19960712//",
  "-//w3c//dtd html experimental 970421//",
  "-//w3c//dtd w3 html//",
  "-//w3o//dtd w3 html 3.0//",
  "-//webtechs//dtd mozilla html 2.0//",
  "-//webtechs//dtd mozilla html//"
];
var QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...QUIRKS_MODE_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];
var QUIRKS_MODE_PUBLIC_IDS = /* @__PURE__ */ new Set([
  "-//w3o//dtd w3 html strict 3.0//en//",
  "-/w3c/dtd html 4.0 transitional/en",
  "html"
]);
var LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ["-//w3c//dtd xhtml 1.0 frameset//", "-//w3c//dtd xhtml 1.0 transitional//"];
var LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...LIMITED_QUIRKS_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];
function hasPrefix(publicId, prefixes) {
  return prefixes.some((prefix) => publicId.startsWith(prefix));
}
function isConforming(token) {
  return token.name === VALID_DOCTYPE_NAME && token.publicId === null && (token.systemId === null || token.systemId === VALID_SYSTEM_ID);
}
function getDocumentMode(token) {
  if (token.name !== VALID_DOCTYPE_NAME) {
    return DOCUMENT_MODE.QUIRKS;
  }
  const { systemId } = token;
  if (systemId && systemId.toLowerCase() === QUIRKS_MODE_SYSTEM_ID) {
    return DOCUMENT_MODE.QUIRKS;
  }
  let { publicId } = token;
  if (publicId !== null) {
    publicId = publicId.toLowerCase();
    if (QUIRKS_MODE_PUBLIC_IDS.has(publicId)) {
      return DOCUMENT_MODE.QUIRKS;
    }
    let prefixes = systemId === null ? QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES : QUIRKS_MODE_PUBLIC_ID_PREFIXES;
    if (hasPrefix(publicId, prefixes)) {
      return DOCUMENT_MODE.QUIRKS;
    }
    prefixes = systemId === null ? LIMITED_QUIRKS_PUBLIC_ID_PREFIXES : LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES;
    if (hasPrefix(publicId, prefixes)) {
      return DOCUMENT_MODE.LIMITED_QUIRKS;
    }
  }
  return DOCUMENT_MODE.NO_QUIRKS;
}

// node_modules/parse5/dist/common/foreign-content.js
var MIME_TYPES = {
  TEXT_HTML: "text/html",
  APPLICATION_XML: "application/xhtml+xml"
};
var DEFINITION_URL_ATTR = "definitionurl";
var ADJUSTED_DEFINITION_URL_ATTR = "definitionURL";
var SVG_ATTRS_ADJUSTMENT_MAP = new Map([
  "attributeName",
  "attributeType",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "clipPathUnits",
  "diffuseConstant",
  "edgeMode",
  "filterUnits",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "maskContentUnits",
  "maskUnits",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stitchTiles",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
  "zoomAndPan"
].map((attr) => [attr.toLowerCase(), attr]));
var XML_ATTRS_ADJUSTMENT_MAP = /* @__PURE__ */ new Map([
  ["xlink:actuate", { prefix: "xlink", name: "actuate", namespace: NS.XLINK }],
  ["xlink:arcrole", { prefix: "xlink", name: "arcrole", namespace: NS.XLINK }],
  ["xlink:href", { prefix: "xlink", name: "href", namespace: NS.XLINK }],
  ["xlink:role", { prefix: "xlink", name: "role", namespace: NS.XLINK }],
  ["xlink:show", { prefix: "xlink", name: "show", namespace: NS.XLINK }],
  ["xlink:title", { prefix: "xlink", name: "title", namespace: NS.XLINK }],
  ["xlink:type", { prefix: "xlink", name: "type", namespace: NS.XLINK }],
  ["xml:lang", { prefix: "xml", name: "lang", namespace: NS.XML }],
  ["xml:space", { prefix: "xml", name: "space", namespace: NS.XML }],
  ["xmlns", { prefix: "", name: "xmlns", namespace: NS.XMLNS }],
  ["xmlns:xlink", { prefix: "xmlns", name: "xlink", namespace: NS.XMLNS }]
]);
var SVG_TAG_NAMES_ADJUSTMENT_MAP = new Map([
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "textPath"
].map((tn) => [tn.toLowerCase(), tn]));
var EXITS_FOREIGN_CONTENT = /* @__PURE__ */ new Set([
  TAG_ID.B,
  TAG_ID.BIG,
  TAG_ID.BLOCKQUOTE,
  TAG_ID.BODY,
  TAG_ID.BR,
  TAG_ID.CENTER,
  TAG_ID.CODE,
  TAG_ID.DD,
  TAG_ID.DIV,
  TAG_ID.DL,
  TAG_ID.DT,
  TAG_ID.EM,
  TAG_ID.EMBED,
  TAG_ID.H1,
  TAG_ID.H2,
  TAG_ID.H3,
  TAG_ID.H4,
  TAG_ID.H5,
  TAG_ID.H6,
  TAG_ID.HEAD,
  TAG_ID.HR,
  TAG_ID.I,
  TAG_ID.IMG,
  TAG_ID.LI,
  TAG_ID.LISTING,
  TAG_ID.MENU,
  TAG_ID.META,
  TAG_ID.NOBR,
  TAG_ID.OL,
  TAG_ID.P,
  TAG_ID.PRE,
  TAG_ID.RUBY,
  TAG_ID.S,
  TAG_ID.SMALL,
  TAG_ID.SPAN,
  TAG_ID.STRONG,
  TAG_ID.STRIKE,
  TAG_ID.SUB,
  TAG_ID.SUP,
  TAG_ID.TABLE,
  TAG_ID.TT,
  TAG_ID.U,
  TAG_ID.UL,
  TAG_ID.VAR
]);
function causesExit(startTagToken) {
  const tn = startTagToken.tagID;
  const isFontWithAttrs = tn === TAG_ID.FONT && startTagToken.attrs.some(({ name }) => name === ATTRS.COLOR || name === ATTRS.SIZE || name === ATTRS.FACE);
  return isFontWithAttrs || EXITS_FOREIGN_CONTENT.has(tn);
}
function adjustTokenMathMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    if (token.attrs[i].name === DEFINITION_URL_ATTR) {
      token.attrs[i].name = ADJUSTED_DEFINITION_URL_ATTR;
      break;
    }
  }
}
function adjustTokenSVGAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    const adjustedAttrName = SVG_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    if (adjustedAttrName != null) {
      token.attrs[i].name = adjustedAttrName;
    }
  }
}
function adjustTokenXMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    const adjustedAttrEntry = XML_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    if (adjustedAttrEntry) {
      token.attrs[i].prefix = adjustedAttrEntry.prefix;
      token.attrs[i].name = adjustedAttrEntry.name;
      token.attrs[i].namespace = adjustedAttrEntry.namespace;
    }
  }
}
function adjustTokenSVGTagName(token) {
  const adjustedTagName = SVG_TAG_NAMES_ADJUSTMENT_MAP.get(token.tagName);
  if (adjustedTagName != null) {
    token.tagName = adjustedTagName;
    token.tagID = getTagID(token.tagName);
  }
}
function isMathMLTextIntegrationPoint(tn, ns) {
  return ns === NS.MATHML && (tn === TAG_ID.MI || tn === TAG_ID.MO || tn === TAG_ID.MN || tn === TAG_ID.MS || tn === TAG_ID.MTEXT);
}
function isHtmlIntegrationPoint(tn, ns, attrs) {
  if (ns === NS.MATHML && tn === TAG_ID.ANNOTATION_XML) {
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].name === ATTRS.ENCODING) {
        const value = attrs[i].value.toLowerCase();
        return value === MIME_TYPES.TEXT_HTML || value === MIME_TYPES.APPLICATION_XML;
      }
    }
  }
  return ns === NS.SVG && (tn === TAG_ID.FOREIGN_OBJECT || tn === TAG_ID.DESC || tn === TAG_ID.TITLE);
}
function isIntegrationPoint(tn, ns, attrs, foreignNS) {
  return (!foreignNS || foreignNS === NS.HTML) && isHtmlIntegrationPoint(tn, ns, attrs) || (!foreignNS || foreignNS === NS.MATHML) && isMathMLTextIntegrationPoint(tn, ns);
}

// node_modules/parse5/dist/parser/index.js
var HIDDEN_INPUT_TYPE = "hidden";
var AA_OUTER_LOOP_ITER = 8;
var AA_INNER_LOOP_ITER = 3;
var InsertionMode;
(function(InsertionMode2) {
  InsertionMode2[InsertionMode2["INITIAL"] = 0] = "INITIAL";
  InsertionMode2[InsertionMode2["BEFORE_HTML"] = 1] = "BEFORE_HTML";
  InsertionMode2[InsertionMode2["BEFORE_HEAD"] = 2] = "BEFORE_HEAD";
  InsertionMode2[InsertionMode2["IN_HEAD"] = 3] = "IN_HEAD";
  InsertionMode2[InsertionMode2["IN_HEAD_NO_SCRIPT"] = 4] = "IN_HEAD_NO_SCRIPT";
  InsertionMode2[InsertionMode2["AFTER_HEAD"] = 5] = "AFTER_HEAD";
  InsertionMode2[InsertionMode2["IN_BODY"] = 6] = "IN_BODY";
  InsertionMode2[InsertionMode2["TEXT"] = 7] = "TEXT";
  InsertionMode2[InsertionMode2["IN_TABLE"] = 8] = "IN_TABLE";
  InsertionMode2[InsertionMode2["IN_TABLE_TEXT"] = 9] = "IN_TABLE_TEXT";
  InsertionMode2[InsertionMode2["IN_CAPTION"] = 10] = "IN_CAPTION";
  InsertionMode2[InsertionMode2["IN_COLUMN_GROUP"] = 11] = "IN_COLUMN_GROUP";
  InsertionMode2[InsertionMode2["IN_TABLE_BODY"] = 12] = "IN_TABLE_BODY";
  InsertionMode2[InsertionMode2["IN_ROW"] = 13] = "IN_ROW";
  InsertionMode2[InsertionMode2["IN_CELL"] = 14] = "IN_CELL";
  InsertionMode2[InsertionMode2["IN_SELECT"] = 15] = "IN_SELECT";
  InsertionMode2[InsertionMode2["IN_SELECT_IN_TABLE"] = 16] = "IN_SELECT_IN_TABLE";
  InsertionMode2[InsertionMode2["IN_TEMPLATE"] = 17] = "IN_TEMPLATE";
  InsertionMode2[InsertionMode2["AFTER_BODY"] = 18] = "AFTER_BODY";
  InsertionMode2[InsertionMode2["IN_FRAMESET"] = 19] = "IN_FRAMESET";
  InsertionMode2[InsertionMode2["AFTER_FRAMESET"] = 20] = "AFTER_FRAMESET";
  InsertionMode2[InsertionMode2["AFTER_AFTER_BODY"] = 21] = "AFTER_AFTER_BODY";
  InsertionMode2[InsertionMode2["AFTER_AFTER_FRAMESET"] = 22] = "AFTER_AFTER_FRAMESET";
})(InsertionMode || (InsertionMode = {}));
var BASE_LOC = {
  startLine: -1,
  startCol: -1,
  startOffset: -1,
  endLine: -1,
  endCol: -1,
  endOffset: -1
};
var TABLE_STRUCTURE_TAGS = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TR]);
var defaultParserOptions = {
  scriptingEnabled: true,
  sourceCodeLocationInfo: false,
  treeAdapter: defaultTreeAdapter,
  onParseError: null
};
var Parser = class {
  constructor(options, document, fragmentContext = null, scriptHandler = null) {
    this.fragmentContext = fragmentContext;
    this.scriptHandler = scriptHandler;
    this.currentToken = null;
    this.stopped = false;
    this.insertionMode = InsertionMode.INITIAL;
    this.originalInsertionMode = InsertionMode.INITIAL;
    this.headElement = null;
    this.formElement = null;
    this.currentNotInHTML = false;
    this.tmplInsertionModeStack = [];
    this.pendingCharacterTokens = [];
    this.hasNonWhitespacePendingCharacterToken = false;
    this.framesetOk = true;
    this.skipNextNewLine = false;
    this.fosterParentingEnabled = false;
    this.options = {
      ...defaultParserOptions,
      ...options
    };
    this.treeAdapter = this.options.treeAdapter;
    this.onParseError = this.options.onParseError;
    if (this.onParseError) {
      this.options.sourceCodeLocationInfo = true;
    }
    this.document = document !== null && document !== void 0 ? document : this.treeAdapter.createDocument();
    this.tokenizer = new Tokenizer(this.options, this);
    this.activeFormattingElements = new FormattingElementList(this.treeAdapter);
    this.fragmentContextID = fragmentContext ? getTagID(this.treeAdapter.getTagName(fragmentContext)) : TAG_ID.UNKNOWN;
    this._setContextModes(fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : this.document, this.fragmentContextID);
    this.openElements = new OpenElementStack(this.document, this.treeAdapter, this);
  }
  // API
  static parse(html, options) {
    const parser = new this(options);
    parser.tokenizer.write(html, true);
    return parser.document;
  }
  static getFragmentParser(fragmentContext, options) {
    const opts = {
      ...defaultParserOptions,
      ...options
    };
    fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : fragmentContext = opts.treeAdapter.createElement(TAG_NAMES.TEMPLATE, NS.HTML, []);
    const documentMock = opts.treeAdapter.createElement("documentmock", NS.HTML, []);
    const parser = new this(opts, documentMock, fragmentContext);
    if (parser.fragmentContextID === TAG_ID.TEMPLATE) {
      parser.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
    }
    parser._initTokenizerForFragmentParsing();
    parser._insertFakeRootElement();
    parser._resetInsertionMode();
    parser._findFormInFragmentContext();
    return parser;
  }
  getFragment() {
    const rootElement = this.treeAdapter.getFirstChild(this.document);
    const fragment = this.treeAdapter.createDocumentFragment();
    this._adoptNodes(rootElement, fragment);
    return fragment;
  }
  //Errors
  /** @internal */
  _err(token, code, beforeToken) {
    var _a;
    if (!this.onParseError)
      return;
    const loc = (_a = token.location) !== null && _a !== void 0 ? _a : BASE_LOC;
    const err = {
      code,
      startLine: loc.startLine,
      startCol: loc.startCol,
      startOffset: loc.startOffset,
      endLine: beforeToken ? loc.startLine : loc.endLine,
      endCol: beforeToken ? loc.startCol : loc.endCol,
      endOffset: beforeToken ? loc.startOffset : loc.endOffset
    };
    this.onParseError(err);
  }
  //Stack events
  /** @internal */
  onItemPush(node, tid, isTop) {
    var _a, _b;
    (_b = (_a = this.treeAdapter).onItemPush) === null || _b === void 0 ? void 0 : _b.call(_a, node);
    if (isTop && this.openElements.stackTop > 0)
      this._setContextModes(node, tid);
  }
  /** @internal */
  onItemPop(node, isTop) {
    var _a, _b;
    if (this.options.sourceCodeLocationInfo) {
      this._setEndLocation(node, this.currentToken);
    }
    (_b = (_a = this.treeAdapter).onItemPop) === null || _b === void 0 ? void 0 : _b.call(_a, node, this.openElements.current);
    if (isTop) {
      let current;
      let currentTagId;
      if (this.openElements.stackTop === 0 && this.fragmentContext) {
        current = this.fragmentContext;
        currentTagId = this.fragmentContextID;
      } else {
        ({ current, currentTagId } = this.openElements);
      }
      this._setContextModes(current, currentTagId);
    }
  }
  _setContextModes(current, tid) {
    const isHTML = current === this.document || current && this.treeAdapter.getNamespaceURI(current) === NS.HTML;
    this.currentNotInHTML = !isHTML;
    this.tokenizer.inForeignNode = !isHTML && current !== void 0 && tid !== void 0 && !this._isIntegrationPoint(tid, current);
  }
  /** @protected */
  _switchToTextParsing(currentToken, nextTokenizerState) {
    this._insertElement(currentToken, NS.HTML);
    this.tokenizer.state = nextTokenizerState;
    this.originalInsertionMode = this.insertionMode;
    this.insertionMode = InsertionMode.TEXT;
  }
  switchToPlaintextParsing() {
    this.insertionMode = InsertionMode.TEXT;
    this.originalInsertionMode = InsertionMode.IN_BODY;
    this.tokenizer.state = TokenizerMode.PLAINTEXT;
  }
  //Fragment parsing
  /** @protected */
  _getAdjustedCurrentElement() {
    return this.openElements.stackTop === 0 && this.fragmentContext ? this.fragmentContext : this.openElements.current;
  }
  /** @protected */
  _findFormInFragmentContext() {
    let node = this.fragmentContext;
    while (node) {
      if (this.treeAdapter.getTagName(node) === TAG_NAMES.FORM) {
        this.formElement = node;
        break;
      }
      node = this.treeAdapter.getParentNode(node);
    }
  }
  _initTokenizerForFragmentParsing() {
    if (!this.fragmentContext || this.treeAdapter.getNamespaceURI(this.fragmentContext) !== NS.HTML) {
      return;
    }
    switch (this.fragmentContextID) {
      case TAG_ID.TITLE:
      case TAG_ID.TEXTAREA: {
        this.tokenizer.state = TokenizerMode.RCDATA;
        break;
      }
      case TAG_ID.STYLE:
      case TAG_ID.XMP:
      case TAG_ID.IFRAME:
      case TAG_ID.NOEMBED:
      case TAG_ID.NOFRAMES:
      case TAG_ID.NOSCRIPT: {
        this.tokenizer.state = TokenizerMode.RAWTEXT;
        break;
      }
      case TAG_ID.SCRIPT: {
        this.tokenizer.state = TokenizerMode.SCRIPT_DATA;
        break;
      }
      case TAG_ID.PLAINTEXT: {
        this.tokenizer.state = TokenizerMode.PLAINTEXT;
        break;
      }
      default:
    }
  }
  //Tree mutation
  /** @protected */
  _setDocumentType(token) {
    const name = token.name || "";
    const publicId = token.publicId || "";
    const systemId = token.systemId || "";
    this.treeAdapter.setDocumentType(this.document, name, publicId, systemId);
    if (token.location) {
      const documentChildren = this.treeAdapter.getChildNodes(this.document);
      const docTypeNode = documentChildren.find((node) => this.treeAdapter.isDocumentTypeNode(node));
      if (docTypeNode) {
        this.treeAdapter.setNodeSourceCodeLocation(docTypeNode, token.location);
      }
    }
  }
  /** @protected */
  _attachElementToTree(element, location) {
    if (this.options.sourceCodeLocationInfo) {
      const loc = location && {
        ...location,
        startTag: location
      };
      this.treeAdapter.setNodeSourceCodeLocation(element, loc);
    }
    if (this._shouldFosterParentOnInsertion()) {
      this._fosterParentElement(element);
    } else {
      const parent = this.openElements.currentTmplContentOrNode;
      this.treeAdapter.appendChild(parent !== null && parent !== void 0 ? parent : this.document, element);
    }
  }
  /**
   * For self-closing tags. Add an element to the tree, but skip adding it
   * to the stack.
   */
  /** @protected */
  _appendElement(token, namespaceURI) {
    const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location);
  }
  /** @protected */
  _insertElement(token, namespaceURI) {
    const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location);
    this.openElements.push(element, token.tagID);
  }
  /** @protected */
  _insertFakeElement(tagName, tagID) {
    const element = this.treeAdapter.createElement(tagName, NS.HTML, []);
    this._attachElementToTree(element, null);
    this.openElements.push(element, tagID);
  }
  /** @protected */
  _insertTemplate(token) {
    const tmpl = this.treeAdapter.createElement(token.tagName, NS.HTML, token.attrs);
    const content = this.treeAdapter.createDocumentFragment();
    this.treeAdapter.setTemplateContent(tmpl, content);
    this._attachElementToTree(tmpl, token.location);
    this.openElements.push(tmpl, token.tagID);
    if (this.options.sourceCodeLocationInfo)
      this.treeAdapter.setNodeSourceCodeLocation(content, null);
  }
  /** @protected */
  _insertFakeRootElement() {
    const element = this.treeAdapter.createElement(TAG_NAMES.HTML, NS.HTML, []);
    if (this.options.sourceCodeLocationInfo)
      this.treeAdapter.setNodeSourceCodeLocation(element, null);
    this.treeAdapter.appendChild(this.openElements.current, element);
    this.openElements.push(element, TAG_ID.HTML);
  }
  /** @protected */
  _appendCommentNode(token, parent) {
    const commentNode = this.treeAdapter.createCommentNode(token.data);
    this.treeAdapter.appendChild(parent, commentNode);
    if (this.options.sourceCodeLocationInfo) {
      this.treeAdapter.setNodeSourceCodeLocation(commentNode, token.location);
    }
  }
  /** @protected */
  _insertCharacters(token) {
    let parent;
    let beforeElement;
    if (this._shouldFosterParentOnInsertion()) {
      ({ parent, beforeElement } = this._findFosterParentingLocation());
      if (beforeElement) {
        this.treeAdapter.insertTextBefore(parent, token.chars, beforeElement);
      } else {
        this.treeAdapter.insertText(parent, token.chars);
      }
    } else {
      parent = this.openElements.currentTmplContentOrNode;
      this.treeAdapter.insertText(parent, token.chars);
    }
    if (!token.location)
      return;
    const siblings = this.treeAdapter.getChildNodes(parent);
    const textNodeIdx = beforeElement ? siblings.lastIndexOf(beforeElement) : siblings.length;
    const textNode = siblings[textNodeIdx - 1];
    const tnLoc = this.treeAdapter.getNodeSourceCodeLocation(textNode);
    if (tnLoc) {
      const { endLine, endCol, endOffset } = token.location;
      this.treeAdapter.updateNodeSourceCodeLocation(textNode, { endLine, endCol, endOffset });
    } else if (this.options.sourceCodeLocationInfo) {
      this.treeAdapter.setNodeSourceCodeLocation(textNode, token.location);
    }
  }
  /** @protected */
  _adoptNodes(donor, recipient) {
    for (let child = this.treeAdapter.getFirstChild(donor); child; child = this.treeAdapter.getFirstChild(donor)) {
      this.treeAdapter.detachNode(child);
      this.treeAdapter.appendChild(recipient, child);
    }
  }
  /** @protected */
  _setEndLocation(element, closingToken) {
    if (this.treeAdapter.getNodeSourceCodeLocation(element) && closingToken.location) {
      const ctLoc = closingToken.location;
      const tn = this.treeAdapter.getTagName(element);
      const endLoc = (
        // NOTE: For cases like <p> <p> </p> - First 'p' closes without a closing
        // tag and for cases like <td> <p> </td> - 'p' closes without a closing tag.
        closingToken.type === TokenType.END_TAG && tn === closingToken.tagName ? {
          endTag: { ...ctLoc },
          endLine: ctLoc.endLine,
          endCol: ctLoc.endCol,
          endOffset: ctLoc.endOffset
        } : {
          endLine: ctLoc.startLine,
          endCol: ctLoc.startCol,
          endOffset: ctLoc.startOffset
        }
      );
      this.treeAdapter.updateNodeSourceCodeLocation(element, endLoc);
    }
  }
  //Token processing
  shouldProcessStartTagTokenInForeignContent(token) {
    if (!this.currentNotInHTML)
      return false;
    let current;
    let currentTagId;
    if (this.openElements.stackTop === 0 && this.fragmentContext) {
      current = this.fragmentContext;
      currentTagId = this.fragmentContextID;
    } else {
      ({ current, currentTagId } = this.openElements);
    }
    if (token.tagID === TAG_ID.SVG && this.treeAdapter.getTagName(current) === TAG_NAMES.ANNOTATION_XML && this.treeAdapter.getNamespaceURI(current) === NS.MATHML) {
      return false;
    }
    return (
      // Check that `current` is not an integration point for HTML or MathML elements.
      this.tokenizer.inForeignNode || // If it _is_ an integration point, then we might have to check that it is not an HTML
      // integration point.
      (token.tagID === TAG_ID.MGLYPH || token.tagID === TAG_ID.MALIGNMARK) && currentTagId !== void 0 && !this._isIntegrationPoint(currentTagId, current, NS.HTML)
    );
  }
  /** @protected */
  _processToken(token) {
    switch (token.type) {
      case TokenType.CHARACTER: {
        this.onCharacter(token);
        break;
      }
      case TokenType.NULL_CHARACTER: {
        this.onNullCharacter(token);
        break;
      }
      case TokenType.COMMENT: {
        this.onComment(token);
        break;
      }
      case TokenType.DOCTYPE: {
        this.onDoctype(token);
        break;
      }
      case TokenType.START_TAG: {
        this._processStartTag(token);
        break;
      }
      case TokenType.END_TAG: {
        this.onEndTag(token);
        break;
      }
      case TokenType.EOF: {
        this.onEof(token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        this.onWhitespaceCharacter(token);
        break;
      }
    }
  }
  //Integration points
  /** @protected */
  _isIntegrationPoint(tid, element, foreignNS) {
    const ns = this.treeAdapter.getNamespaceURI(element);
    const attrs = this.treeAdapter.getAttrList(element);
    return isIntegrationPoint(tid, ns, attrs, foreignNS);
  }
  //Active formatting elements reconstruction
  /** @protected */
  _reconstructActiveFormattingElements() {
    const listLength = this.activeFormattingElements.entries.length;
    if (listLength) {
      const endIndex = this.activeFormattingElements.entries.findIndex((entry) => entry.type === EntryType.Marker || this.openElements.contains(entry.element));
      const unopenIdx = endIndex === -1 ? listLength - 1 : endIndex - 1;
      for (let i = unopenIdx; i >= 0; i--) {
        const entry = this.activeFormattingElements.entries[i];
        this._insertElement(entry.token, this.treeAdapter.getNamespaceURI(entry.element));
        entry.element = this.openElements.current;
      }
    }
  }
  //Close elements
  /** @protected */
  _closeTableCell() {
    this.openElements.generateImpliedEndTags();
    this.openElements.popUntilTableCellPopped();
    this.activeFormattingElements.clearToLastMarker();
    this.insertionMode = InsertionMode.IN_ROW;
  }
  /** @protected */
  _closePElement() {
    this.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.P);
    this.openElements.popUntilTagNamePopped(TAG_ID.P);
  }
  //Insertion modes
  /** @protected */
  _resetInsertionMode() {
    for (let i = this.openElements.stackTop; i >= 0; i--) {
      switch (i === 0 && this.fragmentContext ? this.fragmentContextID : this.openElements.tagIDs[i]) {
        case TAG_ID.TR: {
          this.insertionMode = InsertionMode.IN_ROW;
          return;
        }
        case TAG_ID.TBODY:
        case TAG_ID.THEAD:
        case TAG_ID.TFOOT: {
          this.insertionMode = InsertionMode.IN_TABLE_BODY;
          return;
        }
        case TAG_ID.CAPTION: {
          this.insertionMode = InsertionMode.IN_CAPTION;
          return;
        }
        case TAG_ID.COLGROUP: {
          this.insertionMode = InsertionMode.IN_COLUMN_GROUP;
          return;
        }
        case TAG_ID.TABLE: {
          this.insertionMode = InsertionMode.IN_TABLE;
          return;
        }
        case TAG_ID.BODY: {
          this.insertionMode = InsertionMode.IN_BODY;
          return;
        }
        case TAG_ID.FRAMESET: {
          this.insertionMode = InsertionMode.IN_FRAMESET;
          return;
        }
        case TAG_ID.SELECT: {
          this._resetInsertionModeForSelect(i);
          return;
        }
        case TAG_ID.TEMPLATE: {
          this.insertionMode = this.tmplInsertionModeStack[0];
          return;
        }
        case TAG_ID.HTML: {
          this.insertionMode = this.headElement ? InsertionMode.AFTER_HEAD : InsertionMode.BEFORE_HEAD;
          return;
        }
        case TAG_ID.TD:
        case TAG_ID.TH: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_CELL;
            return;
          }
          break;
        }
        case TAG_ID.HEAD: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_HEAD;
            return;
          }
          break;
        }
      }
    }
    this.insertionMode = InsertionMode.IN_BODY;
  }
  /** @protected */
  _resetInsertionModeForSelect(selectIdx) {
    if (selectIdx > 0) {
      for (let i = selectIdx - 1; i > 0; i--) {
        const tn = this.openElements.tagIDs[i];
        if (tn === TAG_ID.TEMPLATE) {
          break;
        } else if (tn === TAG_ID.TABLE) {
          this.insertionMode = InsertionMode.IN_SELECT_IN_TABLE;
          return;
        }
      }
    }
    this.insertionMode = InsertionMode.IN_SELECT;
  }
  //Foster parenting
  /** @protected */
  _isElementCausesFosterParenting(tn) {
    return TABLE_STRUCTURE_TAGS.has(tn);
  }
  /** @protected */
  _shouldFosterParentOnInsertion() {
    return this.fosterParentingEnabled && this.openElements.currentTagId !== void 0 && this._isElementCausesFosterParenting(this.openElements.currentTagId);
  }
  /** @protected */
  _findFosterParentingLocation() {
    for (let i = this.openElements.stackTop; i >= 0; i--) {
      const openElement = this.openElements.items[i];
      switch (this.openElements.tagIDs[i]) {
        case TAG_ID.TEMPLATE: {
          if (this.treeAdapter.getNamespaceURI(openElement) === NS.HTML) {
            return { parent: this.treeAdapter.getTemplateContent(openElement), beforeElement: null };
          }
          break;
        }
        case TAG_ID.TABLE: {
          const parent = this.treeAdapter.getParentNode(openElement);
          if (parent) {
            return { parent, beforeElement: openElement };
          }
          return { parent: this.openElements.items[i - 1], beforeElement: null };
        }
        default:
      }
    }
    return { parent: this.openElements.items[0], beforeElement: null };
  }
  /** @protected */
  _fosterParentElement(element) {
    const location = this._findFosterParentingLocation();
    if (location.beforeElement) {
      this.treeAdapter.insertBefore(location.parent, element, location.beforeElement);
    } else {
      this.treeAdapter.appendChild(location.parent, element);
    }
  }
  //Special elements
  /** @protected */
  _isSpecialElement(element, id) {
    const ns = this.treeAdapter.getNamespaceURI(element);
    return SPECIAL_ELEMENTS[ns].has(id);
  }
  /** @internal */
  onCharacter(token) {
    this.skipNextNewLine = false;
    if (this.tokenizer.inForeignNode) {
      characterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE: {
        characterInBody(this, token);
        break;
      }
      case InsertionMode.TEXT:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        characterInTableText(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onNullCharacter(token) {
    this.skipNextNewLine = false;
    if (this.tokenizer.inForeignNode) {
      nullCharacterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onComment(token) {
    this.skipNextNewLine = false;
    if (this.currentNotInHTML) {
      appendComment(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL:
      case InsertionMode.BEFORE_HTML:
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        appendComment(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        appendCommentToRootHtmlElement(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        appendCommentToDocument(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onDoctype(token) {
    this.skipNextNewLine = false;
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        doctypeInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD: {
        this._err(token, ERR.misplacedDoctype);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onStartTag(token) {
    this.skipNextNewLine = false;
    this.currentToken = token;
    this._processStartTag(token);
    if (token.selfClosing && !token.ackSelfClosing) {
      this._err(token, ERR.nonVoidHtmlElementStartTagWithTrailingSolidus);
    }
  }
  /**
   * Processes a given start tag.
   *
   * `onStartTag` checks if a self-closing tag was recognized. When a token
   * is moved inbetween multiple insertion modes, this check for self-closing
   * could lead to false positives. To avoid this, `_processStartTag` is used
   * for nested calls.
   *
   * @param token The token to process.
   * @protected
   */
  _processStartTag(token) {
    if (this.shouldProcessStartTagTokenInForeignContent(token)) {
      startTagInForeignContent(this, token);
    } else {
      this._startTagOutsideForeignContent(token);
    }
  }
  /** @protected */
  _startTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        startTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        startTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        startTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        startTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        startTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        startTagInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        startTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        startTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        startTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        startTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        startTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        startTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        startTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        startTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        startTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        startTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        startTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        startTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        startTagAfterAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        startTagAfterAfterFrameset(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEndTag(token) {
    this.skipNextNewLine = false;
    this.currentToken = token;
    if (this.currentNotInHTML) {
      endTagInForeignContent(this, token);
    } else {
      this._endTagOutsideForeignContent(token);
    }
  }
  /** @protected */
  _endTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        endTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        endTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        endTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        endTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        endTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        endTagInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        endTagInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        endTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        endTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        endTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        endTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        endTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        endTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        endTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        endTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        endTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        endTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        endTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        endTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEof(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        eofInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        eofInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        eofInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        stopParsing(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onWhitespaceCharacter(token) {
    if (this.skipNextNewLine) {
      this.skipNextNewLine = false;
      if (token.chars.charCodeAt(0) === CODE_POINTS.LINE_FEED) {
        if (token.chars.length === 1) {
          return;
        }
        token.chars = token.chars.substr(1);
      }
    }
    if (this.tokenizer.inForeignNode) {
      this._insertCharacters(token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.TEXT:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.AFTER_BODY:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        whitespaceCharacterInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        whitespaceCharacterInTableText(this, token);
        break;
      }
      default:
    }
  }
};
function aaObtainFormattingElementEntry(p, token) {
  let formattingElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(token.tagName);
  if (formattingElementEntry) {
    if (!p.openElements.contains(formattingElementEntry.element)) {
      p.activeFormattingElements.removeEntry(formattingElementEntry);
      formattingElementEntry = null;
    } else if (!p.openElements.hasInScope(token.tagID)) {
      formattingElementEntry = null;
    }
  } else {
    genericEndTagInBody(p, token);
  }
  return formattingElementEntry;
}
function aaObtainFurthestBlock(p, formattingElementEntry) {
  let furthestBlock = null;
  let idx = p.openElements.stackTop;
  for (; idx >= 0; idx--) {
    const element = p.openElements.items[idx];
    if (element === formattingElementEntry.element) {
      break;
    }
    if (p._isSpecialElement(element, p.openElements.tagIDs[idx])) {
      furthestBlock = element;
    }
  }
  if (!furthestBlock) {
    p.openElements.shortenToLength(Math.max(idx, 0));
    p.activeFormattingElements.removeEntry(formattingElementEntry);
  }
  return furthestBlock;
}
function aaInnerLoop(p, furthestBlock, formattingElement) {
  let lastElement = furthestBlock;
  let nextElement = p.openElements.getCommonAncestor(furthestBlock);
  for (let i = 0, element = nextElement; element !== formattingElement; i++, element = nextElement) {
    nextElement = p.openElements.getCommonAncestor(element);
    const elementEntry = p.activeFormattingElements.getElementEntry(element);
    const counterOverflow = elementEntry && i >= AA_INNER_LOOP_ITER;
    const shouldRemoveFromOpenElements = !elementEntry || counterOverflow;
    if (shouldRemoveFromOpenElements) {
      if (counterOverflow) {
        p.activeFormattingElements.removeEntry(elementEntry);
      }
      p.openElements.remove(element);
    } else {
      element = aaRecreateElementFromEntry(p, elementEntry);
      if (lastElement === furthestBlock) {
        p.activeFormattingElements.bookmark = elementEntry;
      }
      p.treeAdapter.detachNode(lastElement);
      p.treeAdapter.appendChild(element, lastElement);
      lastElement = element;
    }
  }
  return lastElement;
}
function aaRecreateElementFromEntry(p, elementEntry) {
  const ns = p.treeAdapter.getNamespaceURI(elementEntry.element);
  const newElement = p.treeAdapter.createElement(elementEntry.token.tagName, ns, elementEntry.token.attrs);
  p.openElements.replace(elementEntry.element, newElement);
  elementEntry.element = newElement;
  return newElement;
}
function aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement) {
  const tn = p.treeAdapter.getTagName(commonAncestor);
  const tid = getTagID(tn);
  if (p._isElementCausesFosterParenting(tid)) {
    p._fosterParentElement(lastElement);
  } else {
    const ns = p.treeAdapter.getNamespaceURI(commonAncestor);
    if (tid === TAG_ID.TEMPLATE && ns === NS.HTML) {
      commonAncestor = p.treeAdapter.getTemplateContent(commonAncestor);
    }
    p.treeAdapter.appendChild(commonAncestor, lastElement);
  }
}
function aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry) {
  const ns = p.treeAdapter.getNamespaceURI(formattingElementEntry.element);
  const { token } = formattingElementEntry;
  const newElement = p.treeAdapter.createElement(token.tagName, ns, token.attrs);
  p._adoptNodes(furthestBlock, newElement);
  p.treeAdapter.appendChild(furthestBlock, newElement);
  p.activeFormattingElements.insertElementAfterBookmark(newElement, token);
  p.activeFormattingElements.removeEntry(formattingElementEntry);
  p.openElements.remove(formattingElementEntry.element);
  p.openElements.insertAfter(furthestBlock, newElement, token.tagID);
}
function callAdoptionAgency(p, token) {
  for (let i = 0; i < AA_OUTER_LOOP_ITER; i++) {
    const formattingElementEntry = aaObtainFormattingElementEntry(p, token);
    if (!formattingElementEntry) {
      break;
    }
    const furthestBlock = aaObtainFurthestBlock(p, formattingElementEntry);
    if (!furthestBlock) {
      break;
    }
    p.activeFormattingElements.bookmark = formattingElementEntry;
    const lastElement = aaInnerLoop(p, furthestBlock, formattingElementEntry.element);
    const commonAncestor = p.openElements.getCommonAncestor(formattingElementEntry.element);
    p.treeAdapter.detachNode(lastElement);
    if (commonAncestor)
      aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement);
    aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry);
  }
}
function appendComment(p, token) {
  p._appendCommentNode(token, p.openElements.currentTmplContentOrNode);
}
function appendCommentToRootHtmlElement(p, token) {
  p._appendCommentNode(token, p.openElements.items[0]);
}
function appendCommentToDocument(p, token) {
  p._appendCommentNode(token, p.document);
}
function stopParsing(p, token) {
  p.stopped = true;
  if (token.location) {
    const target = p.fragmentContext ? 0 : 2;
    for (let i = p.openElements.stackTop; i >= target; i--) {
      p._setEndLocation(p.openElements.items[i], token);
    }
    if (!p.fragmentContext && p.openElements.stackTop >= 0) {
      const htmlElement = p.openElements.items[0];
      const htmlLocation = p.treeAdapter.getNodeSourceCodeLocation(htmlElement);
      if (htmlLocation && !htmlLocation.endTag) {
        p._setEndLocation(htmlElement, token);
        if (p.openElements.stackTop >= 1) {
          const bodyElement = p.openElements.items[1];
          const bodyLocation = p.treeAdapter.getNodeSourceCodeLocation(bodyElement);
          if (bodyLocation && !bodyLocation.endTag) {
            p._setEndLocation(bodyElement, token);
          }
        }
      }
    }
  }
}
function doctypeInInitialMode(p, token) {
  p._setDocumentType(token);
  const mode = token.forceQuirks ? DOCUMENT_MODE.QUIRKS : getDocumentMode(token);
  if (!isConforming(token)) {
    p._err(token, ERR.nonConformingDoctype);
  }
  p.treeAdapter.setDocumentMode(p.document, mode);
  p.insertionMode = InsertionMode.BEFORE_HTML;
}
function tokenInInitialMode(p, token) {
  p._err(token, ERR.missingDoctype, true);
  p.treeAdapter.setDocumentMode(p.document, DOCUMENT_MODE.QUIRKS);
  p.insertionMode = InsertionMode.BEFORE_HTML;
  p._processToken(token);
}
function startTagBeforeHtml(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.BEFORE_HEAD;
  } else {
    tokenBeforeHtml(p, token);
  }
}
function endTagBeforeHtml(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.HTML || tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.BR) {
    tokenBeforeHtml(p, token);
  }
}
function tokenBeforeHtml(p, token) {
  p._insertFakeRootElement();
  p.insertionMode = InsertionMode.BEFORE_HEAD;
  p._processToken(token);
}
function startTagBeforeHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.HEAD: {
      p._insertElement(token, NS.HTML);
      p.headElement = p.openElements.current;
      p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    default: {
      tokenBeforeHead(p, token);
    }
  }
}
function endTagBeforeHead(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.HTML || tn === TAG_ID.BR) {
    tokenBeforeHead(p, token);
  } else {
    p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenBeforeHead(p, token) {
  p._insertFakeElement(TAG_NAMES.HEAD, TAG_ID.HEAD);
  p.headElement = p.openElements.current;
  p.insertionMode = InsertionMode.IN_HEAD;
  p._processToken(token);
}
function startTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.TITLE: {
      p._switchToTextParsing(token, TokenizerMode.RCDATA);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      if (p.options.scriptingEnabled) {
        p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
      } else {
        p._insertElement(token, NS.HTML);
        p.insertionMode = InsertionMode.IN_HEAD_NO_SCRIPT;
      }
      break;
    }
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
      break;
    }
    case TAG_ID.SCRIPT: {
      p._switchToTextParsing(token, TokenizerMode.SCRIPT_DATA);
      break;
    }
    case TAG_ID.TEMPLATE: {
      p._insertTemplate(token);
      p.activeFormattingElements.insertMarker();
      p.framesetOk = false;
      p.insertionMode = InsertionMode.IN_TEMPLATE;
      p.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default: {
      tokenInHead(p, token);
    }
  }
}
function endTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HEAD: {
      p.openElements.pop();
      p.insertionMode = InsertionMode.AFTER_HEAD;
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.BR:
    case TAG_ID.HTML: {
      tokenInHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function templateEndTagInHead(p, token) {
  if (p.openElements.tmplCount > 0) {
    p.openElements.generateImpliedEndTagsThoroughly();
    if (p.openElements.currentTagId !== TAG_ID.TEMPLATE) {
      p._err(token, ERR.closingOfElementWithOpenChildElements);
    }
    p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
    p.activeFormattingElements.clearToLastMarker();
    p.tmplInsertionModeStack.shift();
    p._resetInsertionMode();
  } else {
    p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenInHead(p, token) {
  p.openElements.pop();
  p.insertionMode = InsertionMode.AFTER_HEAD;
  p._processToken(token);
}
function startTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.HEAD:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      p._err(token, ERR.nestedNoscriptInHead);
      break;
    }
    default: {
      tokenInHeadNoScript(p, token);
    }
  }
}
function endTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.NOSCRIPT: {
      p.openElements.pop();
      p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    case TAG_ID.BR: {
      tokenInHeadNoScript(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function tokenInHeadNoScript(p, token) {
  const errCode = token.type === TokenType.EOF ? ERR.openElementsLeftAfterEof : ERR.disallowedContentInNoscriptInHead;
  p._err(token, errCode);
  p.openElements.pop();
  p.insertionMode = InsertionMode.IN_HEAD;
  p._processToken(token);
}
function startTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BODY: {
      p._insertElement(token, NS.HTML);
      p.framesetOk = false;
      p.insertionMode = InsertionMode.IN_BODY;
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_FRAMESET;
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      p._err(token, ERR.abandonedHeadElementChild);
      p.openElements.push(p.headElement, TAG_ID.HEAD);
      startTagInHead(p, token);
      p.openElements.remove(p.headElement);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default: {
      tokenAfterHead(p, token);
    }
  }
}
function endTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.BODY:
    case TAG_ID.HTML:
    case TAG_ID.BR: {
      tokenAfterHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function tokenAfterHead(p, token) {
  p._insertFakeElement(TAG_NAMES.BODY, TAG_ID.BODY);
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function modeInBody(p, token) {
  switch (token.type) {
    case TokenType.CHARACTER: {
      characterInBody(p, token);
      break;
    }
    case TokenType.WHITESPACE_CHARACTER: {
      whitespaceCharacterInBody(p, token);
      break;
    }
    case TokenType.COMMENT: {
      appendComment(p, token);
      break;
    }
    case TokenType.START_TAG: {
      startTagInBody(p, token);
      break;
    }
    case TokenType.END_TAG: {
      endTagInBody(p, token);
      break;
    }
    case TokenType.EOF: {
      eofInBody(p, token);
      break;
    }
    default:
  }
}
function whitespaceCharacterInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertCharacters(token);
}
function characterInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertCharacters(token);
  p.framesetOk = false;
}
function htmlStartTagInBody(p, token) {
  if (p.openElements.tmplCount === 0) {
    p.treeAdapter.adoptAttributes(p.openElements.items[0], token.attrs);
  }
}
function bodyStartTagInBody(p, token) {
  const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  if (bodyElement && p.openElements.tmplCount === 0) {
    p.framesetOk = false;
    p.treeAdapter.adoptAttributes(bodyElement, token.attrs);
  }
}
function framesetStartTagInBody(p, token) {
  const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  if (p.framesetOk && bodyElement) {
    p.treeAdapter.detachNode(bodyElement);
    p.openElements.popAllUpToHtmlElement();
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.IN_FRAMESET;
  }
}
function addressStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
}
function numberedHeaderStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  if (p.openElements.currentTagId !== void 0 && NUMBERED_HEADERS.has(p.openElements.currentTagId)) {
    p.openElements.pop();
  }
  p._insertElement(token, NS.HTML);
}
function preStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.skipNextNewLine = true;
  p.framesetOk = false;
}
function formStartTagInBody(p, token) {
  const inTemplate = p.openElements.tmplCount > 0;
  if (!p.formElement || inTemplate) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
    if (!inTemplate) {
      p.formElement = p.openElements.current;
    }
  }
}
function listItemStartTagInBody(p, token) {
  p.framesetOk = false;
  const tn = token.tagID;
  for (let i = p.openElements.stackTop; i >= 0; i--) {
    const elementId = p.openElements.tagIDs[i];
    if (tn === TAG_ID.LI && elementId === TAG_ID.LI || (tn === TAG_ID.DD || tn === TAG_ID.DT) && (elementId === TAG_ID.DD || elementId === TAG_ID.DT)) {
      p.openElements.generateImpliedEndTagsWithExclusion(elementId);
      p.openElements.popUntilTagNamePopped(elementId);
      break;
    }
    if (elementId !== TAG_ID.ADDRESS && elementId !== TAG_ID.DIV && elementId !== TAG_ID.P && p._isSpecialElement(p.openElements.items[i], elementId)) {
      break;
    }
  }
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
}
function plaintextStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.tokenizer.state = TokenizerMode.PLAINTEXT;
}
function buttonStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BUTTON)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(TAG_ID.BUTTON);
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
}
function aStartTagInBody(p, token) {
  const activeElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(TAG_NAMES.A);
  if (activeElementEntry) {
    callAdoptionAgency(p, token);
    p.openElements.remove(activeElementEntry.element);
    p.activeFormattingElements.removeEntry(activeElementEntry);
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function bStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function nobrStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  if (p.openElements.hasInScope(TAG_ID.NOBR)) {
    callAdoptionAgency(p, token);
    p._reconstructActiveFormattingElements();
  }
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function appletStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.insertMarker();
  p.framesetOk = false;
}
function tableStartTagInBody(p, token) {
  if (p.treeAdapter.getDocumentMode(p.document) !== DOCUMENT_MODE.QUIRKS && p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
  p.insertionMode = InsertionMode.IN_TABLE;
}
function areaStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._appendElement(token, NS.HTML);
  p.framesetOk = false;
  token.ackSelfClosing = true;
}
function isHiddenInput(token) {
  const inputType = getTokenAttr(token, ATTRS.TYPE);
  return inputType != null && inputType.toLowerCase() === HIDDEN_INPUT_TYPE;
}
function inputStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._appendElement(token, NS.HTML);
  if (!isHiddenInput(token)) {
    p.framesetOk = false;
  }
  token.ackSelfClosing = true;
}
function paramStartTagInBody(p, token) {
  p._appendElement(token, NS.HTML);
  token.ackSelfClosing = true;
}
function hrStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._appendElement(token, NS.HTML);
  p.framesetOk = false;
  token.ackSelfClosing = true;
}
function imageStartTagInBody(p, token) {
  token.tagName = TAG_NAMES.IMG;
  token.tagID = TAG_ID.IMG;
  areaStartTagInBody(p, token);
}
function textareaStartTagInBody(p, token) {
  p._insertElement(token, NS.HTML);
  p.skipNextNewLine = true;
  p.tokenizer.state = TokenizerMode.RCDATA;
  p.originalInsertionMode = p.insertionMode;
  p.framesetOk = false;
  p.insertionMode = InsertionMode.TEXT;
}
function xmpStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._reconstructActiveFormattingElements();
  p.framesetOk = false;
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function iframeStartTagInBody(p, token) {
  p.framesetOk = false;
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function rawTextStartTagInBody(p, token) {
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function selectStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
  p.insertionMode = p.insertionMode === InsertionMode.IN_TABLE || p.insertionMode === InsertionMode.IN_CAPTION || p.insertionMode === InsertionMode.IN_TABLE_BODY || p.insertionMode === InsertionMode.IN_ROW || p.insertionMode === InsertionMode.IN_CELL ? InsertionMode.IN_SELECT_IN_TABLE : InsertionMode.IN_SELECT;
}
function optgroupStartTagInBody(p, token) {
  if (p.openElements.currentTagId === TAG_ID.OPTION) {
    p.openElements.pop();
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
}
function rbStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.RUBY)) {
    p.openElements.generateImpliedEndTags();
  }
  p._insertElement(token, NS.HTML);
}
function rtStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.RUBY)) {
    p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.RTC);
  }
  p._insertElement(token, NS.HTML);
}
function mathStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  adjustTokenMathMLAttrs(token);
  adjustTokenXMLAttrs(token);
  if (token.selfClosing) {
    p._appendElement(token, NS.MATHML);
  } else {
    p._insertElement(token, NS.MATHML);
  }
  token.ackSelfClosing = true;
}
function svgStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  adjustTokenSVGAttrs(token);
  adjustTokenXMLAttrs(token);
  if (token.selfClosing) {
    p._appendElement(token, NS.SVG);
  } else {
    p._insertElement(token, NS.SVG);
  }
  token.ackSelfClosing = true;
}
function genericStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
}
function startTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.B:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      bStartTagInBody(p, token);
      break;
    }
    case TAG_ID.A: {
      aStartTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderStartTagInBody(p, token);
      break;
    }
    case TAG_ID.P:
    case TAG_ID.DL:
    case TAG_ID.OL:
    case TAG_ID.UL:
    case TAG_ID.DIV:
    case TAG_ID.DIR:
    case TAG_ID.NAV:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.DETAILS:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressStartTagInBody(p, token);
      break;
    }
    case TAG_ID.LI:
    case TAG_ID.DD:
    case TAG_ID.DT: {
      listItemStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BR:
    case TAG_ID.IMG:
    case TAG_ID.WBR:
    case TAG_ID.AREA:
    case TAG_ID.EMBED:
    case TAG_ID.KEYGEN: {
      areaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HR: {
      hrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RB:
    case TAG_ID.RTC: {
      rbStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RT:
    case TAG_ID.RP: {
      rtStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PRE:
    case TAG_ID.LISTING: {
      preStartTagInBody(p, token);
      break;
    }
    case TAG_ID.XMP: {
      xmpStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SVG: {
      svgStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.STYLE:
    case TAG_ID.TITLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.BGSOUND:
    case TAG_ID.BASEFONT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY: {
      bodyStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOBR: {
      nobrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.MATH: {
      mathStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInBody(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PARAM:
    case TAG_ID.TRACK:
    case TAG_ID.SOURCE: {
      paramStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IMAGE: {
      imageStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BUTTON: {
      buttonStartTagInBody(p, token);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IFRAME: {
      iframeStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SELECT: {
      selectStartTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION:
    case TAG_ID.OPTGROUP: {
      optgroupStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOEMBED:
    case TAG_ID.NOFRAMES: {
      rawTextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      framesetStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TEXTAREA: {
      textareaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      if (p.options.scriptingEnabled) {
        rawTextStartTagInBody(p, token);
      } else {
        genericStartTagInBody(p, token);
      }
      break;
    }
    case TAG_ID.PLAINTEXT: {
      plaintextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.COL:
    case TAG_ID.TH:
    case TAG_ID.TD:
    case TAG_ID.TR:
    case TAG_ID.HEAD:
    case TAG_ID.FRAME:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP: {
      break;
    }
    default: {
      genericStartTagInBody(p, token);
    }
  }
}
function bodyEndTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BODY)) {
    p.insertionMode = InsertionMode.AFTER_BODY;
    if (p.options.sourceCodeLocationInfo) {
      const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
      if (bodyElement) {
        p._setEndLocation(bodyElement, token);
      }
    }
  }
}
function htmlEndTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BODY)) {
    p.insertionMode = InsertionMode.AFTER_BODY;
    endTagAfterBody(p, token);
  }
}
function addressEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(tn);
  }
}
function formEndTagInBody(p) {
  const inTemplate = p.openElements.tmplCount > 0;
  const { formElement } = p;
  if (!inTemplate) {
    p.formElement = null;
  }
  if ((formElement || inTemplate) && p.openElements.hasInScope(TAG_ID.FORM)) {
    p.openElements.generateImpliedEndTags();
    if (inTemplate) {
      p.openElements.popUntilTagNamePopped(TAG_ID.FORM);
    } else if (formElement) {
      p.openElements.remove(formElement);
    }
  }
}
function pEndTagInBody(p) {
  if (!p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._insertFakeElement(TAG_NAMES.P, TAG_ID.P);
  }
  p._closePElement();
}
function liEndTagInBody(p) {
  if (p.openElements.hasInListItemScope(TAG_ID.LI)) {
    p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.LI);
    p.openElements.popUntilTagNamePopped(TAG_ID.LI);
  }
}
function ddEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTagsWithExclusion(tn);
    p.openElements.popUntilTagNamePopped(tn);
  }
}
function numberedHeaderEndTagInBody(p) {
  if (p.openElements.hasNumberedHeaderInScope()) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilNumberedHeaderPopped();
  }
}
function appletEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(tn);
    p.activeFormattingElements.clearToLastMarker();
  }
}
function brEndTagInBody(p) {
  p._reconstructActiveFormattingElements();
  p._insertFakeElement(TAG_NAMES.BR, TAG_ID.BR);
  p.openElements.pop();
  p.framesetOk = false;
}
function genericEndTagInBody(p, token) {
  const tn = token.tagName;
  const tid = token.tagID;
  for (let i = p.openElements.stackTop; i > 0; i--) {
    const element = p.openElements.items[i];
    const elementId = p.openElements.tagIDs[i];
    if (tid === elementId && (tid !== TAG_ID.UNKNOWN || p.treeAdapter.getTagName(element) === tn)) {
      p.openElements.generateImpliedEndTagsWithExclusion(tid);
      if (p.openElements.stackTop >= i)
        p.openElements.shortenToLength(i);
      break;
    }
    if (p._isSpecialElement(element, elementId)) {
      break;
    }
  }
}
function endTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.A:
    case TAG_ID.B:
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.NOBR:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      callAdoptionAgency(p, token);
      break;
    }
    case TAG_ID.P: {
      pEndTagInBody(p);
      break;
    }
    case TAG_ID.DL:
    case TAG_ID.UL:
    case TAG_ID.OL:
    case TAG_ID.DIR:
    case TAG_ID.DIV:
    case TAG_ID.NAV:
    case TAG_ID.PRE:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.BUTTON:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.DETAILS:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.LISTING:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressEndTagInBody(p, token);
      break;
    }
    case TAG_ID.LI: {
      liEndTagInBody(p);
      break;
    }
    case TAG_ID.DD:
    case TAG_ID.DT: {
      ddEndTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderEndTagInBody(p);
      break;
    }
    case TAG_ID.BR: {
      brEndTagInBody(p);
      break;
    }
    case TAG_ID.BODY: {
      bodyEndTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlEndTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formEndTagInBody(p);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletEndTagInBody(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      genericEndTagInBody(p, token);
    }
  }
}
function eofInBody(p, token) {
  if (p.tmplInsertionModeStack.length > 0) {
    eofInTemplate(p, token);
  } else {
    stopParsing(p, token);
  }
}
function endTagInText(p, token) {
  var _a;
  if (token.tagID === TAG_ID.SCRIPT) {
    (_a = p.scriptHandler) === null || _a === void 0 ? void 0 : _a.call(p, p.openElements.current);
  }
  p.openElements.pop();
  p.insertionMode = p.originalInsertionMode;
}
function eofInText(p, token) {
  p._err(token, ERR.eofInElementThatCanContainOnlyText);
  p.openElements.pop();
  p.insertionMode = p.originalInsertionMode;
  p.onEof(token);
}
function characterInTable(p, token) {
  if (p.openElements.currentTagId !== void 0 && TABLE_STRUCTURE_TAGS.has(p.openElements.currentTagId)) {
    p.pendingCharacterTokens.length = 0;
    p.hasNonWhitespacePendingCharacterToken = false;
    p.originalInsertionMode = p.insertionMode;
    p.insertionMode = InsertionMode.IN_TABLE_TEXT;
    switch (token.type) {
      case TokenType.CHARACTER: {
        characterInTableText(p, token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        whitespaceCharacterInTableText(p, token);
        break;
      }
    }
  } else {
    tokenInTable(p, token);
  }
}
function captionStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p.activeFormattingElements.insertMarker();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_CAPTION;
}
function colgroupStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
}
function colStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertFakeElement(TAG_NAMES.COLGROUP, TAG_ID.COLGROUP);
  p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
  startTagInColumnGroup(p, token);
}
function tbodyStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_TABLE_BODY;
}
function tdStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertFakeElement(TAG_NAMES.TBODY, TAG_ID.TBODY);
  p.insertionMode = InsertionMode.IN_TABLE_BODY;
  startTagInTableBody(p, token);
}
function tableStartTagInTable(p, token) {
  if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
    p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
    p._resetInsertionMode();
    p._processStartTag(token);
  }
}
function inputStartTagInTable(p, token) {
  if (isHiddenInput(token)) {
    p._appendElement(token, NS.HTML);
  } else {
    tokenInTable(p, token);
  }
  token.ackSelfClosing = true;
}
function formStartTagInTable(p, token) {
  if (!p.formElement && p.openElements.tmplCount === 0) {
    p._insertElement(token, NS.HTML);
    p.formElement = p.openElements.current;
    p.openElements.pop();
  }
}
function startTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR: {
      tdStartTagInTable(p, token);
      break;
    }
    case TAG_ID.STYLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.COL: {
      colStartTagInTable(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      tbodyStartTagInTable(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInTable(p, token);
      break;
    }
    case TAG_ID.CAPTION: {
      captionStartTagInTable(p, token);
      break;
    }
    case TAG_ID.COLGROUP: {
      colgroupStartTagInTable(p, token);
      break;
    }
    default: {
      tokenInTable(p, token);
    }
  }
}
function endTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
        p._resetInsertionMode();
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      break;
    }
    default: {
      tokenInTable(p, token);
    }
  }
}
function tokenInTable(p, token) {
  const savedFosterParentingState = p.fosterParentingEnabled;
  p.fosterParentingEnabled = true;
  modeInBody(p, token);
  p.fosterParentingEnabled = savedFosterParentingState;
}
function whitespaceCharacterInTableText(p, token) {
  p.pendingCharacterTokens.push(token);
}
function characterInTableText(p, token) {
  p.pendingCharacterTokens.push(token);
  p.hasNonWhitespacePendingCharacterToken = true;
}
function tokenInTableText(p, token) {
  let i = 0;
  if (p.hasNonWhitespacePendingCharacterToken) {
    for (; i < p.pendingCharacterTokens.length; i++) {
      tokenInTable(p, p.pendingCharacterTokens[i]);
    }
  } else {
    for (; i < p.pendingCharacterTokens.length; i++) {
      p._insertCharacters(p.pendingCharacterTokens[i]);
    }
  }
  p.insertionMode = p.originalInsertionMode;
  p._processToken(token);
}
var TABLE_VOID_ELEMENTS = /* @__PURE__ */ new Set([TAG_ID.CAPTION, TAG_ID.COL, TAG_ID.COLGROUP, TAG_ID.TBODY, TAG_ID.TD, TAG_ID.TFOOT, TAG_ID.TH, TAG_ID.THEAD, TAG_ID.TR]);
function startTagInCaption(p, token) {
  const tn = token.tagID;
  if (TABLE_VOID_ELEMENTS.has(tn)) {
    if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
      p.activeFormattingElements.clearToLastMarker();
      p.insertionMode = InsertionMode.IN_TABLE;
      startTagInTable(p, token);
    }
  } else {
    startTagInBody(p, token);
  }
}
function endTagInCaption(p, token) {
  const tn = token.tagID;
  switch (tn) {
    case TAG_ID.CAPTION:
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
        p.openElements.generateImpliedEndTags();
        p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
        p.activeFormattingElements.clearToLastMarker();
        p.insertionMode = InsertionMode.IN_TABLE;
        if (tn === TAG_ID.TABLE) {
          endTagInTable(p, token);
        }
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      break;
    }
    default: {
      endTagInBody(p, token);
    }
  }
}
function startTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.COL: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default: {
      tokenInColumnGroup(p, token);
    }
  }
}
function endTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.COLGROUP: {
      if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.COL: {
      break;
    }
    default: {
      tokenInColumnGroup(p, token);
    }
  }
}
function tokenInColumnGroup(p, token) {
  if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
    p.openElements.pop();
    p.insertionMode = InsertionMode.IN_TABLE;
    p._processToken(token);
  }
}
function startTagInTableBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      p.openElements.clearBackToTableBodyContext();
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_ROW;
      break;
    }
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableBodyContext();
      p._insertFakeElement(TAG_NAMES.TR, TAG_ID.TR);
      p.insertionMode = InsertionMode.IN_ROW;
      startTagInRow(p, token);
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasTableBodyContextInTableScope()) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
        startTagInTable(p, token);
      }
      break;
    }
    default: {
      startTagInTable(p, token);
    }
  }
}
function endTagInTableBody(p, token) {
  const tn = token.tagID;
  switch (token.tagID) {
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasInTableScope(tn)) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
      }
      break;
    }
    case TAG_ID.TABLE: {
      if (p.openElements.hasTableBodyContextInTableScope()) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
        endTagInTable(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR: {
      break;
    }
    default: {
      endTagInTable(p, token);
    }
  }
}
function startTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableRowContext();
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_CELL;
      p.activeFormattingElements.insertMarker();
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        startTagInTableBody(p, token);
      }
      break;
    }
    default: {
      startTagInTable(p, token);
    }
  }
}
function endTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
      }
      break;
    }
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        endTagInTableBody(p, token);
      }
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasInTableScope(token.tagID) || p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        endTagInTableBody(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH: {
      break;
    }
    default: {
      endTagInTable(p, token);
    }
  }
}
function startTagInCell(p, token) {
  const tn = token.tagID;
  if (TABLE_VOID_ELEMENTS.has(tn)) {
    if (p.openElements.hasInTableScope(TAG_ID.TD) || p.openElements.hasInTableScope(TAG_ID.TH)) {
      p._closeTableCell();
      startTagInRow(p, token);
    }
  } else {
    startTagInBody(p, token);
  }
}
function endTagInCell(p, token) {
  const tn = token.tagID;
  switch (tn) {
    case TAG_ID.TD:
    case TAG_ID.TH: {
      if (p.openElements.hasInTableScope(tn)) {
        p.openElements.generateImpliedEndTags();
        p.openElements.popUntilTagNamePopped(tn);
        p.activeFormattingElements.clearToLastMarker();
        p.insertionMode = InsertionMode.IN_ROW;
      }
      break;
    }
    case TAG_ID.TABLE:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(tn)) {
        p._closeTableCell();
        endTagInRow(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML: {
      break;
    }
    default: {
      endTagInBody(p, token);
    }
  }
}
function startTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.OPTGROUP: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.HR: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.INPUT:
    case TAG_ID.KEYGEN:
    case TAG_ID.TEXTAREA:
    case TAG_ID.SELECT: {
      if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
        p._resetInsertionMode();
        if (token.tagID !== TAG_ID.SELECT) {
          p._processStartTag(token);
        }
      }
      break;
    }
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.OPTGROUP: {
      if (p.openElements.stackTop > 0 && p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.tagIDs[p.openElements.stackTop - 1] === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      break;
    }
    case TAG_ID.OPTION: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      break;
    }
    case TAG_ID.SELECT: {
      if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
        p._resetInsertionMode();
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
  }
}
function startTagInSelectInTable(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
    p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
    p._resetInsertionMode();
    p._processStartTag(token);
  } else {
    startTagInSelect(p, token);
  }
}
function endTagInSelectInTable(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
    if (p.openElements.hasInTableScope(tn)) {
      p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
      p._resetInsertionMode();
      p.onEndTag(token);
    }
  } else {
    endTagInSelect(p, token);
  }
}
function startTagInTemplate(p, token) {
  switch (token.tagID) {
    // First, handle tags that can start without a mode change
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      startTagInHead(p, token);
      break;
    }
    // Re-process the token in the appropriate mode
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE;
      p.insertionMode = InsertionMode.IN_TABLE;
      startTagInTable(p, token);
      break;
    }
    case TAG_ID.COL: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_COLUMN_GROUP;
      p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
      startTagInColumnGroup(p, token);
      break;
    }
    case TAG_ID.TR: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE_BODY;
      p.insertionMode = InsertionMode.IN_TABLE_BODY;
      startTagInTableBody(p, token);
      break;
    }
    case TAG_ID.TD:
    case TAG_ID.TH: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_ROW;
      p.insertionMode = InsertionMode.IN_ROW;
      startTagInRow(p, token);
      break;
    }
    default: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_BODY;
      p.insertionMode = InsertionMode.IN_BODY;
      startTagInBody(p, token);
    }
  }
}
function endTagInTemplate(p, token) {
  if (token.tagID === TAG_ID.TEMPLATE) {
    templateEndTagInHead(p, token);
  }
}
function eofInTemplate(p, token) {
  if (p.openElements.tmplCount > 0) {
    p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
    p.activeFormattingElements.clearToLastMarker();
    p.tmplInsertionModeStack.shift();
    p._resetInsertionMode();
    p.onEof(token);
  } else {
    stopParsing(p, token);
  }
}
function startTagAfterBody(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    startTagInBody(p, token);
  } else {
    tokenAfterBody(p, token);
  }
}
function endTagAfterBody(p, token) {
  var _a;
  if (token.tagID === TAG_ID.HTML) {
    if (!p.fragmentContext) {
      p.insertionMode = InsertionMode.AFTER_AFTER_BODY;
    }
    if (p.options.sourceCodeLocationInfo && p.openElements.tagIDs[0] === TAG_ID.HTML) {
      p._setEndLocation(p.openElements.items[0], token);
      const bodyElement = p.openElements.items[1];
      if (bodyElement && !((_a = p.treeAdapter.getNodeSourceCodeLocation(bodyElement)) === null || _a === void 0 ? void 0 : _a.endTag)) {
        p._setEndLocation(bodyElement, token);
      }
    }
  } else {
    tokenAfterBody(p, token);
  }
}
function tokenAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function startTagInFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.FRAME: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInFrameset(p, token) {
  if (token.tagID === TAG_ID.FRAMESET && !p.openElements.isRootHtmlElementCurrent()) {
    p.openElements.pop();
    if (!p.fragmentContext && p.openElements.currentTagId !== TAG_ID.FRAMESET) {
      p.insertionMode = InsertionMode.AFTER_FRAMESET;
    }
  }
}
function startTagAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagAfterFrameset(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    p.insertionMode = InsertionMode.AFTER_AFTER_FRAMESET;
  }
}
function startTagAfterAfterBody(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    startTagInBody(p, token);
  } else {
    tokenAfterAfterBody(p, token);
  }
}
function tokenAfterAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function startTagAfterAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function nullCharacterInForeignContent(p, token) {
  token.chars = REPLACEMENT_CHARACTER;
  p._insertCharacters(token);
}
function characterInForeignContent(p, token) {
  p._insertCharacters(token);
  p.framesetOk = false;
}
function popUntilHtmlOrIntegrationPoint(p) {
  while (p.treeAdapter.getNamespaceURI(p.openElements.current) !== NS.HTML && p.openElements.currentTagId !== void 0 && !p._isIntegrationPoint(p.openElements.currentTagId, p.openElements.current)) {
    p.openElements.pop();
  }
}
function startTagInForeignContent(p, token) {
  if (causesExit(token)) {
    popUntilHtmlOrIntegrationPoint(p);
    p._startTagOutsideForeignContent(token);
  } else {
    const current = p._getAdjustedCurrentElement();
    const currentNs = p.treeAdapter.getNamespaceURI(current);
    if (currentNs === NS.MATHML) {
      adjustTokenMathMLAttrs(token);
    } else if (currentNs === NS.SVG) {
      adjustTokenSVGTagName(token);
      adjustTokenSVGAttrs(token);
    }
    adjustTokenXMLAttrs(token);
    if (token.selfClosing) {
      p._appendElement(token, currentNs);
    } else {
      p._insertElement(token, currentNs);
    }
    token.ackSelfClosing = true;
  }
}
function endTagInForeignContent(p, token) {
  if (token.tagID === TAG_ID.P || token.tagID === TAG_ID.BR) {
    popUntilHtmlOrIntegrationPoint(p);
    p._endTagOutsideForeignContent(token);
    return;
  }
  for (let i = p.openElements.stackTop; i > 0; i--) {
    const element = p.openElements.items[i];
    if (p.treeAdapter.getNamespaceURI(element) === NS.HTML) {
      p._endTagOutsideForeignContent(token);
      break;
    }
    const tagName = p.treeAdapter.getTagName(element);
    if (tagName.toLowerCase() === token.tagName) {
      token.tagName = tagName;
      p.openElements.shortenToLength(i);
      break;
    }
  }
}

// node_modules/entities/dist/escape.js
function getEscape(char) {
  return char === 34 ? "&quot;" : char === 38 ? "&amp;" : char === 39 ? "&apos;" : char === 60 ? "&lt;" : char === 62 ? "&gt;" : "&nbsp;";
}
function escapeWithRegex(re, data) {
  re.lastIndex = 0;
  if (!re.test(data))
    return data;
  let out = "";
  let last = 0;
  do {
    const index = re.lastIndex - 1;
    if (last !== index)
      out += data.substring(last, index);
    const char = data.charCodeAt(index);
    out += getEscape(char);
    last = index + 1;
  } while (re.test(data));
  return out + data.substring(last);
}
var attributeEscapeRegex = /["&\u{A0}]/gu;
function escapeAttribute(data) {
  return escapeWithRegex(attributeEscapeRegex, data);
}
var textEscapeRegex = /[&<>\u{A0}]/gu;
function escapeText(data) {
  return escapeWithRegex(textEscapeRegex, data);
}

// node_modules/parse5/dist/serializer/index.js
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  TAG_NAMES.AREA,
  TAG_NAMES.BASE,
  TAG_NAMES.BASEFONT,
  TAG_NAMES.BGSOUND,
  TAG_NAMES.BR,
  TAG_NAMES.COL,
  TAG_NAMES.EMBED,
  TAG_NAMES.FRAME,
  TAG_NAMES.HR,
  TAG_NAMES.IMG,
  TAG_NAMES.INPUT,
  TAG_NAMES.KEYGEN,
  TAG_NAMES.LINK,
  TAG_NAMES.META,
  TAG_NAMES.PARAM,
  TAG_NAMES.SOURCE,
  TAG_NAMES.TRACK,
  TAG_NAMES.WBR
]);
function isVoidElement(node, options) {
  return options.treeAdapter.isElementNode(node) && options.treeAdapter.getNamespaceURI(node) === NS.HTML && VOID_ELEMENTS.has(options.treeAdapter.getTagName(node));
}
var defaultOpts = { treeAdapter: defaultTreeAdapter, scriptingEnabled: true };
function serialize(node, options) {
  const opts = { ...defaultOpts, ...options };
  if (isVoidElement(node, opts)) {
    return "";
  }
  return serializeChildNodes(node, opts);
}
function serializeChildNodes(parentNode, options) {
  let html = "";
  const container = options.treeAdapter.isElementNode(parentNode) && options.treeAdapter.getTagName(parentNode) === TAG_NAMES.TEMPLATE && options.treeAdapter.getNamespaceURI(parentNode) === NS.HTML ? options.treeAdapter.getTemplateContent(parentNode) : parentNode;
  const childNodes = options.treeAdapter.getChildNodes(container);
  if (childNodes) {
    for (const currentNode of childNodes) {
      html += serializeNode(currentNode, options);
    }
  }
  return html;
}
function serializeNode(node, options) {
  if (options.treeAdapter.isElementNode(node)) {
    return serializeElement(node, options);
  }
  if (options.treeAdapter.isTextNode(node)) {
    return serializeTextNode(node, options);
  }
  if (options.treeAdapter.isCommentNode(node)) {
    return serializeCommentNode(node, options);
  }
  if (options.treeAdapter.isDocumentTypeNode(node)) {
    return serializeDocumentTypeNode(node, options);
  }
  return "";
}
function serializeElement(node, options) {
  const tn = options.treeAdapter.getTagName(node);
  return `<${tn}${serializeAttributes(node, options)}>${isVoidElement(node, options) ? "" : `${serializeChildNodes(node, options)}</${tn}>`}`;
}
function serializeAttributes(node, { treeAdapter }) {
  let html = "";
  for (const attr of treeAdapter.getAttrList(node)) {
    html += " ";
    if (attr.namespace) {
      switch (attr.namespace) {
        case NS.XML: {
          html += `xml:${attr.name}`;
          break;
        }
        case NS.XMLNS: {
          if (attr.name !== "xmlns") {
            html += "xmlns:";
          }
          html += attr.name;
          break;
        }
        case NS.XLINK: {
          html += `xlink:${attr.name}`;
          break;
        }
        default: {
          html += `${attr.prefix}:${attr.name}`;
        }
      }
    } else {
      html += attr.name;
    }
    html += `="${escapeAttribute(attr.value)}"`;
  }
  return html;
}
function serializeTextNode(node, options) {
  const { treeAdapter } = options;
  const content = treeAdapter.getTextNodeContent(node);
  const parent = treeAdapter.getParentNode(node);
  const parentTn = parent && treeAdapter.isElementNode(parent) && treeAdapter.getTagName(parent);
  return parentTn && treeAdapter.getNamespaceURI(parent) === NS.HTML && hasUnescapedText(parentTn, options.scriptingEnabled) ? content : escapeText(content);
}
function serializeCommentNode(node, { treeAdapter }) {
  return `<!--${treeAdapter.getCommentNodeContent(node)}-->`;
}
function serializeDocumentTypeNode(node, { treeAdapter }) {
  return `<!DOCTYPE ${treeAdapter.getDocumentTypeNodeName(node)}>`;
}

// node_modules/parse5/dist/index.js
function parse(html, options) {
  return Parser.parse(html, options);
}

// src/domain/html/document.ts
var XHTML = "http://www.w3.org/1999/xhtml";
function injectKernel(source, options) {
  const authored = parseAuthored(source);
  if (authored) {
    return injectInto(authored, options);
  }
  return wrapFragment(source, options);
}
function directChild(parent, tagName) {
  for (const child of parent.childNodes) {
    if (defaultTreeAdapter.isElementNode(child) && child.tagName === tagName && child.namespaceURI === XHTML) {
      return child;
    }
  }
  return null;
}
function parseAuthored(source) {
  const text = source.charCodeAt(0) === 65279 ? source.slice(1) : source;
  const document = parse(text, { scriptingEnabled: true, sourceCodeLocationInfo: true });
  const html = directChild(document, "html");
  if (!html) return null;
  const head = directChild(html, "head");
  const body = directChild(html, "body");
  const frameset = directChild(html, "frameset");
  const hasDoctype = document.childNodes.some(
    (child) => defaultTreeAdapter.isDocumentTypeNode(child) && child.name.toLowerCase() === "html"
  );
  const hasAuthoredShell = [html, head, body, frameset].some((element) => element?.sourceCodeLocation != null);
  if (!hasDoctype && !hasAuthoredShell) return null;
  return { document, target: head ?? body ?? frameset ?? html };
}
function kernelElement(namespace, options) {
  const script = defaultTreeAdapter.createElement("script", namespace, [
    { name: "data-thread-page-kernel", value: "" },
    { name: "data-config", value: JSON.stringify(options.config) }
  ]);
  defaultTreeAdapter.insertText(script, options.kernel);
  return script;
}
function injectInto(authored, options) {
  const namespace = authored.target.namespaceURI;
  const nodes = [];
  if (options.baseHref) {
    nodes.push(defaultTreeAdapter.createElement("base", namespace, [{ name: "href", value: options.baseHref }]));
  }
  nodes.push(kernelElement(namespace, options));
  const anchor = defaultTreeAdapter.getFirstChild(authored.target);
  for (const node of nodes) {
    if (anchor) defaultTreeAdapter.insertBefore(authored.target, node, anchor);
    else defaultTreeAdapter.appendChild(authored.target, node);
  }
  return serialize(authored.document);
}
function wrapFragment(source, options) {
  const base = options.baseHref ? `<base href="${escapeHtml(options.baseHref)}">
` : "";
  const config = escapeHtml(JSON.stringify(options.config));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Thread Page</title>
${base}<script data-thread-page-kernel data-config="${config}">${options.kernel}</script>
<style>body{max-width:44rem;margin:2rem auto;padding:0 1rem;font:16px/1.55 system-ui,sans-serif;color:CanvasText;background:Canvas}</style>
</head>
<body>
${source}
</body>
</html>`;
}

// src/generated/kernel-runtime.ts
var KERNEL_RUNTIME = '"use strict";(()=>{var ee=Object.defineProperty;var te=(e,t,n)=>t in e?ee(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var F=(e,t,n)=>te(e,typeof t!="symbol"?t+"":t,n);var v=Object.freeze({entryDocumentBytes:5242880,uploadFileBytes:25165824,uploadsPerForm:8,submissionBodyBytes:65536,answersPerSubmission:64,answerValueChars:8e3,answerListItems:64,capabilityPayloadBytes:65536,capabilityJsonDepth:16,capabilityJsonNodes:1e4,promptChars:32768,resultTextBytes:65536,titleChars:240,storageValueBytes:32768,storageKeyChars:128,snapshotDefault:100,snapshotMax:200,activityDefault:8,activityMax:20,actionTokenMs:72e5,confirmationMs:12e4,selectionTokenMs:6e5,selectionTokens:32,idempotencyRecords:512,idempotencyMs:3e5,ratePerMinute:120,rateConcurrent:8,shellPollMs:1e4,watchDefaultMs:8e3,watchMinMs:2e3,watchMaxMs:3e5,offlineCopyBytes:204800,offlineCacheEntries:32,offlineCacheBytes:8388608,requestIdChars:96,methodNameChars:96,tokenChars:4096,errorMessageChars:512,summaryChars:512,projectsMax:200,providersMax:64,modelsPerProvider:64});var A=["invalid_json","invalid_request","invalid_params","invalid_response","request_too_large","response_too_large","unsupported_version","unknown_method","stale_page","confirmation_required","confirmation_invalid","cancelled","not_found","conflict","unavailable","rate_limited","handler_error","invalid_result"],he=new Set(A);var ye=Object.freeze({noPage:"This session has no page yet. Run `bb thread-page init` in the session first.",ineligible:"Only visible root sessions have pages.",pageTooLarge:`The page\'s entry document is larger than ${v.entryDocumentBytes/(1024*1024)} MiB and was not served.`,unavailable:"The page\'s source is unreachable. Reconnect its host and try again.",staleCopy:"The source host is offline; this cached page is read-only.",stalePage:"This page changed; reload it before responding.",handler:"Could not execute the page action.",rateLimited:"Too many requests from this page; try again shortly.",invalidSession:"A valid session id is required.",tokenInvalid:"This page session is invalid or expired; reload the page."});var I=1,B=1,ne=new Set(A);function w(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function _(e,t){return Object.keys(e).length===t.length&&t.every(o=>Object.prototype.hasOwnProperty.call(e,o))}function q(e,t){if(!w(e)||e.v!==B||typeof e.id!="string"||typeof e.ok!="boolean"||t!==void 0&&e.id!==t)return!1;if(e.ok===!0)return _(e,["v","id","ok","result"]);if(!_(e,["v","id","ok","error"])||!w(e.error))return!1;let n=e.error;return _(n,["code","message"])&&typeof n.code=="string"&&ne.has(n.code)&&typeof n.message=="string"&&n.message.length>0&&n.message.length<=512}function N(e){let t=e?.getAttribute("data-config");if(!t)throw new Error("Thread Page runtime: configuration is missing");return JSON.parse(t)}function re(e,t,n){let o=e.getAttribute("href");if(o===null)return{kind:"default"};if(o.startsWith("#"))return{kind:"default"};let s;try{s=new URL(o,n??t)}catch{return{kind:"block"}}return s.protocol!=="http:"&&s.protocol!=="https:"?{kind:"block"}:n&&s.href.startsWith(n)?{kind:"default"}:e.hasAttribute("download")?{kind:"default"}:{kind:"external",url:s.href,label:(e.textContent||"").replace(/\\s+/g," ").trim().slice(0,160)}}function U(e,t){e.addEventListener("click",n=>{if(n.defaultPrevented||n.button!==0)return;let s=n.target?.closest?.("a[href]");if(!s)return;let u=e.querySelector("base")?.getAttribute("href")??null,l=u?new URL(u,e.baseURI).href:null,a=re(s,e.baseURI,l);a.kind!=="default"&&(n.preventDefault(),a.kind==="external"&&t(a.url,a.label))},!0)}function K(e,t){let n=Object.freeze({version:1,invoke:t.invoke,watch:t.watch,setDirty:t.setDirty});Object.defineProperty(e,"threadPage",{value:n,writable:!1,configurable:!1,enumerable:!0})}var T=class extends Error{constructor(n,o){super(o);F(this,"code");this.name="ThreadPageError",this.code=n,Object.defineProperty(this,"code",{value:n,enumerable:!0,writable:!1})}};function j(e,t){let n=new Map,o=[],s=null,u=0;function l(){return u+=1,`tp-${typeof crypto<"u"&&typeof crypto.randomUUID=="function"?crypto.randomUUID():`${Date.now()}-${u}`}`}function a(m){let p=n.get(m);if(!(!p||!s))try{s(p.request)}catch(h){n.delete(m),p.reject(new T("invalid_request",h instanceof Error?h.message:"The request could not be sent"))}}function f(m,p){return new Promise((h,y)=>{if(typeof m!="string"){y(new T("invalid_request","A method name is required"));return}let b=l(),r={v:B,id:b,method:m,params:p===void 0?null:p,pageRevision:e};n.set(b,{request:r,resolve:h,reject:y}),s?a(b):o.push(b)})}function g(m,p,h,y){if(typeof h!="function")throw new TypeError("Thread Page watch needs a listener");let b=y?.intervalMs,r=typeof b=="number"&&Number.isFinite(b)?Math.max(v.watchMinMs,Math.min(v.watchMaxMs,Math.round(b))):v.watchDefaultMs,i=!1,c=!1,d=null;function E(x){i||(d!==null&&clearTimeout(d),d=setTimeout(k,x))}async function k(){if(d=null,!(i||c||t.visibilityState==="hidden")){c=!0;try{let x=await f(m,p);i||h(x,null)}catch(x){i||h(void 0,x)}finally{c=!1,i||E(r)}}}function R(){i||(t.visibilityState==="hidden"?(d!==null&&clearTimeout(d),d=null):E(0))}return t.addEventListener("visibilitychange",R),E(0),()=>{i||(i=!0,d!==null&&clearTimeout(d),d=null,t.removeEventListener("visibilitychange",R))}}return{invoke:f,watch:g,attach(m){for(s=m;o.length>0;){let p=o.shift();p&&a(p)}},receive(m){if(typeof m!="object"||m===null)return!1;let p=m.id;if(typeof p!="string")return!1;let h=n.get(p);if(!h)return!1;if(n.delete(p),!q(m,p))return h.reject(new T("invalid_response","The Thread Page bridge returned an invalid response")),!0;let y=m;return y.ok?h.resolve(y.result):h.reject(new T(y.error.code,y.error.message)),!0}}}function z(e){let t=new Map,n=0,o=!1,s=!1;function u(){let l=o||t.size>0;l!==s&&(s=l,e(l))}return{isDirty:()=>s,markForm(l){return n+=1,t.set(l,n),u(),n},versionOf:l=>t.get(l),clearForm(l,a){a!==void 0&&t.get(l)===a&&(t.delete(l),u())},setCustom(l){o=l===!0,u()}}}var oe="input,textarea,select,button,option,small,output,[data-thread-page-range],[data-thread-page-status]";function H(e){if(!e)return"";let t=e.cloneNode(!0);for(let n of Array.from(t.querySelectorAll(oe)))n.remove();return(t.textContent||"").replace(/\\s+/g," ").trim()}function ie(e,t){let n=t.getAttribute("data-label");if(n&&n.trim())return n.trim();let o=t.closest("fieldset");if(o){let l=H(o.querySelector("legend"));if(l)return l}let s=t.getAttribute("aria-label");if(s&&s.trim())return s.trim();let u=t.closest("label");if(u){let l=H(u);if(l)return l}if(t.id){let l=e.ownerDocument,a=Array.from(l.querySelectorAll("label[for]")).find(g=>g.htmlFor===t.id),f=H(a??null);if(f)return f}return t.name}var se=new Set(["button","submit","reset","image","file"]);function ae(e){return Array.from(e.elements).filter(t=>{let n=t;return typeof n.name=="string"&&n.name.length>0&&!n.disabled&&"type"in n})}function $(e,t){let n=ae(e),o=[],s=new Set;if(t&&(C(t)==="button"||C(t)==="input")){let u=t,l=u.value||(u.textContent||"").trim();o.push({name:u.name||"action",label:"Action",value:l}),u.name&&s.add(u.name)}for(let u of n){let l=u.name,a=String(u.type||"").toLowerCase();if(s.has(l)||se.has(a))continue;s.add(l);let f=n.filter(g=>g.name===l);o.push({name:l,label:ie(e,u),value:le(u,f,a)})}return o}function C(e){return e.tagName.toLowerCase()}function le(e,t,n){if(n==="checkbox"){let o=t.filter(s=>C(s)==="input");return o.length===1?o[0]?.checked===!0:o.filter(s=>s.checked).map(s=>s.value)}if(n==="radio"){let o=t.find(s=>C(s)==="input"&&s.checked);return o?o.value:""}return C(e)==="select"&&e.multiple?Array.from(e.selectedOptions).map(o=>o.value):t.length>1?t.map(o=>String(o.value??"")):String(e.value??"")}var ue="data-thread-page-manual",V="data-thread-page-status",de="data-thread-page-range";function L(e){return e.hasAttribute(ue)}function S(e){let t=[];return"tagName"in e&&e.tagName.toLowerCase()==="form"&&t.push(e),"querySelectorAll"in e&&t.push(...Array.from(e.querySelectorAll("form"))),t.filter(n=>!L(n))}function M(e){let t=e.querySelector(`[${V}]`);return t||(t=e.ownerDocument.createElement("p"),t.setAttribute(V,""),t.setAttribute("role","status"),e.appendChild(t)),t}var G=new WeakSet;function W(e){e.noValidate=!0;for(let t of Array.from(e.querySelectorAll(\'input[type="range"]\'))){if(G.has(t))continue;G.add(t);let n=e.ownerDocument.createElement("output");n.setAttribute(de,"");let o=()=>{n.textContent=String(t.value)};t.addEventListener("input",o),o(),t.insertAdjacentElement("afterend",n)}}function P(e){return Array.from(e.querySelectorAll("input,textarea,select,button,fieldset"))}function ce(e){let t=[];for(let n of Array.from(e.querySelectorAll(\'input[type="file"]\')))if(!n.disabled)for(let o of Array.from(n.files??[])){if(t.length>=v.uploadsPerForm)return t;t.push({field:n.name||"file",file:o})}return t}function Z(e){let t=[];for(let n of P(e))n.disabled||(n.disabled=!0,t.push(n));return t}function D(e){for(let t of e)t.disabled=!1}function me(e){let t=e.getAttribute("data-title");return t&&t.trim()?t.trim().slice(0,300):(e.ownerDocument.querySelector("h1")?.textContent||"").trim().slice(0,300)||"Thread Page"}function J(e,t,n){return{submissionId:n,form:e,title:me(e),answers:$(e,t),files:ce(e)}}var X="data-thread-page-offline",O="Offline copy \\u2014 responses are disabled until the source host reconnects.";function Y(e,t){let n=new Set,o=t;function s(){if(!e.body)return;let a=e.querySelector(`[${X}="host"]`);o&&!a?(a=e.createElement("aside"),a.setAttribute(X,"host"),a.setAttribute("role","status"),a.setAttribute("style","position:relative;z-index:2147483647;margin:0;padding:.75rem 1rem;border-bottom:1px solid currentColor;font:600 14px/1.4 system-ui,sans-serif;background:Canvas;color:CanvasText"),a.textContent=O,e.body.insertBefore(a,e.body.firstChild)):!o&&a&&a.remove()}function u(a){for(let f of S(a)){for(let g of P(f))g.disabled||(g.disabled=!0,n.add(g));M(f).textContent=O}}function l(){for(let a of n)a.disabled=!1;n.clear();for(let a of S(e)){let f=M(a);f.textContent===O&&(f.textContent="")}}return{isReadOnly:()=>o,apply(a){o=a,a?u(e):l(),s()},prepare(a){o&&u(a),s()}}}function Q(e,t){let n=e.document,o=null,s=new Map,u=new WeakSet;function l(r){if(!o)return!1;try{return o.postMessage(r),!0}catch{return!1}}let a=z(r=>{l({kind:r?"thread-page:dirty":"thread-page:clean"})}),f=j(t.pageRevision,n),g=Y(n,t.stale);K(e,{version:1,invoke:(r,i)=>f.invoke(r,i),watch:(r,i,c,d)=>f.watch(r,i,c,d),setDirty:r=>a.setCustom(r!==!1)});function m(r){for(let i of S(r))W(i);g.prepare(r)}m(n),n.readyState==="loading"&&n.addEventListener("DOMContentLoaded",()=>m(n),{once:!0}),typeof e.MutationObserver=="function"&&n.documentElement&&new e.MutationObserver(i=>{for(let c of i)for(let d of Array.from(c.addedNodes))d.nodeType===1&&m(d)}).observe(n.documentElement,{childList:!0,subtree:!0});function p(r){let c=r.target?.closest?.("form");!c||L(c)||a.markForm(c)}n.addEventListener("input",p,!0),n.addEventListener("change",p,!0),n.addEventListener("submit",r=>{let i=r.target;if(!i||i.tagName?.toLowerCase()!=="form"||L(i)||(r.preventDefault(),g.isReadOnly()||u.has(i)))return;let c=`sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,d=i,E=J(d,r.submitter??null,c),k={form:d,disabled:[],dirtyVersion:a.versionOf(d)};s.set(c,k),u.add(d),M(d).textContent=E.files.length>0?"Uploading\\u2026":"Sending\\u2026",k.disabled=Z(d),l({kind:"thread-page:submit",submissionId:c,title:E.title,answers:E.answers,files:E.files})||(s.delete(c),u.delete(d),D(k.disabled),M(d).textContent="Page connection is not ready; try again in a moment.")},!0),U(n,(r,i)=>{f.invoke("navigation.openExternal",i?{url:r,label:i}:{url:r}).catch(()=>{})});function h(r){if(w(r)){if(r.kind==="thread-page:source-state"){g.apply(r.stale===!0);return}if(r.kind==="thread-page:submit-progress"){let i=typeof r.submissionId=="string"?s.get(r.submissionId):void 0;i&&(M(i.form).textContent=String(r.message??"Working\\u2026").slice(0,160));return}if(r.kind==="thread-page:submit-result"){let i=typeof r.submissionId=="string"?s.get(r.submissionId):void 0;if(!i)return;s.delete(r.submissionId),u.delete(i.form);let c=r.ok===!0;M(i.form).textContent=c?String(r.message??"Sent").slice(0,160):String(r.error??"Could not send").slice(0,160),D(i.disabled),g.isReadOnly()&&g.apply(!0),c&&a.clearForm(i.form,i.dirtyVersion);return}f.receive(r)}}function y(r){o=r,r.onmessage=i=>h(i.data),r.start?.(),f.attach(i=>{r.postMessage(i)}),a.isDirty()&&l({kind:"thread-page:dirty"})}function b(r){if(o||r.source!==e.parent)return;let i=r.data;if(!w(i)||i.kind!=="thread-page:connect"||i.version!==I||!r.ports||r.ports.length!==1)return;r.stopImmediatePropagation();let c=r.ports[0];c&&y(c)}return e.addEventListener("message",b,!0),t.stale&&g.apply(!0),e.parent.postMessage({kind:"thread-page:ready",version:I},"*"),{deliver:r=>h(r),connect:r=>y(r)}}Q(window,N(document.currentScript));})();';

// src/serving/document-route.ts
function documentRoute(serving) {
  return async (context) => {
    try {
      const id = sessionIdFrom(context);
      const session = await eligibleSession(serving, id);
      const page = await serving.pages.load(id);
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", documentCsp());
      headers.set("etag", etagFor(page.revision));
      headers.set("x-thread-page-stale", String(page.stale));
      headers.set("x-thread-page-activity", session.state);
      headers.set("x-thread-page-updated-at", String(page.updatedAtMs));
      if (ifNoneMatchMatches(context.req.header("if-none-match"), etagFor(page.revision))) {
        return new Response(null, { status: 304, headers });
      }
      const config = { pageRevision: page.revision, stale: page.stale };
      const html = injectKernel(page.html, { kernel: KERNEL_RUNTIME, config, baseHref: serving.site.baseHref(id) });
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /document", true);
    }
  };
}

// src/serving/home-route.ts
function homeRoute(serving) {
  return async (_context) => {
    const home3 = serving.settings.current().homeSessionId;
    if (!isSessionId(home3)) {
      return errorPage("No home page is set yet. Run `bb thread-page home` in the session whose page should be home.", 404);
    }
    const session = await serving.host.sessions.get(home3).catch(() => null);
    if (!session || session.deleted || session.archived) {
      return errorPage("The home page points at a session that no longer exists. Run `bb thread-page home` in another session, or `bb thread-page home --clear`.", 404);
    }
    return new Response(null, { status: 302, headers: { location: pageUrl(serving.routeBase, home3), "cache-control": "no-store, max-age=0" } });
  };
}

// src/serving/shell-route.ts
import { randomBytes as randomBytes2 } from "node:crypto";

// src/generated/shell-runtime.ts
var SHELL_RUNTIME = '"use strict";(()=>{var M=Object.freeze({entryDocumentBytes:5242880,uploadFileBytes:25165824,uploadsPerForm:8,submissionBodyBytes:65536,answersPerSubmission:64,answerValueChars:8e3,answerListItems:64,capabilityPayloadBytes:65536,capabilityJsonDepth:16,capabilityJsonNodes:1e4,promptChars:32768,resultTextBytes:65536,titleChars:240,storageValueBytes:32768,storageKeyChars:128,snapshotDefault:100,snapshotMax:200,activityDefault:8,activityMax:20,actionTokenMs:72e5,confirmationMs:12e4,selectionTokenMs:6e5,selectionTokens:32,idempotencyRecords:512,idempotencyMs:3e5,ratePerMinute:120,rateConcurrent:8,shellPollMs:1e4,watchDefaultMs:8e3,watchMinMs:2e3,watchMaxMs:3e5,offlineCopyBytes:204800,offlineCacheEntries:32,offlineCacheBytes:8388608,requestIdChars:96,methodNameChars:96,tokenChars:4096,errorMessageChars:512,summaryChars:512,projectsMax:200,providersMax:64,modelsPerProvider:64});var x=["invalid_json","invalid_request","invalid_params","invalid_response","request_too_large","response_too_large","unsupported_version","unknown_method","stale_page","confirmation_required","confirmation_invalid","cancelled","not_found","conflict","unavailable","rate_limited","handler_error","invalid_result"],Y=new Set(x);var Q=Object.freeze({noPage:"This session has no page yet. Run `bb thread-page init` in the session first.",ineligible:"Only visible root sessions have pages.",pageTooLarge:`The page\'s entry document is larger than ${M.entryDocumentBytes/(1024*1024)} MiB and was not served.`,unavailable:"The page\'s source is unreachable. Reconnect its host and try again.",staleCopy:"The source host is offline; this cached page is read-only.",stalePage:"This page changed; reload it before responding.",handler:"Could not execute the page action.",rateLimited:"Too many requests from this page; try again shortly.",invalidSession:"A valid session id is required.",tokenInvalid:"This page session is invalid or expired; reload the page."});var E=1,_=1,$=new Set(x),j=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/,F=/^[a-z][a-zA-Z0-9]*(?:\\.[a-z][a-zA-Z0-9]*)+$/;function b(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function R(e,t){return Object.keys(e).length===t.length&&t.every(l=>Object.prototype.hasOwnProperty.call(e,l))}function C(e){return typeof e=="string"&&j.test(e)}function T(e,t){return b(e)&&R(e,["v","id","method","params","pageRevision"])&&e.v===_&&C(e.id)&&typeof e.method=="string"&&e.method.length>=3&&e.method.length<=96&&F.test(e.method)&&e.pageRevision===t}function B(e,t){if(!b(e)||e.v!==_||typeof e.id!="string"||typeof e.ok!="boolean"||t!==void 0&&e.id!==t)return!1;if(e.ok===!0)return R(e,["v","id","ok","result"]);if(!R(e,["v","id","ok","error"])||!b(e.error))return!1;let o=e.error;return R(o,["code","message"])&&typeof o.code=="string"&&$.has(o.code)&&typeof o.message=="string"&&o.message.length>0&&o.message.length<=512}function w(e,t,o){return{v:1,id:C(e)?e:"invalid",ok:!1,error:{code:t,message:o.slice(0,512)||"Request failed"}}}function P(e){let t=e?.getAttribute("data-config");if(!t)throw new Error("Thread Page runtime: configuration is missing");return JSON.parse(t)}function D(e){let t=e.querySelector("p"),o=e.querySelector(\'button[value="cancel"]\'),l=e.querySelector(\'button[value="confirm"]\'),c=null,d;function p(g){let y=c;if(c=null,g&&d)try{d()}catch{}d=void 0,e.open&&e.close(),y?.(g)}return o?.addEventListener("click",g=>{g.preventDefault(),p(!1)}),l?.addEventListener("click",g=>{g.preventDefault(),p(!0)}),e.addEventListener("cancel",g=>{g.preventDefault(),p(!1)}),e.addEventListener("close",()=>{c&&p(!1)}),{confirm(g,y){return new Promise(m=>{if(c&&p(!1),t&&(t.textContent=g),c=m,d=y,typeof e.showModal=="function")try{e.showModal()}catch{p(!1)}else p(!1)})}}}function O(e){let t=null;return{inPlace(o){e.location.assign(o)},reserveWindow(){try{if(t=e.open("","_blank"),t)try{t.opener=null}catch{}}catch{t=null}},external(o){let l=t;if(t=null,l&&!l.closed)try{l.location.href=o;return}catch{try{l.close()}catch{}}e.location.assign(o)},release(){let o=t;t=null;try{o?.close()}catch{}}}}function A(e,t,o,l=e.fetch.bind(e)){let c=`"${t.pageRevision}"`,d=!1,p=!1,g=!1,y=t.stale,m=null,v=null;function k(s){m!==null&&clearTimeout(m),m=null,!(p||e.document.visibilityState!=="visible")&&(m=setTimeout(()=>{m=null,i()},s))}function r(){m!==null&&clearTimeout(m),m=null,v?.abort(),v=null}function n(){d?(o.setStatus("Page changed \\u2014 reload when ready",!0),o.showReload(!0)):o.reloadView()}async function i(){if(!(p||g||e.document.visibilityState!=="visible")){if(Date.now()>=t.expiresAt-3e4){p=!0,d?(o.setStatus("Session expiring \\u2014 reload when ready",!0),o.showReload(!0)):o.reloadView();return}g=!0,v=new AbortController;try{let s=await l(t.documentUrl,{method:"GET",credentials:"same-origin",cache:"no-store",headers:{"if-none-match":c},signal:v.signal});if(s.status===401||s.status===403){p=!0,o.setStatus("Session expired \\u2014 reload this page",!0),o.showReload(!0);return}if(!s.ok&&s.status!==304){o.setStatus("Page unavailable",!0);return}let f=s.headers.get("x-thread-page-stale")==="true";o.setWorking(s.headers.get("x-thread-page-activity")==="working"),f!==y&&(y=f,o.onStaleChanged(f)),o.setStatus(f?"Offline copy \\u2014 read-only":"",f);let u=s.headers.get("etag");u&&u!==c&&(c=u,n())}catch(s){s instanceof DOMException&&s.name==="AbortError"||o.setStatus("Cannot check for updates",!0)}finally{v=null,g=!1,k(t.pollMs)}}}return e.document.addEventListener("visibilitychange",()=>{e.document.visibilityState==="visible"?k(0):r()}),{start:()=>k(t.pollMs),setDirty:s=>{d=s},pollNow:()=>i(),isStopped:()=>p}}function I(e){let{config:t,confirmer:o,navigator:l}=e,c=e.fetchImpl??fetch;function d(r,n){r.postMessage(n)}async function p(r){return(await c(t.bridgeUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(r)})).json().catch(()=>null)}function g(r){return!b(r)||r.kind!=="page"&&r.kind!=="host"&&r.kind!=="external"||typeof r.url!="string"||r.kind==="external"&&!/^https?:\\/\\//i.test(r.url)||r.kind!=="external"&&!r.url.startsWith("/")?null:{kind:r.kind,url:r.url}}function y(r,n,i){if(!b(i)||!B(i.response,n.id)){d(r,w(n.id,"invalid_response","The Thread Page bridge returned an invalid response"));return}let s=i.navigate===void 0?null:g(i.navigate);if(i.response.ok&&s){d(r,i.response),s.kind==="external"?l.external(s.url):l.inPlace(s.url);return}l.release(),d(r,i.response)}async function m(r,n){try{let i=await p({actionToken:t.actionToken,request:n});if(b(i)&&b(i.confirm)){let s=i.confirm;if(typeof s.challenge!="string"||typeof s.summary!="string"||s.requestId!==n.id){d(r,w(n.id,"invalid_response","The Thread Page bridge returned an invalid confirmation"));return}let f=n.method==="navigation.openExternal";if(!await o.confirm(s.summary,f?()=>l.reserveWindow():void 0)){d(r,w(n.id,"cancelled","You declined this action"));return}let a=await p({actionToken:t.actionToken,request:n,confirmation:s.challenge});y(r,n,a);return}y(r,n,i)}catch(i){l.release(),d(r,w(n.id,"unavailable",i instanceof Error?i.message:"The Thread Page bridge is unavailable"))}}async function v(r){let n=r.file;if(!n||typeof n.size!="number")throw new Error("Attachment is not a file");let i=n.name||"file";if(n.size<=0)throw new Error(`Attachment ${i} is empty`);if(n.size>t.maxUploadBytes)throw new Error(`Attachment ${i} is larger than ${Math.round(t.maxUploadBytes/(1024*1024))} MiB`);let s=await V(n),f=await c(t.uploadUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:t.actionToken,pageRevision:t.pageRevision,name:i,content:s})}),u=await f.json().catch(()=>null);if(!f.ok||!u||u.ok!==!0||typeof u.name!="string"||typeof u.path!="string"||typeof u.sizeBytes!="number")throw new Error(u&&typeof u.message=="string"&&u.message||`Upload failed (${f.status})`);return{field:String(r.field||"file").slice(0,128),name:u.name,path:u.path,sizeBytes:u.sizeBytes}}async function k(r,n){let i=typeof n.submissionId=="string"?n.submissionId:"";try{let s=(Array.isArray(n.files)?n.files:[]).slice(0,t.maxUploads),f=[];for(let S=0;S<s.length;S+=1)d(r,{kind:"thread-page:submit-progress",submissionId:i,message:`Uploading ${S+1} of ${s.length}\\u2026`}),f.push(await v(s[S]));f.length>0&&d(r,{kind:"thread-page:submit-progress",submissionId:i,message:"Sending\\u2026"});let u=await c(t.submitUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:t.actionToken,submissionId:i,pageRevision:t.pageRevision,title:n.title,answers:n.answers,files:f})}),a=await u.json().catch(()=>({ok:!1,message:"Invalid server response"})),h=u.ok&&a.ok===!0;d(r,{kind:"thread-page:submit-result",submissionId:i,ok:h,message:typeof a.delivery=="string"?`Sent (${a.delivery})`:"Sent",error:typeof a.message=="string"?a.message:`Request failed (${u.status})`})}catch(s){d(r,{kind:"thread-page:submit-result",submissionId:i,ok:!1,error:s instanceof Error?s.message:"Request failed"})}}return{handle(r,n){if(b(n)){if(n.kind==="thread-page:dirty"){e.onDirty(!0);return}if(n.kind==="thread-page:clean"){e.onDirty(!1);return}if(n.kind==="thread-page:submit"){k(r,n);return}if(!T(n,t.pageRevision)){d(r,w(n.id,"invalid_request","Invalid Thread Page bridge request"));return}m(r,n)}}}}async function V(e){let t=new Uint8Array(await e.arrayBuffer()),o="",l=32768;for(let c=0;c<t.length;c+=l)o+=String.fromCharCode.apply(null,Array.from(t.subarray(c,c+l)));return btoa(o)}function L(e,t,o,l){let{frame:c,status:d,work:p,reload:g,dialog:y}=o,m=null,v=!0,k=t.stale,n=A(e,t,{setStatus(a,h){d.textContent=a,d.dataset.tone=h?"warn":""},setWorking(a){p.dataset.visible=a&&t.workingLabel?"true":"false"},showReload(a){g.dataset.visible=a?"true":"false"},onStaleChanged(a){k=a,m?.postMessage({kind:"thread-page:source-state",stale:a})},reloadView(){e.location.reload()}},l),i=O(e),s=D(y),f=I({config:t,confirmer:s,navigator:i,onDirty:a=>n.setDirty(a),...l?{fetchImpl:l}:{}});function u(){let a=new e.MessageChannel,h=a.port1;m=h,h.onmessage=S=>f.handle(h,S.data),h.start?.(),c.contentWindow?.postMessage({kind:"thread-page:connect",version:E},"*",[a.port2]),h.postMessage({kind:"thread-page:source-state",stale:k})}return e.addEventListener("message",a=>{if(!v||a.origin!=="null"||a.source!==c.contentWindow)return;let h=a.data;!b(h)||h.kind!=="thread-page:ready"||h.version!==E||(v=!1,u())}),g.addEventListener("click",()=>e.location.reload()),c.src=t.documentUrl,n.start(),{poller:n}}var W=P(document.currentScript),q=document.querySelector("iframe"),N=document.querySelector("[data-shell-status]"),U=document.querySelector("[data-shell-working]"),H=document.querySelector("[data-shell-reload]"),z=document.querySelector("dialog");if(!q||!N||!U||!H||!z)throw new Error("Thread Page shell: chrome is incomplete");L(window,W,{frame:q,status:N,work:U,reload:H,dialog:z});})();';

// src/serving/shell-html.ts
var SHELL_CSS = `
:root{color-scheme:light dark;font:14px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#f7f7f5;--surface:#fff;--ink:#17181b;--muted:#676c75;--line:#dfe0e3;--accent:#315fc5;--warn:#a54312}
@media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#eeeef0;--muted:#a5a9b1;--line:#30333a;--accent:#91aff1;--warn:#efa879}}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--ink)}
.shell{display:grid;grid-template-rows:auto 1fr;height:100%;min-height:100dvh}
.bar{display:flex;align-items:center;gap:.75rem;min-height:2.5rem;padding:.45rem max(.7rem,env(safe-area-inset-right)) .45rem max(.7rem,env(safe-area-inset-left));border-bottom:1px solid var(--line);background:var(--surface)}
.home{flex:none;color:var(--muted);text-decoration:none;font-weight:600;white-space:nowrap}.home:hover{color:var(--ink)}
.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.status{margin-left:auto;color:var(--muted);text-align:right}.status[data-tone=warn]{color:var(--warn)}
.work{flex:none;display:none;align-items:center;gap:.4rem;color:var(--muted)}.work[data-visible=true]{display:inline-flex}
.work .dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--accent)}
@media(prefers-reduced-motion:no-preference){.work[data-visible=true] .dot{animation:tp-pulse 1.4s ease-in-out infinite}}
@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:.25}}
button.reload{display:none;padding:.25rem .55rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}button.reload[data-visible=true]{display:inline-block}
iframe{display:block;width:100%;height:100%;border:0;background:var(--bg)}
dialog{margin:auto;max-width:min(30rem,calc(100vw - 2rem));padding:1.15rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;color:var(--ink);background:var(--surface)}
dialog::backdrop{background:rgb(0 0 0 / .45)}dialog h2{margin:0 0 .5rem;font-size:1rem}dialog p{margin:0 0 1rem;color:var(--muted);overflow-wrap:anywhere}
dialog .row{display:flex;gap:.5rem;justify-content:flex-end}dialog button{padding:.4rem .8rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}
dialog button[value=confirm]{color:#fff;background:var(--accent);border-color:var(--accent)}
`;
function renderShell(view) {
  const title2 = escapeHtml(view.title);
  const nonce = escapeHtml(view.nonce);
  const config = escapeHtml(JSON.stringify(view.config));
  const working = view.working && view.config.workingLabel ? "true" : "false";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${title2}</title>
<style nonce="${nonce}">${SHELL_CSS}</style>
</head>
<body>
<div class="shell">
  <header class="bar">
    ${view.homeUrl ? `<a class="home" href="${escapeHtml(view.homeUrl)}" title="All sessions">\u2190 Sessions</a>` : ""}
    <span class="title">${title2}</span>
    <span class="work" role="status" data-shell-working data-visible="${working}"><span class="dot" aria-hidden="true"></span><span>${escapeHtml(view.config.workingLabel)}</span></span>
    <span class="status" role="status" data-shell-status${view.config.stale ? ' data-tone="warn"' : ""}>${view.config.stale ? "Offline copy \u2014 read-only" : ""}</span>
    <button type="button" class="reload" data-shell-reload aria-label="Reload updated page">Reload</button>
  </header>
  <iframe title="${title2}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
</div>
<dialog aria-labelledby="tp-confirm-title">
  <form method="dialog">
    <h2 id="tp-confirm-title">Confirm this action</h2>
    <p></p>
    <div class="row">
      <button type="button" value="cancel">Cancel</button>
      <button type="button" value="confirm">Confirm</button>
    </div>
  </form>
</dialog>
<script nonce="${nonce}" data-config="${config}">${SHELL_RUNTIME}</script>
</body>
</html>`;
}

// src/serving/shell-route.ts
function shellRoute(serving) {
  return async (context) => {
    try {
      const id = sessionIdFrom(context);
      const session = await eligibleSession(serving, id);
      const page = await serving.pages.load(id);
      const now = serving.now();
      const { token, payload } = mintActionToken({ session: id, revision: page.revision, now }, serving.signingKey);
      const nonce = randomBytes2(18).toString("base64url");
      const settings = serving.settings.current();
      const home3 = isSessionId(settings.homeSessionId) && settings.homeSessionId !== id ? homeUrl(serving.routeBase) : null;
      const html = renderShell({
        nonce,
        title: session.title,
        homeUrl: home3,
        working: session.state === "working",
        config: {
          actionToken: token,
          pageRevision: page.revision,
          expiresAt: payload.exp,
          documentUrl: serving.site.documentUrl(id),
          submitUrl: `${serving.routeBase}/submit`,
          uploadUrl: `${serving.routeBase}/upload`,
          bridgeUrl: `${serving.routeBase}/bridge`,
          workingLabel: settings.workingLabel,
          stale: page.stale,
          pollMs: LIMITS.shellPollMs,
          maxUploadBytes: LIMITS.uploadFileBytes,
          maxUploads: LIMITS.uploadsPerForm
        }
      });
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", shellCsp(nonce));
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /page", true);
    }
  };
}

// src/domain/submissions/parse.ts
function parseSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value;
  if (typeof input.actionToken !== "string" || input.actionToken.length === 0 || input.actionToken.length > LIMITS.tokenChars || typeof input.submissionId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(input.submissionId) || !isRevision(input.pageRevision) || typeof input.title !== "string" || input.title.length > 300 || !Array.isArray(input.answers) || input.answers.length > LIMITS.answersPerSubmission) {
    return null;
  }
  const answers = [];
  let total = input.title.length;
  for (const raw of input.answers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const answer = raw;
    if (typeof answer.name !== "string" || answer.name.length > 128 || typeof answer.label !== "string" || answer.label.length > 300) return null;
    if (!isAnswerValue(answer.value)) return null;
    total += answer.name.length + answer.label.length + valueLength(answer.value);
    if (total > LIMITS.submissionBodyBytes) return null;
    answers.push({ name: answer.name, label: answer.label, value: answer.value });
  }
  const files = [];
  if (input.files !== void 0) {
    if (!Array.isArray(input.files) || input.files.length > LIMITS.uploadsPerForm) return null;
    for (const raw of input.files) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const file = raw;
      if (typeof file.field !== "string" || file.field.length > 128 || typeof file.name !== "string" || !isSafeUploadName(file.name) || typeof file.path !== "string" || file.path !== `${UPLOAD_DIR}/${file.name}` || typeof file.sizeBytes !== "number" || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > LIMITS.uploadFileBytes) {
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
    files
  };
}
function isAnswerValue(value) {
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= LIMITS.answerValueChars;
  return Array.isArray(value) && value.length <= LIMITS.answerListItems && value.every((item) => typeof item === "string" && item.length <= 2e3);
}
function valueLength(value) {
  if (typeof value === "boolean") return 1;
  if (typeof value === "string") return value.length;
  return value.reduce((sum, item) => sum + item.length, 0);
}

// src/serving/submit-route.ts
function submitRoute(serving) {
  return async (context) => {
    let release = null;
    try {
      const body = await readJsonBody(context, LIMITS.submissionBodyBytes);
      const submission = parseSubmission(body);
      if (!submission) throw new PageError("invalid_request", "Invalid submission");
      const token = requireActionToken(serving, submission.actionToken);
      if (submission.pageRevision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      release = acquireRate(serving, token.session);
      const now = serving.now();
      const fingerprint2 = sha256Hex(JSON.stringify({ revision: submission.pageRevision, title: submission.title, answers: submission.answers, files: submission.files }));
      const remembered = serving.submissions.remember(
        `${token.session}:${submission.submissionId}`,
        fingerprint2,
        async () => {
          await eligibleSession(serving, token.session);
          const page = await serving.pages.load(token.session);
          if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
          if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
          const sent = await serving.host.sessions.send(token.session, formatSubmissionMessage(submission), "queue");
          return { status: 200, body: { ok: true, delivery: sent.delivery } };
        },
        now
      );
      if (remembered.kind === "conflict") throw new PageError("conflict", "This submission id was already used with different answers");
      const outcome = await remembered.outcome;
      return jsonResponse(outcome.body, outcome.status);
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /submit", false);
    } finally {
      release?.();
    }
  };
}

// src/serving/upload-route.ts
import { randomBytes as randomBytes3 } from "node:crypto";
var BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
function uploadRoute(serving) {
  const maxBody = Math.ceil(LIMITS.uploadFileBytes * 4 / 3) + 8192;
  return async (context) => {
    let release = null;
    try {
      const body = await readJsonBody(context, maxBody);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PageError("invalid_request", "Invalid upload envelope");
      const envelope = body;
      const token = requireActionToken(serving, envelope.actionToken);
      if (typeof envelope.content !== "string" || !BASE64.test(envelope.content)) throw new PageError("invalid_request", "Attachment content must be base64");
      release = acquireRate(serving, token.session);
      await eligibleSession(serving, token.session);
      const page = await serving.pages.load(token.session);
      if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      const bytes = Buffer.from(envelope.content, "base64");
      if (bytes.byteLength === 0) throw new PageError("invalid_request", "The file is empty");
      if (bytes.byteLength > LIMITS.uploadFileBytes) throw new PageError("request_too_large", `Attachments must be at most ${mebibytes(LIMITS.uploadFileBytes)}`);
      const name = uploadFileName(typeof envelope.name === "string" ? envelope.name : "upload", serving.now(), randomBytes3(3).toString("hex"));
      const location = await serving.host.sessions.storage(token.session);
      const outcome = await serving.host.files.write(location, `${UPLOAD_DIR}/${name}`, bytes, { onlyIfAbsent: true });
      if (outcome !== "written") throw new PageError("conflict", "The attachment could not be stored under a fresh name; try again");
      return jsonResponse({ ok: true, name, path: `${UPLOAD_DIR}/${name}`, sizeBytes: bytes.byteLength });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /upload", false);
    } finally {
      release?.();
    }
  };
}

// src/serving/routes.ts
function registerRoutes(bb, serving) {
  const dispatch = createDispatcher(serving, ALL_HANDLERS);
  bb.http.route("GET", "/page", shellRoute(serving), { auth: "local" });
  bb.http.route("GET", "/document", documentRoute(serving), { auth: "local" });
  bb.http.route("GET", "/home", homeRoute(serving), { auth: "local" });
  bb.http.route("POST", "/submit", submitRoute(serving), { auth: "local" });
  bb.http.route("POST", "/upload", uploadRoute(serving), { auth: "local" });
  bb.http.route("POST", "/bridge", bridgeRoute(dispatch), { auth: "local" });
}

// src/serving/signing-key.ts
import { randomBytes as randomBytes4 } from "node:crypto";
var KEY = "signing-key:v3";
async function loadSigningKey(host) {
  try {
    const stored = await host.kv.get(KEY);
    if (typeof stored === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      const decoded = Buffer.from(stored, "base64url");
      if (decoded.byteLength === 32) return decoded;
    }
  } catch (error) {
    host.log.warn(`signing key: could not read the stored key: ${errorText(error)}`);
  }
  const generated = randomBytes4(32);
  try {
    await host.kv.set(KEY, generated.toString("base64url"));
  } catch (error) {
    host.log.warn(`signing key: could not persist; open pages will need a reload after the next plugin reload: ${errorText(error)}`);
  }
  return generated;
}

// src/plugin.ts
async function createPlugin(bb, options = {}) {
  const settings = await defineSettings(bb);
  const host = options.host ?? createBbHost(bb);
  const signingKey = await loadSigningKey(host);
  const routeBase = `/api/v1/plugins/${bb.pluginId}/http`;
  const site = options.site ? options.site(routeBase) : createCoreStorageSite(routeBase, (session) => `/api/v1/threads/${encodeURIComponent(session)}/thread-storage/files/`);
  const serving = {
    host,
    pages: createPageStore(host),
    settings,
    signingKey,
    site,
    routeBase,
    registry: capabilityRegistry,
    rate: createRateLimiter(),
    submissions: createOutcomeMemory(),
    replies: createOutcomeMemory(),
    selections: createSelectionStore(),
    hostSessionUrl: (session) => `/threads/${encodeURIComponent(session)}`,
    now: options.now ?? (() => Date.now())
  };
  const effectiveInstruction = () => {
    const current = settings.current();
    return current.agentInstructions && current.agentInstructionText.trim() ? current.agentInstructionText : null;
  };
  bb.agents.configure((context) => {
    const instruction = effectiveInstruction();
    const root = context.thread.parentThreadId === null && context.thread.sourceThreadId === null && context.origin.kind === null;
    return instruction && root ? { tools: [], skills: [], instructions: instruction } : { tools: [], skills: [] };
  });
  registerRoutes(bb, serving);
  registerCli(bb, { serving, guide: buildGuide(capabilityRegistry, site), effectiveInstruction });
  return serving;
}

// server.ts
async function threadPagesPlugin(bb) {
  await createPlugin(bb);
}
export {
  threadPagesPlugin as default
};
//# sourceMappingURL=server.js.map
