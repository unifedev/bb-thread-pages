// `workspaces.list`, `workspaces.browse`, `workspaces.create` (and their `projects.*` aliases through the dispatcher): no path ever reaches a page; the picker's selection lives in the selection store under a single-use token (03 R-C5, R5.35–R5.37; DESIGN §E.4, P30).
import { PageError, mapProviderError } from "../../../domain/errors.ts";
import { LIMITS } from "../../../domain/limits.ts";
import { boundTitle, handler, quoted } from "../handler.ts";
import { boundedKeepingDefault } from "./providers.ts";

export const workspacesList = handler<null, unknown>({
  method: "workspaces.list",
  async execute(_params, context) {
    let workspaces;
    try {
      workspaces = await context.serving.provider.workspaces.list();
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "workspaces.list");
    }
    return {
      result: {
        workspaces: workspaces.slice(0, LIMITS.workspacesMax).map((workspace) => ({
          id: workspace.id,
          name: boundTitle(workspace.name),
          kind: workspace.kind,
          // Cut like a provider's models: the first N in the host's order, the default kept (PC-18).
          ...(workspace.environments ? { environments: boundedKeepingDefault(workspace.environments, LIMITS.environmentsPerWorkspace, (environment) => environment.isDefault).map((environment) => ({ id: environment.id, name: boundTitle(environment.name), isDefault: environment.isDefault })) } : {}),
        })),
      },
    };
  },
});

/** What the reader sees of a picked folder: the host's display string, reduced to its last folder name when it looks like a path. 03 R5.35 */
function displayOf(display: string): string {
  const text = display.trim();
  const path = /^(?:\/|[A-Za-z]:[\\/]|~[\\/]?)/.test(text);
  const last = path ? text.split(/[\\/]/).filter((segment) => segment.length > 0).pop() ?? text : text;
  const bounded = last.slice(0, 1024);
  return bounded.length > 0 ? bounded : "the chosen folder";
}

export const workspacesBrowse = handler<null, unknown>({
  method: "workspaces.browse",
  async summarize() {
    return "Choose a folder for a new workspace?";
  },
  async execute(_params, context) {
    const browse = context.serving.provider.workspaces.browse;
    if (!browse) throw new PageError("unknown_method", "This host has no folder picker");
    let picked;
    try {
      picked = await browse.call(context.serving.provider.workspaces);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "workspaces.browse");
    }
    if (!picked) return { result: { selection: null } };
    const display = displayOf(picked.display);
    const token = context.serving.selections.issue(context.session.id, picked.selection, display, context.serving.now());
    return { result: { selection: { token, display } } };
  },
});

const SELECTION_REFUSAL = "That folder selection is expired, already used or belongs to another page; choose the folder again";

export const workspacesCreate = handler<{ selectionToken: string; name?: string }, unknown>({
  method: "workspaces.create",
  /** A token the store no longer holds — redeemed, expired, another page's — is refused before any dialog. 03 R5.37 */
  async refuse(params, context) {
    if (!context.serving.selections.has(context.session.id, params.selectionToken, context.serving.now())) throw new PageError("invalid_params", SELECTION_REFUSAL);
  },
  async summarize(params) {
    return params.name !== undefined && params.name.trim().length > 0 ? `Create workspace ${quoted(params.name, 60)} from the folder you chose?` : "Create a workspace from the folder you chose?";
  },
  async execute(params, context) {
    const create = context.serving.provider.workspaces.create;
    if (!create) throw new PageError("unknown_method", "This host cannot create workspaces from a page");
    const selection = context.serving.selections.redeem(context.session.id, params.selectionToken, context.serving.now());
    if (!selection) throw new PageError("invalid_params", SELECTION_REFUSAL);
    try {
      const created = await create.call(context.serving.provider.workspaces, { selection: selection.selection, ...(params.name !== undefined ? { name: params.name } : {}) });
      return { result: { workspaceId: created.id } };
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "workspaces.create");
    }
  },
});
