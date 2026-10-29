// `GET /page/<id>/<document>` or `GET /document`: render token check, assembled document with kernel injected, ETag; the poll variant (`X-Pages-Poll`) and the carried strategy's file variant (05 R2.11–R2.13, R2.17, R2.25, R-S7a, R-S10; DESIGN §C.3, §F.3, P3).
import { addressDocumentUrl, addressQuery, checkDocumentQuery, checkDocumentUrl, directoryOf, documentKey, ENTRY_DOCUMENT, isDocumentPath } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { injectKernel } from "../domain/html/document.ts";
import { escapeHtml } from "../domain/html/escape.ts";
import { HOME_IDENTITY, isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { isOwnFilePath } from "../domain/own-files.ts";
import { etagFor, ifNoneMatchMatches } from "../domain/revision.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import { mintRenderToken, verifyRenderToken } from "../domain/tokens/render-token.ts";
import { KERNEL_RUNTIME } from "../generated/kernel-runtime.ts";
import type { ProviderHost } from "../host/provider.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { pageFileIo } from "../pages/assemble.ts";
import { contentTypeFor, versionOwnFiles } from "../pages/inline.ts";
import { HAND_OVER_HEADER, POLL_HEADER, SESSION_HEADER, SOURCE_HEADER, WORKING_HEADER, type PollBody } from "../runtime/shared/envelopes.ts";
import type { GrantSummary, KernelConfig } from "../runtime/shared/protocol.ts";
import type { ServingContext, SessionAccess } from "./context.ts";
import { EMPTY_DOCUMENT } from "./empty-page.ts";
import { baseHeaders, documentHeaders, failure, fileHeaders, json, noBody } from "./responses.ts";
import { requireReader } from "./request.ts";
import { loadPageView, requirePageSession, type PageView } from "./session-access.ts";
import { voiceAvailability } from "./voice.ts";

/**
 * The document a page address names: `path` is its path and query
 * (`path=tool.html?scope=a`); a query typed with a raw `&` arrives as further
 * parameters, which are the document's, in order. 01 R1.12d, R1.12g
 */
export function documentAddressFrom(params: URLSearchParams): { path: string | null; query: string } {
  const checked = checkDocumentUrl(addressDocumentUrl(params));
  if (checked.ok) return { path: checked.path, query: checked.query };
  if (checked.part === "query") throw new PageError("invalid_request", `That address's query cannot be carried: ${checked.message}.`);
  throw new PageError("not_found", "That is not a document of this page.");
}

/** The document's own query on a document load: every parameter the host does not use itself. 01 R1.12g */
export function documentQueryFrom(params: URLSearchParams): string {
  const checked = checkDocumentQuery(addressQuery(params, ""));
  return checked.ok ? checked.query : "";
}

function identityOf(access: SessionAccess): string {
  return access.kind === "home" ? HOME_IDENTITY : access.record.id;
}

/** The host's own line in a host document: the built-in home's `[data-thread-page-notice]` element, filled when there is something to say. 08 A61; U49 */
export const NOTICE_ATTRIBUTE = "data-thread-page-notice";

function withNotice(html: string, notice: string | null): string {
  if (!notice) return html;
  const marker = `<p ${NOTICE_ATTRIBUTE} hidden></p>`;
  if (!html.includes(marker)) return html;
  return html.replace(marker, `<p ${NOTICE_ATTRIBUTE} role="status">${escapeHtml(notice)}</p>`);
}

/**
 * The grants a page holds, with the target's current title; for the home,
 * every pair on the host with the granting page named, so the reader can see
 * and revoke them there (U49). 03 R5.65
 */
export async function describeGrants(ctx: ServingContext, identity: string): Promise<GrantSummary[]> {
  const home = identity === HOME_IDENTITY;
  const pairs = home ? await ctx.grants.listAll() : await ctx.grants.listFor(identity);
  const titles = new Map<string, string>();
  const titleOf = async (id: string): Promise<string> => {
    if (id === HOME_IDENTITY) return "Home";
    const known = titles.get(id);
    if (known !== undefined) return known;
    const record = isSessionId(id) ? await ctx.provider.sessions.get(id).catch(() => null) : null;
    const title = record?.title ?? id;
    titles.set(id, title);
    return title;
  };
  const summaries: GrantSummary[] = [];
  for (const pair of pairs) {
    const summary: GrantSummary = { sessionId: pair.to, title: await titleOf(pair.to), grantedAtMs: pair.grantedAtMs, lastAnsweredAtMs: pair.lastAnsweredAtMs, count: pair.count };
    if (home) {
      summary.from = pair.from;
      summary.fromTitle = await titleOf(pair.from);
    }
    summaries.push(summary);
  }
  return summaries;
}

/** Every read-effect method a hidden frame may call now: built-in reads plus the current contributed reads. DR-12 */
export function readMethodsFor(ctx: ServingContext): string[] {
  const contributed = ctx.contributions.cached().contributors.flatMap((contributor) => contributor.methods.filter((method) => method.effect === "read").map((method) => method.method));
  return [...ctx.registry.readMethods(), ...contributed];
}

/** Where the shell loads a document from, with a fresh render token for this revision. 05 §Tokens */
export function documentUrlFor(ctx: ServingContext, access: SessionAccess, path: string | null, query: string, revision: string): string {
  const session = identityOf(access);
  const render = mintRenderToken({ session, revision, path, now: ctx.now() }, ctx.signingKey).token;
  if (access.kind === "home") return `${ctx.serving.base()}/home-document?render=${encodeURIComponent(render)}`;
  return ctx.strategy.documentUrl(session, path, query, render);
}

export interface DocumentArgs {
  access: SessionAccess;
  path: string | null;
  /** The document's own query, "" or "?…". */
  query: string;
  /** A line the host puts into the document itself (the built-in home's stale-designation notice). 08 A61; U49 */
  notice?: string | null;
}

/**
 * The document load and the shell's conditional poll on one path (P3). The
 * poll is reader-authenticated and answers `304` or a `PollBody`; the load
 * needs a render token for this session, document and the current revision,
 * and serves the assembled document with the kernel injected under the
 * document CSP. 05 R2.7, R2.10–R2.13, R2.17, R2.25, R3.3, R3.30
 */
export async function serveDocument(ctx: ServingContext, request: PagesRequest, args: DocumentArgs): Promise<PagesResponse> {
  const { access, path, query } = args;
  const session = identityOf(access);
  const view = await loadPageView(ctx.pages, access, path);
  const etag = etagFor(view.revision);
  if (request.headers.get(POLL_HEADER) === "1") {
    const headers = baseHeaders("application/json; charset=utf-8");
    headers.set("etag", etag);
    headers.set(WORKING_HEADER, view.working ? "1" : "0");
    headers.set(SOURCE_HEADER, view.source);
    headers.set(SESSION_HEADER, "live");
    if (ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) return noBody(304, headers);
    const body = await pollBody(ctx, request, access, path, query, view);
    return { status: 200, headers, body: new TextEncoder().encode(JSON.stringify(body)) };
  }
  const token = verifyRenderToken(request.query.get("render"), ctx.signingKey, ctx.now());
  if (!token || token.session !== session || token.path !== path) throw new PageError("forbidden", PUBLIC_MESSAGES.tokenInvalid);
  if (token.revision !== view.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
  const config: KernelConfig = {
    pageRevision: view.revision,
    stale: view.stale,
    archived: view.archived,
    siteRoot: access.kind === "home" ? null : ctx.strategy.siteRoot(session, path),
    embedded: false,
    uploads: access.kind !== "home",
    documentPath: path ?? ENTRY_DOCUMENT,
    ownFilesByFrame: false,
    embedAvailable: true,
    // A page shown whole, on its own URL or as the built-in home. 07 R5.93 (B-0189)
    frame: false,
    deferredFiles: view.deferredFiles,
    swapIdleMs: LIMITS.swapIdleMs,
  };
  // The contributors' page scripts follow the kernel, asked for this document. 07 R5.88, R5.92
  const contributorScripts = await ctx.pageScripts.scriptsFor(access.kind === "home" ? null : session, path ?? ENTRY_DOCUMENT);
  let page = view.page?.html ?? EMPTY_DOCUMENT;
  // The shell's fetch for `onPageUpdate`, by-url: the document stays, so a file changed under the same name needs a new address. 02 R4.66; 05 R2.18
  if (view.page && access.kind !== "home" && ctx.strategy.kind === "by-url" && request.headers.get(HAND_OVER_HEADER) === "1") page = await versionOwnFiles(page, pageFileIo(ctx.provider, session), directoryOf(path));
  // No `<base>` on a top-level load in either strategy: the document is served at its own path, or carries its files. 02 R4.2; DR-13
  const html = injectKernel(withNotice(page, args.notice ?? null), { kernel: KERNEL_RUNTIME, config, baseHref: null, contributorScripts });
  return { status: 200, headers: documentHeaders(view.revision), body: new TextEncoder().encode(html) };
}

async function pollBody(ctx: ServingContext, request: PagesRequest, access: SessionAccess, path: string | null, query: string, view: PageView): Promise<PollBody> {
  const session = identityOf(access);
  const action = mintActionToken({ session, revision: view.revision, path, now: ctx.now() }, ctx.signingKey);
  return {
    revision: view.revision,
    actionToken: action.token,
    expiresAt: action.payload.exp,
    documentUrl: documentUrlFor(ctx, access, path, query, view.revision),
    working: view.working,
    source: view.source,
    empty: view.empty,
    deferredFiles: view.deferredFiles,
    grants: await describeGrants(ctx, session),
    voice: await voiceAvailability(ctx, request),
    readMethods: readMethodsFor(ctx),
  };
}

function isPoll(request: PagesRequest): boolean {
  return request.headers.get(POLL_HEADER) === "1";
}

/** A route failure on the document route: JSON for the poll and for what the shell handles itself, an HTML page for a reader who typed the address. 05 R2.5 */
function documentFailure(ctx: ServingContext, request: PagesRequest, error: unknown, where: string): PagesResponse {
  const code = PageError.is(error) ? error.code : "handler_error";
  const asPage = !isPoll(request) && code !== "forbidden" && code !== "stale_page" && code !== "unauthenticated";
  if (isPoll(request) && code === "not_found") return json(404, { code: "not_found", message: PageError.is(error) ? error.message : PUBLIC_MESSAGES.notFound });
  return failure(error, ctx.log, where, asPage);
}

function parseRange(header: string | null, size: number): { offset: number; length: number } | null | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, startText, endText] = match;
  if (startText === "" && endText === "") return undefined;
  if (startText === "") {
    const suffix = Math.min(Number(endText), size);
    return suffix === 0 ? null : { offset: size - suffix, length: suffix };
  }
  const start = Number(startText);
  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  if (start >= size || start > end) return null;
  return { offset: start, length: end - start + 1 };
}

