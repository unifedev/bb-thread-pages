import { randomBytes } from "node:crypto";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  AUTHORING_GUIDE,
  DEFAULT_AGENT_INSTRUCTION,
  DEFAULT_PAGE_SEED,
  renderHomeSeed,
  renderPageSeed,
} from "./authoring.js";
import {
  BRIDGE_MAX_SERIALIZED_BYTES,
  authorizeBridgeInvocation,
  capabilityDescriptors,
  completeBridgeInvocation,
  createCapabilityRegistry,
  createTrustedOuterConfirmation,
  makeBridgeFailureResponse,
  resolveBridgeInvocation,
  strictParityCapabilityRegistry,
  type BridgeErrorCode,
  type JsonValue,
  type ThreadActivityParams,
  type ThreadReplyParams,
  type ThreadsContinueParams,
  type ThreadsSnapshotParams,
  type ThreadsSpawnParams,
  type ThreadTargetParams,
} from "./bridge.js";
import {
  CONFIRMATION_TTL_MS,
  MAX_PAGE_BYTES,
  MAX_UPLOAD_BYTES,
  PAGE_FILENAME,
  UPLOAD_DIRNAME,
  VIEWER_TOKEN_TTL_MS,
  escapeHtml,
  etagForHash,
  formatSubmissionMessage,
  formatThreadReplyMessage,
  parseSubmission,
  renderDocument,
  safeUploadName,
  signConfirmationChallenge,
  verifyConfirmationChallenge,
  renderOuterPage,
  sha256Text,
  signPageToken,
  verifyPageToken,
  type PageTokenPayload,
} from "./page.js";

const MAX_SUBMISSION_BYTES = 64 * 1024;
const ASSET_DIRNAME = "thread-page-assets";
const ASSET_PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_VALUE_BYTES = 240 * 1024;
const MAX_MEMORY_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_MEMORY_CACHE_ENTRIES = 32;
const SUBMISSION_TTL_MS = 5 * 60 * 1000;
const MAX_RECENT_SUBMISSIONS = 512;
const MAX_BRIDGE_BODY_BYTES = BRIDGE_MAX_SERIALIZED_BYTES + 8 * 1024;
const SIGNING_KEY_KV_KEY = "page-signing-key:v2";
export const ENABLED_BRIDGE_METHODS = new Set([
  "context.get",
  "thread.activity",
  "thread.reply",
  "threads.snapshot",
  "projects.list",
  "providers.list",
  "threads.continue",
  "threads.spawn",
  "threads.archive",
  "threads.stop",
  "threads.openPage",
  "threads.openBb",
  "navigation.openExternal",
  "storage.get",
  "storage.set",
  "projects.browse",
  "projects.create",
]);

const SELECTION_TTL_MS = 10 * 60 * 1000;
const enabledBridgeRegistry = createCapabilityRegistry(
  strictParityCapabilityRegistry
    .list()
    .filter((capability) => ENABLED_BRIDGE_METHODS.has(capability.method)),
);

interface CachedPage {
  fragment: string;
  hash: string;
  updatedAt: number;
}

interface LoadedPage extends CachedPage {
  stale: boolean;
}

class PageNotFoundError extends Error {
  constructor() {
    super("Thread page has not been initialized");
    this.name = "PageNotFoundError";
  }
}

class PageTooLargeError extends Error {
  constructor() {
    super(`Thread page exceeds ${MAX_PAGE_BYTES} bytes`);
    this.name = "PageTooLargeError";
  }
}

class PageUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Thread page source is unavailable", options);
    this.name = "PageUnavailableError";
  }
}

function isValidThreadId(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{3,128}$/.test(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const ACTIVITY_LABELS: Record<string, readonly [string, string]> = {
  agentMessage: ["Writing", "Wrote"],
  reasoning: ["Thinking", "Thought"],
};

function activityState(thread: Record<string, unknown>) {
  const runtime = recordValue(thread.runtime);
  const display =
    typeof runtime?.displayStatus === "string"
      ? runtime.displayStatus
      : typeof thread.status === "string"
        ? thread.status
        : "idle";
  if (["active", "starting", "provisioning", "stopping"].includes(display)) {
    return "working" as const;
  }
  if (display === "error") return "failed" as const;
  if (thread.hasPendingInteraction === true) return "waiting" as const;
  return "idle" as const;
}

function activityItems(events: readonly unknown[], limit: number) {
  const out: Array<{
    kind: string;
    done: boolean;
    atMs: number;
    label: string;
    text: string;
  }> = [];
  for (const rawEvent of events) {
    const event = recordValue(rawEvent);
    if (!event) continue;
    const type = event.type;
    if (type !== "item/started" && type !== "item/completed") continue;
    const done = type === "item/completed";
    const data = recordValue(event.data);
    const item = recordValue(data?.item) ?? data;
    if (!item || typeof item.type !== "string") continue;
    const presentation = recordValue(item.presentation);
    const labels = recordValue(presentation?.label);
    const presented = labels?.[done ? "completed" : "pending"];
    const fallback = ACTIVITY_LABELS[item.type];
    const label =
      typeof presented === "string"
        ? presented
        : fallback
          ? fallback[done ? 1 : 0]
          : null;
    if (!label) continue;
    const detail =
      presentation?.title ?? item.command ?? item.text ?? item.name ?? "";
    const atMs =
      typeof event.createdAt === "number" && Number.isFinite(event.createdAt)
        ? Math.max(0, Math.trunc(event.createdAt))
        : 0;
    out.push({
      kind: item.type.slice(0, 80),
      done,
      atMs,
      label: label.trim().slice(0, 80) || (done ? "Completed" : "Working"),
      text: String(detail).replace(/\s+/g, " ").trim().slice(0, 200),
    });
  }
  out.reverse();
  return out.slice(-limit);
}

/** The snapshot's own status vocabulary, not bb's internal one. */
function snapshotStatus(thread: Record<string, unknown>) {
  const state = activityState(thread);
  if (state === "working") return "active" as const;
  if (state === "failed") return "failed" as const;
  if (state === "waiting") return "waiting" as const;
  return "idle" as const;
}

function isMissingFileError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (record.code === "ENOENT" || record.status === 404) return true;
  }
  return /\b(enoent|not found|does not exist|no such file)\b/i.test(
    errorText(error),
  );
}

function storageRoot(storageRootPath: string): string {
  return storageRootPath.replace(/[\\/]+$/, "");
}

function pagePath(storageRootPath: string): string {
  return `${storageRoot(storageRootPath)}/${PAGE_FILENAME}`;
}

function assetDirPath(storageRootPath: string): string {
  return `${storageRoot(storageRootPath)}/${ASSET_DIRNAME}`;
}

function uploadDirPath(storageRootPath: string): string {
  return `${storageRoot(storageRootPath)}/${UPLOAD_DIRNAME}`;
}

function cacheKey(threadId: string): string {
  return `cache:${threadId}`;
}

function isEligibleThread(thread: {
  archivedAt: number | null;
  deletedAt: number | null;
  parentThreadId: string | null;
  sourceThreadId: string | null;
  visibility: "hidden" | "visible";
}): boolean {
  return (
    thread.visibility === "visible" &&
    thread.parentThreadId === null &&
    thread.sourceThreadId === null &&
    thread.archivedAt === null &&
    thread.deletedAt === null
  );
}

