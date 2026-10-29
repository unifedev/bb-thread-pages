// The shell head's install identity and `GET /manifest`: the Syns mark, a name, a description, a manifest per address (05 R2.14, R2.14a, §Routes).
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { APPLE_TOUCH_ICON_PNG, FAVICON_SVG, ICON_192_PNG, ICON_512_PNG, ICON_MASKABLE_512_PNG } from "../generated/brand-icons.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import type { ServingContext, SessionAccess } from "./context.ts";
import { baseHeaders, failure } from "./responses.ts";
import { requireReader } from "./request.ts";
import { requirePageSession } from "./session-access.ts";

/** The product's public name: what the home installs as and describes itself by. 05 R2.14a */
export const PUBLIC_NAME = "Syns";

/** The browser's bar colour, the shell's own `--bg` in each scheme. 05 R2.14 */
export const THEME_COLOR = { light: "#f7f7f5", dark: "#111216" } as const;

/** What the shell's head says about its address; nothing of it is drawn. 05 R2.14, R2.14a */
export interface ShellHead {
  /** The installed app's name: the home's `Syns`, a session page's title. */
  appName: string;
  /** One line: the home's `Syns`, a session page's project name. */
  description: string;
  /** The manifest's address, relative to the shell's. */
  manifest: string;
  favicon: string;
  appleTouchIcon: string;
  theme: { light: string; dark: string };
}

/**
 * Whether an address installs as the home: the built-in home, or the page
 * designated as home, which `/home` redirects to, so a shortcut added from
 * it is the home's (`Syns`, opening `/home`). 05 R-S12, R2.14a
 */
async function installsAsHome(ctx: ServingContext, access: SessionAccess): Promise<boolean> {
  if (access.kind === "home") return true;
  return (await ctx.home.get().catch(() => null)) === access.record.id;
}

/** How long the shell waits for the project's name before it describes the page as `Syns`. */
export const PROJECT_NAME_WAIT_MS = 300;

/** The project a session runs in, by name, or null where the host has no such name or is slow to say; never fails or holds the shell. */
async function projectName(ctx: ServingContext, workspaceId: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROJECT_NAME_WAIT_MS);
  });
  const named = ctx.provider.workspaces
    .list()
    .then((workspaces) => workspaces.find((workspace) => workspace.id === workspaceId)?.name.trim() || null)
    .catch(() => null);
  try {
    return await Promise.race([named, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The head of the shell for one address, and the address its app opens (relative to `base()`). 05 R2.14, R2.14a */
export async function shellHead(ctx: ServingContext, access: SessionAccess): Promise<ShellHead & { start: string }> {
  if (await installsAsHome(ctx, access)) {
    return { appName: PUBLIC_NAME, description: PUBLIC_NAME, manifest: "manifest?home=1", start: "home", favicon: FAVICON_SVG, appleTouchIcon: APPLE_TOUCH_ICON_PNG, theme: THEME_COLOR };
  }
  const session = access as Extract<SessionAccess, { kind: "session" }>;
  const id = encodeURIComponent(session.record.id);
  const description = (await projectName(ctx, session.record.workspaceId)) ?? PUBLIC_NAME;
  return { appName: appTitle(session.record.title), description, manifest: `manifest?session=${id}`, start: `page?session=${id}`, favicon: FAVICON_SVG, appleTouchIcon: APPLE_TOUCH_ICON_PNG, theme: THEME_COLOR };
}

/** A session's title as an app name: bounded as the tab's, never empty. */
function appTitle(title: string): string {
  const bounded = title.trim().slice(0, LIMITS.titleChars);
  return bounded || PUBLIC_NAME;
}

/**
 * The web app manifest of one address. Every URL is relative to the
 * manifest's own, which sits beside the shell under `base()`. No `id`: a
 * browser resolves an explicit one against the origin, not the manifest, so
 * the default (the start URL, distinct for every address) is the one that
 * keeps each address its own app under any base. 05 R2.14a
 */
export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[];
}

/** The manifest's icons: the Syns mark on white, and one with the margin a round crop keeps. 05 R2.14a */
export const MANIFEST_ICONS: WebAppManifest["icons"] = [
  { src: ICON_192_PNG, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: ICON_512_PNG, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: ICON_MASKABLE_512_PNG, sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export function webAppManifest(head: Pick<ShellHead, "appName" | "description">, start: string): WebAppManifest {
  return {
    name: head.appName,
    short_name: head.appName,
    description: head.description,
    start_url: start,
    scope: "./",
    display: "standalone",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: MANIFEST_ICONS,
  };
}

/**
 * `GET /manifest?session=<id>` or `GET /manifest?home=1` — the web app
 * manifest of one address: a session page's opens that page under its title,
 * the home's (and the page designated as home's) opens `/home` as `Syns`. Each has its own `id`, so each installs
 * as its own app. Behind the reader like every route. 05 R2.4, R2.14a
 */
export function manifestRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      let access: SessionAccess;
      if (request.query.get("home") === "1") {
        access = { kind: "home" };
      } else {
        const id = request.query.get("session");
        if (!isSessionId(id)) throw new PageError("invalid_request", PUBLIC_MESSAGES.invalidSession);
        access = await ctx.sessionFor(id);
        requirePageSession(access);
      }
      const head = await shellHead(ctx, access);
      const manifest = webAppManifest(head, head.start);
      const headers = baseHeaders("application/manifest+json; charset=utf-8");
      return { status: 200, headers, body: new TextEncoder().encode(JSON.stringify(manifest)) };
    } catch (error) {
      return failure(error, ctx.log, "GET /manifest", false);
    }
  };
}