/**
 * One of the page's own files to the authenticated reader on the path alone:
 * confined to the root, `CSP: sandbox`, `Content-Type` by extension,
 * `Content-Length`, `Range` honoured with 206, the file's ETag, no CORS
 * header, nothing executed. A document path never serves raw bytes. Shared by
 * the carried strategy's file variant and the Node serving host's file route.
 * 05 §Own files by URL, R-S4; 01 R1.4, R1.5, R1.12
 */
export async function serveOwnFile(provider: ProviderHost, request: PagesRequest, session: string, path: string): Promise<PagesResponse> {
  if (!isOwnFilePath(path) || isDocumentPath(path)) throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  const stat = await provider.files.stat(session, path).catch(() => null);
  if (!stat || stat.kind !== "file") throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = fileHeaders(contentTypeFor(path));
  headers.set("etag", etag);
  if (ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) return noBody(304, headers);
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === null) {
    headers.set("content-range", `bytes */${stat.size}`);
    return noBody(416, headers);
  }
  const wanted = range ?? { offset: 0, length: stat.size };
  if (wanted.length > LIMITS.shellFetchBytes) throw new PageError("request_too_large", `A file is served in ranges of at most ${LIMITS.shellFetchBytes} bytes`);
  const bytes = stat.size === 0 ? new Uint8Array(0) : await provider.files.read(session, path, range ? wanted : undefined);
  headers.set("content-length", String(bytes.byteLength));
  if (range) {
    headers.set("content-range", `bytes ${wanted.offset}-${wanted.offset + bytes.byteLength - 1}/${stat.size}`);
    return { status: 206, headers, body: bytes };
  }
  return { status: 200, headers, body: bytes };
}