function isCachedPage(value: unknown): value is CachedPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fragment === "string" &&
    Buffer.byteLength(entry.fragment, "utf8") <= MAX_PAGE_BYTES &&
    typeof entry.hash === "string" &&
    /^[a-f0-9]{64}$/.test(entry.hash) &&
    sha256Text(entry.fragment) === entry.hash &&
    typeof entry.updatedAt === "number" &&
    Number.isFinite(entry.updatedAt)
  );
}

function createPageStore(bb: BbPluginApi) {
  const memory = new Map<string, CachedPage>();
  let memoryBytes = 0;

  function cacheBytes(page: CachedPage): number {
    return Buffer.byteLength(page.fragment, "utf8") + 128;
  }

  function retain(threadId: string, page: CachedPage): void {
    const existing = memory.get(threadId);
    if (existing) {
      memoryBytes -= cacheBytes(existing);
      memory.delete(threadId);
    }
    memory.set(threadId, page);
    memoryBytes += cacheBytes(page);
    while (
      memory.size > MAX_MEMORY_CACHE_ENTRIES ||
      memoryBytes > MAX_MEMORY_CACHE_BYTES
    ) {
      const oldest = memory.keys().next().value as string | undefined;
      if (!oldest) break;
      const removed = memory.get(oldest);
      memory.delete(oldest);
      if (removed) memoryBytes -= cacheBytes(removed);
    }
  }

  async function remember(threadId: string, page: CachedPage): Promise<void> {
    const previous = memory.get(threadId);
    retain(threadId, page);
    if (previous?.hash === page.hash) return;
    if (Buffer.byteLength(JSON.stringify(page), "utf8") > MAX_CACHE_VALUE_BYTES) {
      bb.log.debug(
        `Thread Page ${threadId} is too large for the durable offline cache`,
      );
      try {
        await bb.storage.kv.delete(cacheKey(threadId));
      } catch (error) {
        bb.log.warn(
          `Could not clear obsolete offline cache for ${threadId}: ${errorText(error)}`,
        );
      }
      return;
    }
    try {
      await bb.storage.kv.set(cacheKey(threadId), page);
    } catch (error) {
      bb.log.warn(
        `Could not update offline cache for ${threadId}: ${errorText(error)}`,
      );
    }
  }

  async function cached(threadId: string): Promise<CachedPage | null> {
    const resident = memory.get(threadId);
    if (resident) {
      retain(threadId, resident);
      return resident;
    }
    try {
      const stored = await bb.storage.kv.get<unknown>(cacheKey(threadId));
      if (!isCachedPage(stored)) return null;
      retain(threadId, stored);
      return stored;
    } catch (error) {
      bb.log.warn(
        `Could not read offline cache for ${threadId}: ${errorText(error)}`,
      );
      return null;
    }
  }

  async function load(
    threadId: string,
    signal?: AbortSignal,
  ): Promise<LoadedPage> {
    try {
      const location = await bb.sdk.threads.storageLocation({
        threadId,
        signal,
      });
      const file = await bb.sdk.files.read({
        hostId: location.hostId,
        path: pagePath(location.storageRootPath),
        rootPath: location.storageRootPath,
        signal,
      });

      if (file.contentEncoding !== "utf8") {
        throw new Error("Thread page is not UTF-8 text");
      }
      if (
        file.sizeBytes > MAX_PAGE_BYTES ||
        Buffer.byteLength(file.content, "utf8") > MAX_PAGE_BYTES
      ) {
        throw new PageTooLargeError();
      }

      const hash = /^[a-f0-9]{64}$/i.test(file.sha256)
        ? file.sha256.toLowerCase()
        : sha256Text(file.content);
      const page = {
        fragment: file.content,
        hash,
        updatedAt: file.modifiedAtMs ?? Date.now(),
      };
      await remember(threadId, page);
      return { ...page, stale: false };
    } catch (error) {
      if (error instanceof PageTooLargeError) throw error;
      if (isMissingFileError(error)) throw new PageNotFoundError();
      const fallback = await cached(threadId);
      if (fallback) return { ...fallback, stale: true };
      throw new PageUnavailableError({ cause: error });
    }
  }

  return { load, remember };
}

async function getSigningKey(bb: BbPluginApi): Promise<Uint8Array> {
  try {
    const stored = await bb.storage.kv.get<unknown>(SIGNING_KEY_KV_KEY);
    if (typeof stored === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      const decoded = Buffer.from(stored, "base64url");
      if (decoded.byteLength === 32) return decoded;
    }
  } catch (error) {
    bb.log.warn(`Could not read viewer signing key: ${errorText(error)}`);
  }

  const generated = randomBytes(32);
  try {
    await bb.storage.kv.set(SIGNING_KEY_KV_KEY, generated.toString("base64url"));
  } catch (error) {
    bb.log.warn(
      `Viewer sessions will reset on plugin reload: ${errorText(error)}`,
    );
  }
  return generated;
}

function commonHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "text/html; charset=utf-8",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

function outerHeaders(nonce: string): Headers {
  const headers = commonHeaders();
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      "base-uri 'none'",
      "connect-src 'self'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "frame-src 'self'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
    ].join("; "),
  );
  return headers;
}

/**
 * A CSP source expression for the confined asset preview.
 *
 * The preview base is origin-relative, but a CSP source list needs a scheme and
 * host; a bare path is invalid and is dropped, which would silently block every
 * asset. The trailing-slash path is preserved, so the source still matches only
 * URLs inside this thread's preview.
 */
function assetCspSource(
  assetBase: string | null | undefined,
  requestUrl: string,
): string | null {
  if (!assetBase) return null;
  try {
    return new URL(assetBase, requestUrl).href;
  } catch {
    return null;
  }
}

function documentHeaders(
  _nonce: string,
  page?: LoadedPage,
  assetBase?: string | null,
  activity?: "working" | "idle" | "waiting" | "failed" | "stopped",
): Headers {
  const headers = commonHeaders();
  // Assets are confined to one temporary, path-shaped preview of this thread's
  // asset directory. Everything else stays denied.
  const assetSource = assetBase ? ` ${assetBase}` : "";
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      // The injected <base> must be allowed, but only for the confined preview.
      assetBase ? `base-uri ${assetBase}` : "base-uri 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      `img-src data: blob:${assetSource}`,
      `media-src data: blob:${assetSource}`,
      `font-src data:${assetSource}`,
      "sandbox allow-scripts allow-forms",
      `script-src 'unsafe-inline'${assetSource}`,
      "script-src-attr 'unsafe-inline'",
      `style-src 'unsafe-inline'${assetSource}`,
      "style-src-attr 'unsafe-inline'",
    ].join("; "),
  );
  if (page) {
    headers.set("etag", etagForHash(page.hash));
    headers.set("x-thread-page-stale", String(page.stale));
    // The shell already polls this route for revision changes, so the working
    // state rides along on that response: no extra request, and nothing for a
    // page or an agent to implement.
    if (activity) headers.set("x-thread-page-activity", activity);
    headers.set("x-thread-page-updated-at", String(page.updatedAt));
  }
  return headers;
}

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

interface BridgeEnvelope {
  actionToken: string;
  request: unknown;
  confirmation: string | null;
}

function parseBridgeEnvelope(value: unknown): BridgeEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  const allowed = new Set(["actionToken", "request", "confirmation"]);
  if (
    keys.length < 2 ||
    keys.length > 3 ||
    !keys.includes("actionToken") ||
    !keys.includes("request") ||
    keys.some((key) => !allowed.has(key)) ||
    typeof input.actionToken !== "string" ||
    input.actionToken.length > 4_096
  ) {
    return null;
  }
  const confirmation = input.confirmation;
  if (
    confirmation !== undefined &&
    confirmation !== null &&
    (typeof confirmation !== "string" || confirmation.length > 4_096)
  ) {
    return null;
  }
  return {
    actionToken: input.actionToken,
    request: input.request,
    confirmation: typeof confirmation === "string" ? confirmation : null,
  };
}

