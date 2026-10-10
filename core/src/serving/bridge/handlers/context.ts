// `context.get`: the page's identity with the session's current settings where the host knows them (U50), `page.readOnly`, and the honest roster — built-in descriptors plus the current contributed methods, minus the sessionless ones on the built-in home (03 R5.9, R5.9a; DESIGN §E.4, DR-27).
import { SESSIONLESS_CAPABILITIES } from "../../../domain/capabilities/specs.ts";
import type { SessionRecord } from "../../../host/provider.ts";
import { rosterOf } from "../../contributions.ts";
import { boundTitle, handler, isHome } from "../handler.ts";
import { knownSettings } from "./settings.ts";

export const contextGet = handler<null, unknown>({
  method: "context.get",
  async execute(_params, context) {
    const { serving, session, page } = context;
    const roster = rosterOf(serving.registry, await serving.contributions.current());
    const capabilities = isHome(context) ? roster.filter((entry) => entry.contributor !== undefined || !SESSIONLESS_CAPABILITIES.has(entry.method)) : roster;
    return {
      result: {
        protocolVersion: 1,
        session: session.workspaceId === null ? null : { id: session.id, title: boundTitle(session.title), workspaceId: session.workspaceId, ...settingsOf(session) },
        page: { revision: page.revision, readOnly: page.stale || page.archived },
        capabilities,
      },
    };
  },
});

/** `{ settings }` for the page's own session when the provider's record carries any; nothing on the home page or where the host does not know. U50 */
function settingsOf(session: SessionRecord): { settings?: NonNullable<SessionRecord["settings"]> } {
  const settings = knownSettings(session);
  return settings ? { settings } : {};
}