/**
 * `GET /document?session=<id>[&path=<document>][&render=…]`, the exact
 * strategy; `?session=<id>&file=<relative>` alone (no `path`, no `render`, not
 * a poll) the carried strategy's file variant. Every document load carries
 * `render` and every poll the poll header, so a document's own `file`
 * parameter is the document's (B-0140). 05 R-S10, R-S7a; 01 R1.12g
 */
export function documentRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      const id = request.query.get("session");
      if (!isSessionId(id)) throw new PageError("not_found", PUBLIC_MESSAGES.invalidSession);
      const file = request.query.get("file");
      if (file !== null && !request.query.has("path") && !request.query.has("render") && !isPoll(request)) {
        if (ctx.strategy.kind !== "carried") throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
        const access = await ctx.sessionFor(id);
        requirePageSession(access);
        return await serveOwnFile(ctx.provider, request, id, file);
      }
      const { path, query } = documentAddressFrom(request.query);
      const access = await ctx.sessionFor(id);
      requirePageSession(access);
      return await serveDocument(ctx, request, { access, path, query });
    } catch (error) {
      return documentFailure(ctx, request, error, "GET /document");
    }
  };
}

/** `GET /page/<id>/<document>`, the prefix strategy: a document-path tail only; any other tail is `404` (the host's `files` route answers those). DR-17 */
export function prefixDocumentRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      const match = /^\/page\/([^/]+)\/(.*)$/.exec(request.path);
      let id: string | null = null;
      let tail = "";
      try {
        id = match ? decodeURIComponent(match[1]!) : null;
        tail = match ? decodeURIComponent(match[2]!) : "";
      } catch {
        throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
      }
      if (!isSessionId(id) || !isDocumentPath(tail)) throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
      const access = await ctx.sessionFor(id);
      requirePageSession(access);
      return await serveDocument(ctx, request, { access, path: documentKey(tail), query: documentQueryFrom(request.query) });
    } catch (error) {
      return documentFailure(ctx, request, error, "GET /page/*");
    }
  };
}
