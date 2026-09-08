import type { Context } from "hono";
import { isSessionId } from "../domain/ids.ts";
import type { ServingContext } from "./context.ts";
import { pageUrl } from "./context.ts";
import { errorPage } from "./responses.ts";

/** `GET /home` — a redirect to the designated home page, never a listing. spec R7.9, R7.4 */
export function homeRoute(serving: ServingContext) {
  return async (_context: Context): Promise<Response> => {
    const home = serving.settings.current().homeSessionId;
    if (!isSessionId(home)) {
      return errorPage(
        "No home page is set yet. A home page is an ordinary page some agent built and designated. To get one, ask any agent: “Set up my Thread Pages home page” — it runs `bb thread-page home` in a session dedicated to it and builds a hub of your sessions there. Or run `bb thread-page home` yourself in the session whose page should be home.",
        404,
      );
    }
    const session = await serving.host.sessions.get(home).catch(() => null);
    if (!session || session.deleted || session.archived) {
      return errorPage("The home page points at a session that no longer exists. Run `bb thread-page home` in another session, or `bb thread-page home --clear`.", 404);
    }
    return new Response(null, { status: 302, headers: { location: pageUrl(serving.routeBase, home), "cache-control": "no-store, max-age=0" } });
  };
}
