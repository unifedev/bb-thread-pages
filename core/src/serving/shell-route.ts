// `GET /page`: the shell HTML with `ShellConfig` (DESIGN §F.2); 404 page for deleted/unknown (05 R2.14–R2.16, R2.5).
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { HOME_IDENTITY, isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import type { ShellConfig } from "../runtime/shared/protocol.ts";
import type { ServingContext, SessionAccess } from "./context.ts";
import { describeGrants, documentAddressFrom, documentUrlFor, readMethodsFor } from "./document-route.ts";
import { failure, shellHeaders, html as htmlResponse } from "./responses.ts";
import { requireReader } from "./request.ts";
import { loadPageView, requirePageSession, type PageView } from "./session-access.ts";
import { renderShell } from "./shell-html.ts";
import { voiceAvailability } from "./voice.ts";

export interface ShellArgs {
  access: SessionAccess;
  path: string | null;
  query: string;
  view: PageView;
  title: string;
}

/** Everything the shell runtime is handed: tokens, routes, cadences, the grants, what is read-only. DESIGN §C.4 */
export async function buildShellConfig(ctx: ServingContext, request: PagesRequest, args: ShellArgs): Promise<ShellConfig> {
  const { access, path, query, view } = args;
  const session = access.kind === "home" ? HOME_IDENTITY : access.record.id;
  const base = ctx.serving.base();
  const action = mintActionToken({ session, revision: view.revision, path, now: ctx.now() }, ctx.signingKey);
  const settings = ctx.settings();
  const voice = await voiceAvailability(ctx, request);
  return {
    session,
    actionToken: action.token,
    pageRevision: view.revision,
    expiresAt: action.payload.exp,
    documentUrl: documentUrlFor(ctx, access, path, query, view.revision),
    documentPath: path ?? ENTRY_DOCUMENT,
    documentQuery: query,
    routes: {
      submit: `${base}/submit`,
      upload: `${base}/upload`,
      bridge: `${base}/bridge`,
      chromeAction: `${base}/chrome-action`,
      documentSession: `${base}/document-session`,
      transcribe: `${base}/transcribe`,
      attach: `${base}/attach`,
      home: `${base}/home`,
      page: `${base}/page`,
    },
    filesUrl: access.kind === "home" ? null : ctx.strategy.filesUrl(session),
    navigable: access.kind !== "home",
    title: args.title.slice(0, LIMITS.titleChars),
    builtinHome: access.kind === "home",
    workingLabel: settings.workingLabel,
    working: view.working,
    source: view.source,
    empty: view.empty,
    pollMs: LIMITS.shellPollMs,
    pollWorkingMs: LIMITS.shellPollWorkingMs,
    pollAfterAnswerMs: LIMITS.shellPollAfterAnswerMs,
    refreshSwapMs: LIMITS.refreshSwapMs,
    reload: { loopCount: LIMITS.reloadLoopCount, clearMs: LIMITS.reloadLoopClearMs, pingMs: LIMITS.reloadPingMs, waitMs: LIMITS.reloadWaitMs },
    grants: await describeGrants(ctx, session),
    maxUploadBytes: LIMITS.uploadFileBytes,
    maxUploads: LIMITS.uploadsPerForm,
    voice: { available: voice.available, reason: voice.reason, deviceId: settings.audioInputDeviceId },
    drafts: { retentionMs: LIMITS.draftRetentionMs, perSessionBytes: LIMITS.draftsPerSessionBytes, flushMs: LIMITS.draftFlushMs },
    deferredFiles: view.deferredFiles,
    readMethods: readMethodsFor(ctx),
  };
}

/** A nonce for the shell's one script and style. 05 R3.6 */
export function shellNonce(ctx: ServingContext): string {
  return Buffer.from(ctx.random(18)).toString("base64url");
}

/**
 * `GET /page?session=<id>[&path=<document>]` — the shell for one page, open at
 * its entry document or another of its documents. 05 R2.14–R2.16, 01 R1.12d
 */
export function shellRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      const id = request.query.get("session");
      if (!isSessionId(id)) throw new PageError("invalid_request", PUBLIC_MESSAGES.invalidSession);
      const { path, query } = documentAddressFrom(request.query);
      const access = await ctx.sessionFor(id);
      requirePageSession(access);
      const view = await loadPageView(ctx.pages, access, path);
      // A designated home is an agent's page: it is served as any page and gets none of the built-in home's duties (NS-1).
      const config = await buildShellConfig(ctx, request, { access, path, query, view, title: access.record.title });
      const nonce = shellNonce(ctx);
      const body = renderShell({ nonce, config });
      const headers = shellHeaders(nonce);
      return htmlResponse(200, body, { csp: headers.get("content-security-policy")!, permissionsPolicy: headers.get("permissions-policy")! });
    } catch (error) {
      return failure(error, ctx.log, "GET /page", true);
    }
  };
}