function requestIdFrom(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).id
    : undefined;
}

function bridgeFailureStatus(code: BridgeErrorCode): number {
  if (code === "unknown_method") return 404;
  if (code === "stale_page" || code === "conflict") return 409;
  if (code === "unavailable") return 503;
  if (code === "handler_error" || code === "invalid_result") return 500;
  return 400;
}

function stableJsonStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJsonStringify(value[key] as JsonValue)}`,
    )
    .join(",")}}`;
}

function errorPage(message: string, status: number): Response {
  const nonce = randomBytes(18).toString("base64url");
  const headers = documentHeaders(nonce);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thread Page</title><style nonce="${nonce}">body{max-width:42rem;margin:4rem auto;padding:0 1rem;font:16px/1.5 system-ui;color:CanvasText;background:Canvas}h1{font-size:1.4rem}</style></head><body><main><h1>Thread Page</h1><p>${escapeHtml(message)}</p></main></body></html>`,
    { status, headers },
  );
}

function errorStatus(error: unknown): number {
  if (error instanceof PageNotFoundError) return 404;
  if (error instanceof PageTooLargeError) return 413;
  return 503;
}

function publicMessage(error: unknown): string {
  if (error instanceof PageNotFoundError) {
    return "This thread has no page yet. Run `bb thread-page init` in the thread first.";
  }
  if (error instanceof PageTooLargeError) {
    return `The thread page is larger than ${MAX_PAGE_BYTES / 1024} KiB.`;
  }
  return "The thread page is unavailable. Reconnect its source host and try again.";
}

function parseIfNoneMatch(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim());
}

export default async function threadPagesPlugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    agentInstructions: {
      type: "boolean",
      label: "Agent initialization hint",
      description:
        "Tell each new agent session to initialize and directly edit its Thread Page.",
      default: false,
    },
    workingLabel: {
      type: "string",
      label: "Working indicator text",
      description:
        "Shown in the page header while the thread is mid-turn, so a reader knows a new version is coming. Blank hides the indicator.",
      default: "Working — this is the last saved version",
    },
    homeThreadId: {
      type: "string",
      label: "Home page thread",
      description:
        "Thread whose page is the home page every other page links back to. Set it with `bb thread-page home`.",
      default: "",
    },
    pageSeedHtml: {
      type: "string",
      label: "New-page HTML seed",
      description:
        "Full HTML used only when bb thread-page init creates a missing page. {{TITLE}} is escaped and replaced.",
      experimental_multiline: true,
      default: DEFAULT_PAGE_SEED,
    },
    agentInstructionText: {
      type: "string",
      label: "Agent instruction",
      description:
        "Short instruction injected into eligible new sessions when Agent initialization hint is enabled.",
      experimental_multiline: true,
      default: DEFAULT_AGENT_INSTRUCTION,
    },
  });
  let currentSettings = await settings.get();
  settings.onChange((next) => {
    currentSettings = next;
  });

  bb.agents.configure((context) => {
    const base = { tools: [], skills: [] };
    const isRootOwnerThread =
      context.thread.parentThreadId === null &&
      context.thread.sourceThreadId === null &&
      context.origin.kind === null;
    return currentSettings.agentInstructions && isRootOwnerThread
      ? {
          ...base,
          instructions: currentSettings.agentInstructionText,
        }
      : base;
  });

  const signingKey = await getSigningKey(bb);
  const pages = createPageStore(bb);
  const baseRoute = `/api/v1/plugins/${bb.pluginId}/http`;

  /**
   * The public origin this bb is reachable at, or null when it is local-only.
   *
   * Thread Pages needs no port share of its own: its routes are part of the bb
   * server, so whatever origin reaches bb reaches them, already behind the same
   * owner login. This asks the Connect plugin for that origin so the link we
   * hand back is one the user can actually open on a phone. Connect being
   * absent, disabled, or unpaired is a normal local-only answer, not an error.
   */
  // Only a positive answer is cached. Caching "local-only" would keep handing
  // back a useless link for half a minute after Connect comes up, which is
  // exactly when the user is waiting for a link they can open on a phone.
  /**
   * Folder-picker selections, held here so the page never sees a real path.
   * Bounded and short-lived: a token is single use, expires in ten minutes,
   * and is only valid for the thread whose page requested it.
   */
  const folderSelections = new Map<
    string,
    { expiresAt: number; threadId: string; hostId: string; path: string }
  >();
  function pruneSelections(now: number): void {
    for (const [token, selection] of folderSelections) {
      if (selection.expiresAt <= now) folderSelections.delete(token);
    }
    while (folderSelections.size > 32) {
      const oldest = folderSelections.keys().next().value;
      if (oldest === undefined) break;
      folderSelections.delete(oldest);
    }
  }

  let cachedOrigin: { at: number; origin: string } | null = null;
  async function publicOrigin(): Promise<string | null> {
    const now = Date.now();
    if (cachedOrigin && now - cachedOrigin.at < 30_000) {
      return cachedOrigin.origin;
    }
    let origin: string | null = null;
    try {
      const status = (await bb.sdk.plugins.callRpc({
        pluginId: "connect",
        method: "status",
        input: null,
        // The Connect contract validates its own output; we only read two
        // fields, so an identity schema keeps zod out of this plugin.
        outputSchema: {
          parse: (value: unknown) => value,
        } as never,
      })) as { state?: unknown; url?: unknown } | null;
      if (
        status &&
        status.state === "connected" &&
        typeof status.url === "string"
      ) {
        origin = new URL(status.url).origin;
      }
    } catch {
      origin = null;
    }
    cachedOrigin = origin === null ? null : { at: now, origin };
    return origin;
  }

  /**
   * Whether another thread has a page, and its revision. A hub needs to know
   * which rows are worth linking; it never gets the page itself, its path, or
   * its host. A thread with no page is a normal answer, not an error.
   */
  async function pageAvailability(
    threadId: string,
  ): Promise<{ available: boolean; revision: string | null }> {
    try {
      const page = await pages.load(threadId);
      return { available: true, revision: page.hash };
    } catch {
      return { available: false, revision: null };
    }
  }

  const assetPreviews = new Map<
    string,
    { baseUrl: string; expiresAtMs: number }
  >();

  /**
   * A confined, path-shaped preview of this thread's asset directory, or null.
   * Missing directories and hosts without preview support are a normal, silent
   * absence: the page simply has no relative asset base.
   */
  async function assetBaseUrl(
    threadId: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const now = Date.now();
    const cached = assetPreviews.get(threadId);
    if (cached && cached.expiresAtMs - 30_000 > now) return cached.baseUrl;
    try {
      const location = await bb.sdk.threads.storageLocation({
        threadId,
        signal,
      });
      const rootPath = assetDirPath(location.storageRootPath);
      const listed = await bb.sdk.files.list({
        hostId: location.hostId,
        path: rootPath,
        limit: 1,
        signal,
      });
      if (!listed) return null;
      const preview = await bb.sdk.files.createPreview({
        hostId: location.hostId,
        rootPath,
        ttlMs: ASSET_PREVIEW_TTL_MS,
        signal,
      });
      const baseUrl = preview.baseUrl.endsWith("/")
        ? preview.baseUrl
        : `${preview.baseUrl}/`;
      assetPreviews.set(threadId, {
        baseUrl,
        expiresAtMs: preview.expiresAtMs,
      });
      if (assetPreviews.size > 64) {
        for (const [key, value] of assetPreviews) {
          if (value.expiresAtMs <= now) assetPreviews.delete(key);
        }
      }
      return baseUrl;
    } catch {
      // No asset directory, no preview support, or an offline host.
      return null;
    }
  }
  type SubmissionOutcome = {
    body: Record<string, unknown>;
    status: number;
  };
  const recentSubmissions = new Map<
    string,
    {
      expiresAt: number;
      fingerprint: string;
      outcome: Promise<SubmissionOutcome>;
    }
  >();
  const recentReplies = new Map<
    string,
    {
      expiresAt: number;
      fingerprint: string;
      outcome: Promise<{
        delivery: "started" | "queued" | "steered";
        duplicate: false;
      }>;
    }
  >();
  const viewerRates = new Map<
    string,
    { windowStartedAt: number; accepted: number; inFlight: number; touchedAt: number }
  >();

  function acquireViewerRequest(
    threadId: string,
    actionToken: string,
    now: number,
  ): (() => void) | null {
    for (const [key, entry] of viewerRates) {
      if (entry.inFlight === 0 && now - entry.touchedAt > VIEWER_TOKEN_TTL_MS) {
        viewerRates.delete(key);
      }
    }
    const key = `${threadId}:${sha256Text(actionToken)}`;
    const current = viewerRates.get(key);
    const entry =
      current ??
      { windowStartedAt: now, accepted: 0, inFlight: 0, touchedAt: now };
    if (now - entry.windowStartedAt >= 60_000) {
      entry.windowStartedAt = now;
      entry.accepted = 0;
    }
    if (entry.inFlight >= 4 || entry.accepted >= 30) return null;
    entry.accepted += 1;
    entry.inFlight += 1;
    entry.touchedAt = now;
    viewerRates.set(key, entry);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.inFlight = Math.max(0, entry.inFlight - 1);
      entry.touchedAt = Date.now();
    };
  }

  function pruneSubmissions(now: number): void {
    for (const [key, entry] of recentSubmissions) {
      if (entry.expiresAt <= now) recentSubmissions.delete(key);
    }
    while (recentSubmissions.size >= MAX_RECENT_SUBMISSIONS) {
      const oldest = recentSubmissions.keys().next().value as string | undefined;
      if (!oldest) break;
      recentSubmissions.delete(oldest);
    }
  }

  function pruneReplies(now: number): void {
    for (const [key, entry] of recentReplies) {
      if (entry.expiresAt <= now) recentReplies.delete(key);
    }
    while (recentReplies.size >= MAX_RECENT_SUBMISSIONS) {
      const oldest = recentReplies.keys().next().value as string | undefined;
      if (!oldest) break;
      recentReplies.delete(oldest);
    }
  }

  bb.cli.register({
    name: "thread-page",
    summary: "Initialize the directly editable HTML page for the current thread",
    commands: [
      {
        name: "init",
        summary: "Create the current thread's page if it does not exist",
        usage: "bb thread-page init",
      },
      {
        name: "guide",
        summary: "Print the optional authoring and bridge guide",
        usage: "bb thread-page guide",
      },
      {
        name: "home",
        summary: "Make this thread's page the home page every page links to",
        usage: "bb thread-page home [--clear]",
      },
    ],
    async run(argv, context) {
      if (argv.length === 1 && argv[0] === "guide") {
        return { exitCode: 0, stdout: `${AUTHORING_GUIDE}\n` };
      }
      if (argv[0] === "home") {
        if (argv.length === 2 && argv[1] === "--clear") {
          await settings.experimental_set({ homeThreadId: null });
          return {
            exitCode: 0,
            stdout: "home: cleared — pages no longer show a Sessions link\n",
          };
        }
        if (argv.length !== 1) {
          return {
            exitCode: 2,
            stderr: "Usage: bb thread-page home [--clear]\n",
          };
        }
        if (!context.threadId) {
          return {
            exitCode: 2,
            stderr: "Run `bb thread-page home` from the thread that should be home.\n",
          };
        }
        await settings.experimental_set({ homeThreadId: context.threadId });

        // Write the session hub, but only when this thread has no page yet.
        // A page the user already has is never replaced.
        let wrote = false;
        try {
          const location = await bb.sdk.threads.storageLocation({
            threadId: context.threadId,
            signal: context.signal,
          });
          const home = renderHomeSeed(currentSettings.pageSeedHtml);
          const write = await bb.sdk.files.write({
            hostId: location.hostId,
            path: pagePath(location.storageRootPath),
            rootPath: location.storageRootPath,
            content: home,
            createParents: true,
            expectedSha256: null,
            mode: 0o600,
          });
          if (write.outcome === "written") {
            wrote = true;
            await pages.remember(context.threadId, {
              fragment: home,
              hash: /^[a-f0-9]{64}$/i.test(write.sha256)
                ? write.sha256.toLowerCase()
                : sha256Text(home),
              updatedAt: Date.now(),
            });
          }
        } catch (error) {
          bb.log.warn(
            `Could not seed the home page for ${context.threadId}: ${errorText(error)}`,
          );
        }

        const origin = await publicOrigin();
        const homeRoute = `${baseRoute}/home`;
        return {
          exitCode: 0,
          stdout: [
            `home: ${context.threadId}`,
            `link: [Sessions](${origin ? `${origin}${homeRoute}` : homeRoute})`,
            "Every other page now shows a Sessions link back to this one.",
            wrote
              ? "state: NEW — a session hub grouped by project was written for you. Adjust it like any page."
              : "state: EXISTING — this thread already had a page; it was left alone. It should list threads with threads.snapshot.",
            "",
          ].join("\n"),
        };
      }
      if (argv.length !== 1 || argv[0] !== "init") {
        return {
          exitCode: 2,
          stderr: "Usage: bb thread-page <init|guide|home>\n",
        };
      }
      if (!context.threadId) {
        return {
          exitCode: 0,
          stdout:
            "state: SKIP — no current root thread; answer normally without creating a page.\n",
        };
      }

      try {
        const thread = await bb.sdk.threads.get({
          threadId: context.threadId,
          signal: context.signal,
        });
        if (!isEligibleThread(thread)) {
          return {
            exitCode: 0,
            stdout:
              "state: SKIP — not a current root owner thread; answer normally without creating a page.\n",
          };
        }

        const location = await bb.sdk.threads.storageLocation({
          threadId: context.threadId,
          signal: context.signal,
        });
        const absolutePath = pagePath(location.storageRootPath);
        const title = thread.title ?? thread.titleFallback ?? "Thread Page";
        const fragment = renderPageSeed(currentSettings.pageSeedHtml, title);
        if (Buffer.byteLength(fragment, "utf8") > MAX_PAGE_BYTES) {
          throw new PageTooLargeError();
        }
        const write = await bb.sdk.files.write({
          hostId: location.hostId,
          path: absolutePath,
          rootPath: location.storageRootPath,
          content: fragment,
          createParents: true,
          expectedSha256: null,
          mode: 0o600,
        });

        let state: "created" | "existing";
        if (write.outcome === "written") {
          state = "created";
          await pages.remember(context.threadId, {
            fragment,
            hash: /^[a-f0-9]{64}$/i.test(write.sha256)
              ? write.sha256.toLowerCase()
              : sha256Text(fragment),
            updatedAt: Date.now(),
          });
        } else {
          state = "existing";
          await pages.load(context.threadId, context.signal);
        }

        const route = `${baseRoute}/page?threadId=${encodeURIComponent(context.threadId)}`;
        // Prefer the remote origin, because a relative or loopback link is
        // useless on the phone the user is most likely holding.
        const origin = await publicOrigin();
        const link = origin ? `${origin}${route}` : route;
        return {
          exitCode: 0,
          stdout: [
            `page: ${absolutePath}`,
            `link: [Open the Thread Page](${link})`,
            state === "created"
              ? "state: NEW — seeded; make this HTML app fit the task, keep a response path, then reply in chat only with the link."
              : "state: EXISTING — read before editing; update the HTML app every turn, keep a response path, then reply in chat only with the link.",
            "guide: bb thread-page guide  (only when the page needs custom UI, files, activity, or bridge methods)",
            "",
          ].join("\n"),
        };
      } catch (error) {
        return {
          exitCode: 1,
          stderr: `Could not initialize Thread Page: ${errorText(error)}\n`,
        };
      }
    },
  });

  bb.http.route(
    "GET",
    "/page",
    async (context) => {
      const threadId = new URL(context.req.url).searchParams.get("threadId");
      if (!isValidThreadId(threadId)) {
        return errorPage("A valid threadId query parameter is required.", 400);
      }

      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (!isEligibleThread(thread)) {
          return errorPage("Thread Pages are available only for current root threads.", 404);
        }
        const page = await pages.load(threadId);
        const now = Date.now();
        const renderPayload: PageTokenPayload = {
          v: 2,
          scope: "render",
          threadId,
          pageHash: page.hash,
          iat: now,
          exp: now + VIEWER_TOKEN_TTL_MS,
        };
        const actionPayload: PageTokenPayload = {
          ...renderPayload,
          scope: "action",
        };
        const renderToken = signPageToken(renderPayload, signingKey);
        const actionToken = signPageToken(actionPayload, signingKey);
        const documentUrl = `${baseRoute}/document?render=${encodeURIComponent(renderToken)}`;
        const nonce = randomBytes(18).toString("base64url");
        const title = thread.title ?? thread.titleFallback ?? "Thread Page";
        const html = renderOuterPage({
          nonce,
          title,
          actionToken,
          pageHash: page.hash,
          expiresAt: renderPayload.exp,
          documentUrl,
          submitUrl: `${baseRoute}/submit`,
          uploadUrl: `${baseRoute}/upload`,
          bridgeUrl: `${baseRoute}/bridge`,
          pageUrlTemplate: `${baseRoute}/page?threadId=__THREAD__`,
          bbThreadUrlTemplate: `/threads/__THREAD__`,
          // The home link is chrome, so every page gets it without the agent
          // writing one. Home itself gets no link back to itself.
          homeUrl:
            isValidThreadId(currentSettings.homeThreadId.trim()) &&
            currentSettings.homeThreadId.trim() !== threadId
              ? `${baseRoute}/home`
              : null,
          working:
            activityState(thread as unknown as Record<string, unknown>) ===
            "working",
          workingLabel: currentSettings.workingLabel,
          stale: page.stale,
        });
        return new Response(html, { status: 200, headers: outerHeaders(nonce) });
      } catch (error) {
        return errorPage(publicMessage(error), errorStatus(error));
      }
    },
    { auth: "local" },
  );

  /**
   * The home page: a redirect to whichever thread's page has been designated
   * home. It is deliberately not a dashboard of its own — the home page is an
   * ordinary agent-authored Thread Page, so it can be redesigned like any
   * other and can render the session list however it likes.
   */
  bb.http.route(
    "GET",
    "/home",
    async () => {
      const homeThreadId = currentSettings.homeThreadId.trim();
      if (!isValidThreadId(homeThreadId)) {
        return errorPage(
          "No home page is set yet. Run `bb thread-page home` in the thread whose page should be home.",
          404,
        );
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: `${baseRoute}/page?threadId=${encodeURIComponent(homeThreadId)}`,
          "cache-control": "no-store, max-age=0",
        },
      });
    },
    { auth: "local" },
  );

  const serveDocument = async (context: Parameters<Parameters<typeof bb.http.route>[2]>[0]) => {
    const renderToken = new URL(context.req.url).searchParams.get("render");
    const payload = renderToken
      ? verifyPageToken(renderToken, signingKey, "render")
      : null;
    if (!payload) return errorPage("This page session is invalid or expired.", 401);

    try {
      const thread = await bb.sdk.threads.get({ threadId: payload.threadId });
      if (!isEligibleThread(thread)) {
        return errorPage("This thread no longer has an active Thread Page.", 404);
      }
      const page = await pages.load(payload.threadId);
      const nonce = randomBytes(18).toString("base64url");
      const assetBase = await assetBaseUrl(payload.threadId);
      const headers = documentHeaders(
        nonce,
        page,
        assetCspSource(assetBase, context.req.url),
        activityState(thread as unknown as Record<string, unknown>),
      );
      const etag = etagForHash(page.hash);
      const ifNoneMatch = context.req.header("if-none-match");
      const matches = parseIfNoneMatch(ifNoneMatch).some(
        (candidate) => candidate === etag || candidate === "*",
      );
      if (matches) return new Response(null, { status: 304, headers });
      // A conditional GET is the outer shell's bodyless revision probe. A
      // changed ETag must reach it before the old viewer-token hash is refused.
      if (ifNoneMatch) return new Response(null, { status: 200, headers });
      if (page.hash !== payload.pageHash) {
        return errorPage("This page changed. Reload the outer Thread Page.", 409);
      }
      // The document keeps the origin-relative base so it works through
      // loopback, Connect, and Tailscale alike; only the CSP needs absolute.
      const html = renderDocument({
        fragment: page.fragment,
        nonce,
        pageHash: page.hash,
        stale: page.stale,
        assetBase,
      });
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return errorPage(publicMessage(error), errorStatus(error));
    }
  };

  bb.http.route("GET", "/document", serveDocument, { auth: "local" });

  /**
   * A file the page attached to a form.
   *
   * bb's "local" auth requires an application/json body on non-GET requests
   * (that is what forces the CORS preflight), so the bytes arrive base64-encoded
   * in a JSON envelope. Authority comes from the action token, never from the
   * body, and the file lands in this thread's confined upload directory under a
   * plugin-generated name.
   */
  bb.http.route(
    "POST",
    "/upload",
    async (context) => {
      // base64 costs 4 bytes per 3, plus the small JSON envelope.
      const maxBodyBytes = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4096;
      const declared = Number(context.req.header("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > maxBodyBytes) {
        return jsonResponse(
          { ok: false, error: "Attachments must be smaller than 24 MiB" },
          413,
        );
      }

      let envelope: Record<string, unknown>;
      try {
        const decoded = (await context.req.json()) as unknown;
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
          throw new Error("not an object");
        }
        envelope = decoded as Record<string, unknown>;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
      }

      const actionToken =
        typeof envelope.actionToken === "string" ? envelope.actionToken : "";
      const action =
        actionToken.length > 0 && actionToken.length <= 4096
          ? verifyPageToken(actionToken, signingKey, "action")
          : null;
      if (!action) {
        return jsonResponse(
          { ok: false, error: "Page session is invalid or expired" },
          401,
        );
      }
      if (
        typeof envelope.content !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.content) ||
        envelope.content.length > maxBodyBytes
      ) {
        return jsonResponse(
          { ok: false, error: "Attachment content must be base64" },
          400,
        );
      }

      const now = Date.now();
      const releaseRequest = acquireViewerRequest(
        action.threadId,
        actionToken,
        now,
      );
      if (!releaseRequest) {
        return jsonResponse(
          { ok: false, error: "Too many Thread Page requests; try again shortly" },
          429,
        );
      }

      try {
        const thread = await bb.sdk.threads.get({ threadId: action.threadId });
        if (!isEligibleThread(thread)) {
          return jsonResponse(
            { ok: false, error: "This thread no longer accepts attachments" },
            409,
          );
        }

        const body = Buffer.from(envelope.content as string, "base64");
        if (body.byteLength === 0) {
          return jsonResponse({ ok: false, error: "The file is empty" }, 400);
        }
        if (body.byteLength > MAX_UPLOAD_BYTES) {
          return jsonResponse(
            { ok: false, error: "Attachments must be smaller than 24 MiB" },
            413,
          );
        }

        const name = safeUploadName(
          typeof envelope.name === "string" ? envelope.name : "upload",
        );
        const stamp = new Date(now)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\..+$/, "")
          .replace("T", "-");
        const unique = randomBytes(3).toString("hex");
        const filename = `${stamp}-${unique}-${name}`;
        const location = await bb.sdk.threads.storageLocation({
          threadId: action.threadId,
        });
        const directory = uploadDirPath(location.storageRootPath);

        await bb.sdk.files.write({
          hostId: location.hostId,
          path: `${directory}/${filename}`,
          rootPath: location.storageRootPath,
          content: body.toString("base64"),
          contentEncoding: "base64",
          createParents: true,
          expectedSha256: null,
          mode: 0o600,
        });

        return jsonResponse({
          ok: true,
          name: filename,
          path: `${UPLOAD_DIRNAME}/${filename}`,
          sizeBytes: body.byteLength,
        });
      } catch (error) {
        bb.log.warn(
          `Could not store a Thread Page upload for ${action.threadId}: ${errorText(error)}`,
        );
        return jsonResponse(
          { ok: false, error: "The attachment could not be stored" },
          503,
        );
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" },
  );

  bb.http.route(
    "POST",
    "/submit",
    async (context) => {
      const contentLength = Number(context.req.header("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_SUBMISSION_BYTES) {
        return jsonResponse({ ok: false, error: "Submission is too large" }, 413);
      }

      let raw: string;
      let decoded: unknown;
      try {
        raw = await context.req.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_SUBMISSION_BYTES) {
          return jsonResponse({ ok: false, error: "Submission is too large" }, 413);
        }
        decoded = JSON.parse(raw) as unknown;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
      }

      const submission = parseSubmission(decoded);
      if (!submission) {
        return jsonResponse({ ok: false, error: "Invalid submission" }, 400);
      }
      const action = verifyPageToken(
        submission.actionToken,
        signingKey,
        "action",
      );
      if (!action) {
        return jsonResponse(
          { ok: false, error: "Page session is invalid or expired" },
          401,
        );
      }
      if (submission.pageHash !== action.pageHash) {
        return jsonResponse(
          { ok: false, error: "This form belongs to an older page revision" },
          409,
        );
      }

      const now = Date.now();
      const releaseRequest = acquireViewerRequest(
        action.threadId,
        submission.actionToken,
        now,
      );
      if (!releaseRequest) {
        return jsonResponse(
          { ok: false, error: "Too many Thread Page requests; try again shortly" },
          429,
        );
      }
      try {
      pruneSubmissions(now);
      const dedupeKey = `${action.threadId}:${submission.submissionId}`;
      const fingerprint = sha256Text(
        JSON.stringify({
          pageHash: submission.pageHash,
          title: submission.title,
          answers: submission.answers,
          files: submission.files,
        }),
      );
      const existing = recentSubmissions.get(dedupeKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return jsonResponse(
            { ok: false, error: "Submission ID was reused with different answers" },
            409,
          );
        }
        const repeated = await existing.outcome;
        return jsonResponse(repeated.body, repeated.status);
      }

      const outcome = (async (): Promise<SubmissionOutcome> => {
        try {
          const thread = await bb.sdk.threads.get({ threadId: action.threadId });
          if (!isEligibleThread(thread)) {
            return {
              body: {
                ok: false,
                error: "This thread no longer accepts Thread Page responses",
              },
              status: 409,
            };
          }
          const page = await pages.load(action.threadId);
          if (page.stale) {
            return {
              body: {
                ok: false,
                error:
                  "The source host is offline; this cached page is read-only",
              },
              status: 503,
            };
          }
          if (page.hash !== action.pageHash) {
            return {
              body: {
                ok: false,
                error: "This page changed; reload it before responding",
              },
              status: 409,
            };
          }

          const sent = await bb.sdk.threads.send({
            threadId: action.threadId,
            mode: "queue-if-active",
            input: [
              {
                type: "text",
                text: formatSubmissionMessage(submission),
                mentions: [],
              },
            ],
          });
          return {
            body: { ok: true, delivery: sent.delivery },
            status: 200,
          };
        } catch (error) {
          bb.log.warn(
            `Could not deliver Thread Page submission to ${action.threadId}: ${errorText(error)}`,
          );
          return {
            body: {
              ok: false,
              error: "Could not deliver the response to this thread",
            },
            status: 503,
          };
        }
      })();
      recentSubmissions.set(dedupeKey, {
        expiresAt: now + SUBMISSION_TTL_MS,
        fingerprint,
        outcome,
      });
      const delivered = await outcome;
      return jsonResponse(delivered.body, delivered.status);
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" },
  );

  bb.http.route(
    "POST",
    "/bridge",
    async (context) => {
      const contentLength = Number(context.req.header("content-length") ?? "0");
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_BRIDGE_BODY_BYTES
      ) {
        return jsonResponse(
          makeBridgeFailureResponse(
            undefined,
            "request_too_large",
            "Bridge request is too large",
          ),
          413,
        );
      }

      let decoded: unknown;
      try {
        const raw = await context.req.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_BRIDGE_BODY_BYTES) {
          return jsonResponse(
            makeBridgeFailureResponse(
              undefined,
              "request_too_large",
              "Bridge request is too large",
            ),
            413,
          );
        }
        decoded = JSON.parse(raw) as unknown;
      } catch {
        return jsonResponse(
          makeBridgeFailureResponse(
            undefined,
            "invalid_json",
            "Invalid JSON body",
          ),
          400,
        );
      }

      const envelope = parseBridgeEnvelope(decoded);
      if (!envelope) {
        return jsonResponse(
          makeBridgeFailureResponse(
            undefined,
            "invalid_request",
            "Invalid bridge envelope",
          ),
          400,
        );
      }
      const requestId = requestIdFrom(envelope.request);
      const action = verifyPageToken(
        envelope.actionToken,
        signingKey,
        "action",
      );
      if (!action) {
        return jsonResponse(
          makeBridgeFailureResponse(
            requestId,
            "invalid_request",
            "Page action session is invalid or expired",
          ),
          401,
        );
      }

      const releaseRequest = acquireViewerRequest(
        action.threadId,
        envelope.actionToken,
        Date.now(),
      );
      if (!releaseRequest) {
        return jsonResponse(
          makeBridgeFailureResponse(
            requestId,
            "rate_limited",
            "Too many Thread Page requests; try again shortly",
          ),
          429,
        );
      }

      try {
        const resolved = resolveBridgeInvocation(
          envelope.request,
          enabledBridgeRegistry,
          action.pageHash,
        );
        if (!resolved.ok) {
          return jsonResponse(
            makeBridgeFailureResponse(
              requestId,
              resolved.error.code,
              resolved.error.message,
            ),
            bridgeFailureStatus(resolved.error.code),
          );
        }
        // A confirmed method is answered once with a signed challenge and the
        // server's own summary. Trusted outer chrome shows that summary and
        // returns the challenge; the untrusted page never authors either.
        const nowForAuth = Date.now();
        let confirmation: unknown = null;
        if (resolved.value.capability.confirmation === "trusted-outer") {
          const paramsHash = sha256Text(
            stableJsonStringify(resolved.value.request.params as JsonValue),
          );
          if (envelope.confirmation === null) {
            const summary = (
              resolved.value.capability.summarize?.(
                resolved.value.params as never,
              ) ?? resolved.value.capability.description
            ).slice(0, 512);
            const challenge = signConfirmationChallenge(
              {
                v: 2,
                scope: "confirm",
                threadId: action.threadId,
                pageHash: action.pageHash,
                requestId: resolved.value.request.id,
                method: resolved.value.request.method,
                paramsHash,
                summary,
                iat: nowForAuth,
                exp: nowForAuth + CONFIRMATION_TTL_MS,
              },
              signingKey,
            );
            return jsonResponse(
              {
                confirm: {
                  requestId: resolved.value.request.id,
                  summary,
                  challenge,
                },
              },
              401,
            );
          }
          const verified = verifyConfirmationChallenge(
            envelope.confirmation,
            signingKey,
            nowForAuth,
          );
          if (
            !verified ||
            verified.threadId !== action.threadId ||
            verified.pageHash !== action.pageHash ||
            verified.requestId !== resolved.value.request.id ||
            verified.method !== resolved.value.request.method ||
            verified.paramsHash !== paramsHash
          ) {
            return jsonResponse(
              makeBridgeFailureResponse(
                requestId,
                "confirmation_invalid",
                "Confirmation is expired or does not match this request",
              ),
              bridgeFailureStatus("confirmation_invalid"),
            );
          }
          confirmation = createTrustedOuterConfirmation(resolved.value, {
            confirmedAtMs: verified.iat,
            expiresAtMs: verified.exp,
            humanSummary: verified.summary,
          });
        }

        const authorized = authorizeBridgeInvocation(
          resolved.value,
          confirmation,
          nowForAuth,
        );
        if (!authorized.ok) {
          return jsonResponse(
            makeBridgeFailureResponse(
              requestId,
              authorized.error.code,
              authorized.error.message,
            ),
            bridgeFailureStatus(authorized.error.code),
          );
        }

        const invocation = authorized.value;
        try {
          const thread = await bb.sdk.threads.get({ threadId: action.threadId });
          if (!isEligibleThread(thread)) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "conflict",
                "This thread no longer accepts Thread Page actions",
              ),
              409,
            );
          }
          const page = await pages.load(action.threadId);
          if (page.hash !== action.pageHash) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "stale_page",
                "The Thread Page revision has changed",
              ),
              409,
            );
          }

          if (invocation.request.method === "context.get") {
            const response = completeBridgeInvocation(invocation, {
              protocolVersion: 1,
              thread: {
                id: thread.id,
                title: (thread.title ?? thread.titleFallback ?? "Thread Page").slice(
                  0,
                  240,
                ),
                projectId: thread.projectId ?? null,
              },
              page: { revision: page.hash, readOnly: page.stale },
              capabilities: capabilityDescriptors(enabledBridgeRegistry),
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "thread.activity") {
            const params = invocation.params as ThreadActivityParams;
            const events = await bb.sdk.threads.events.list({
              threadId: action.threadId,
              order: "desc",
              limit: "80",
              types: ["item/started", "item/completed"],
            });
            const response = completeBridgeInvocation(invocation, {
              state: activityState(thread as unknown as Record<string, unknown>),
              updatedAtMs: Math.max(0, Math.trunc(thread.updatedAt)),
              items: activityItems(events, params.limit),
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "projects.list") {
            const projects = await bb.sdk.projects.list({
              includePersonal: true,
            });
            const response = completeBridgeInvocation(invocation, {
              projects: projects.slice(0, 64).map((project) => ({
                id: project.id,
                name: project.name,
                kind: project.kind === "personal" ? "personal" : "standard",
              })),
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "threads.snapshot") {
            const params = invocation.params as ThreadsSnapshotParams;
            // bb's `archived` flag selects archived threads rather than adding
            // them, so "include archived" is two lists merged, not one flag.
            const query = {
              ...(params.projectId ? { projectId: params.projectId } : {}),
              limit: params.limit,
            };
            const live = await bb.sdk.threads.list(query);
            const archived = params.includeArchived
              ? await bb.sdk.threads
                  .list({ ...query, archived: true })
                  .catch(() => [])
              : [];
            const seen = new Set<string>();
            const listed = [...live, ...archived]
              .filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
              })
              .slice(0, params.limit);
            // A projection, not the thread record: no prompts, paths, host
            // ids, provider ids, or section membership reach the page.
            const threads = await Promise.all(
              listed.map(async (item) => ({
                id: item.id,
                title: item.title ?? item.titleFallback ?? "Untitled",
                projectId: item.projectId ?? null,
                parentThreadId: item.parentThreadId ?? null,
                status: snapshotStatus(
                  item as unknown as Record<string, unknown>,
                ),
                archived: item.archivedAt !== null,
                page: await pageAvailability(item.id),
                updatedAtMs: Math.max(0, Math.trunc(item.updatedAt)),
              })),
            );
            const response = completeBridgeInvocation(invocation, {
              threads,
              nextCursor: null,
              generatedAtMs: Date.now(),
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "threads.continue") {
            const params = invocation.params as ThreadsContinueParams;
            if (params.threadId === action.threadId) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "invalid_params",
                  "Use thread.reply for this page's own thread",
                ),
                400,
              );
            }
            const target = await bb.sdk.threads
              .get({ threadId: params.threadId })
              .catch(() => null);
            if (!target || target.deletedAt !== null) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That thread is not available",
                ),
                404,
              );
            }
            const wasActive =
              target.status === "active" || target.status === "starting";
            const sent = await bb.sdk.threads.send({
              threadId: params.threadId,
              mode:
                params.mode === "steer" ? "steer-if-active" : "queue-if-active",
              input: [{ type: "text", text: params.prompt, mentions: [] }],
            });
            const response = completeBridgeInvocation(invocation, {
              threadId: params.threadId,
              delivery:
                sent.delivery === "queued"
                  ? "queued"
                  : params.mode === "steer" && wasActive
                    ? "steered"
                    : "started",
              duplicate: false,
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "projects.browse") {
            // The picker opens on the host, and the chosen path is kept here.
            // The page receives an opaque token and a display string, never a
            // filesystem path it could reuse or exfiltrate.
            const location = await bb.sdk.threads.storageLocation({
              threadId: action.threadId,
            });
            const picked = await bb.sdk.hosts.pickFolder({
              hostId: location.hostId,
              clientHostId: location.hostId,
            });
            if (!picked.path) {
              const response = completeBridgeInvocation(invocation, {
                selection: null,
              });
              return jsonResponse(response, response.ok ? 200 : 500);
            }
            const host = await bb.sdk.hosts
              .get({ hostId: location.hostId })
              .catch(() => null);
            const token = `sel.${randomBytes(18).toString("base64url")}`;
            pruneSelections(Date.now());
            folderSelections.set(token, {
              expiresAt: Date.now() + SELECTION_TTL_MS,
              threadId: action.threadId,
              hostId: location.hostId,
              path: picked.path,
            });
            const response = completeBridgeInvocation(invocation, {
              selection: {
                token,
                displayPath: picked.path.replace(/^\/Users\/[^/]+/, "~"),
                hostName: host?.name ?? "this device",
              },
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "projects.create") {
            const params = invocation.params as {
              selectionToken: string;
              name?: string;
            };
            pruneSelections(Date.now());
            const selection = folderSelections.get(params.selectionToken);
            // A selection belongs to the page that made it, and is single use.
            if (!selection || selection.threadId !== action.threadId) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That folder selection has expired; choose the folder again",
                ),
                404,
              );
            }
            folderSelections.delete(params.selectionToken);
            const created = await bb.sdk.projects.create({
              name:
                params.name ?? selection.path.split("/").pop() ?? "New project",
              hostId: selection.hostId,
              path: selection.path,
            } as never);
            const response = completeBridgeInvocation(invocation, {
              project: {
                id: created.id,
                name: created.name,
                kind: created.kind === "personal" ? "personal" : "standard",
              },
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (
            invocation.request.method === "storage.get" ||
            invocation.request.method === "storage.set"
          ) {
            // Namespaced by thread, so one page can never read another's
            // state even though they share bb's key-value table.
            const params = invocation.params as {
              key: string;
              value?: JsonValue;
            };
            const key = `state:${action.threadId}:${params.key}`;
            if (invocation.request.method === "storage.get") {
              const stored = await bb.storage.kv.get<JsonValue>(key);
              const response = completeBridgeInvocation(
                invocation,
                stored === undefined
                  ? { found: false }
                  : { found: true, value: stored },
              );
              return jsonResponse(response, response.ok ? 200 : 500);
            }
            await bb.storage.kv.set(key, params.value ?? null);
            const response = completeBridgeInvocation(invocation, {
              stored: true,
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "providers.list") {
            const providers = await bb.sdk.providers.list();
            const models = await bb.sdk.providers.models().catch(() => []);
            const byProvider = new Map<
              string,
              Array<{ id: string; displayName: string }>
            >();
            for (const model of models as Array<Record<string, unknown>>) {
              const providerId =
                typeof model.providerId === "string" ? model.providerId : null;
              const id = typeof model.id === "string" ? model.id : null;
              if (!providerId || !id) continue;
              const list = byProvider.get(providerId) ?? [];
              if (list.length < 32) {
                list.push({
                  id,
                  displayName:
                    typeof model.displayName === "string"
                      ? model.displayName
                      : id,
                });
              }
              byProvider.set(providerId, list);
            }
            const response = completeBridgeInvocation(invocation, {
              providers: (providers as Array<Record<string, unknown>>)
                .slice(0, 64)
                .map((provider) => {
                  const id = String(provider.id ?? "");
                  return {
                    id,
                    displayName: String(
                      provider.displayName ?? provider.name ?? id,
                    ),
                    available: provider.available !== false,
                    models: byProvider.get(id) ?? [],
                  };
                }),
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (invocation.request.method === "threads.spawn") {
            const params = invocation.params as ThreadsSpawnParams;
            const spawned = await bb.sdk.threads.spawn({
              projectId: params.projectId,
              prompt: params.prompt,
              ...(params.title ? { title: params.title } : {}),
              ...(params.providerId ? { providerId: params.providerId } : {}),
              ...(params.model ? { model: params.model } : {}),
              ...(params.reasoningLevel
                ? { reasoningLevel: params.reasoningLevel as never }
                : {}),
              // A thread the user asked a page to start is theirs, so it is a
              // visible root rather than a hidden helper of this thread.
              visibility: "visible",
            } as never);
            const response = completeBridgeInvocation(invocation, {
              threadId: spawned.id,
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (
            invocation.request.method === "threads.archive" ||
            invocation.request.method === "threads.stop"
          ) {
            const params = invocation.params as ThreadTargetParams;
            const destructive = invocation.request.method === "threads.stop";
            if (destructive && params.threadId === action.threadId) {
              // Stopping your own thread would kill the turn that is about to
              // read the answer, so it fails visibly instead.
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "invalid_params",
                  "A page cannot stop its own thread",
                ),
                400,
              );
            }
            const target = await bb.sdk.threads
              .get({ threadId: params.threadId })
              .catch(() => null);
            if (!target || target.deletedAt !== null) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That thread is not available",
                ),
                404,
              );
            }
            if (destructive) {
              await bb.sdk.threads.stop({ threadId: params.threadId });
              const response = completeBridgeInvocation(invocation, {
                stopped: true,
              });
              return jsonResponse(response, response.ok ? 200 : 500);
            }
            await bb.sdk.threads.archive({ threadId: params.threadId });
            const response = completeBridgeInvocation(invocation, {
              archived: true,
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          if (page.stale) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "unavailable",
                "The source host is offline; this cached page is read-only",
              ),
              503,
            );
          }

          const params = invocation.params as ThreadReplyParams;
          const dedupeKey = `${action.threadId}:${params.idempotencyKey ?? invocation.request.id}`;
          const fingerprint = sha256Text(
            stableJsonStringify({
              pageRevision: page.hash,
              result: params.result,
              mode: params.mode,
              ...(params.title === undefined ? {} : { title: params.title }),
            }),
          );
          const now = Date.now();
          pruneReplies(now);
          const existing = recentReplies.get(dedupeKey);
          if (existing) {
            if (existing.fingerprint !== fingerprint) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "conflict",
                  "Idempotency key was reused with a different reply",
                ),
                409,
              );
            }
            const repeated = await existing.outcome;
            const response = completeBridgeInvocation(invocation, {
              ...repeated,
              duplicate: true,
            });
            return jsonResponse(response, response.ok ? 200 : 500);
          }

          const wasActive =
            thread.status === "active" || thread.status === "starting";
          const outcome = (async () => {
            const sent = await bb.sdk.threads.send({
              threadId: action.threadId,
              mode:
                params.mode === "steer"
                  ? "steer-if-active"
                  : "queue-if-active",
              input: [
                {
                  type: "text",
                  text: formatThreadReplyMessage(params.title, params.result),
                  mentions: [],
                },
              ],
            });
            const delivery: "started" | "queued" | "steered" =
              sent.delivery === "queued"
                ? "queued"
                : params.mode === "steer" && wasActive
                  ? "steered"
                  : "started";
            return { delivery, duplicate: false as const };
          })();
          recentReplies.set(dedupeKey, {
            expiresAt: now + SUBMISSION_TTL_MS,
            fingerprint,
            outcome,
          });
          let delivered: Awaited<typeof outcome>;
          try {
            delivered = await outcome;
          } catch (error) {
            if (recentReplies.get(dedupeKey)?.outcome === outcome) {
              recentReplies.delete(dedupeKey);
            }
            throw error;
          }
          const response = completeBridgeInvocation(invocation, delivered);
          return jsonResponse(response, response.ok ? 200 : 500);
        } catch (error) {
          bb.log.warn(
            `Could not execute Thread Page bridge request for ${action.threadId}: ${errorText(error)}`,
          );
          return jsonResponse(
            makeBridgeFailureResponse(
              invocation.request.id,
              "handler_error",
              "Could not execute the Thread Page action",
            ),
            503,
          );
        }
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" },
  );
}
