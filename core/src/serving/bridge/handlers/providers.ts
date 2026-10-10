// `providers.list`: the AI providers, models, reasoning levels and permission modes a page may pass to `sessions.start`, and per provider the `settings` a running session accepts through `session.reply` (U47); a host that cannot list them fails clearly (03 R5.15; DESIGN §E.4).
import { PageError } from "../../../domain/errors.ts";
import { LIMITS } from "../../../domain/limits.ts";
import { boundTitle, handler } from "../handler.ts";

export const providersList = handler<null, unknown>({
  method: "providers.list",
  async execute(_params, context) {
    const providers = context.serving.provider.providers;
    if (!providers) throw new PageError("unknown_method", "This host does not list AI providers");
    let listed;
    try {
      listed = await providers.list();
    } catch (error) {
      // Never an empty list to mean "could not tell". 03 R5.15
      throw new PageError("unavailable", "The host could not list its AI providers right now", { cause: error });
    }
    return {
      result: {
        providers: boundedKeepingDefault(listed, LIMITS.providersMax).map((provider) => ({
          id: provider.id,
          displayName: boundTitle(provider.displayName),
          available: provider.available,
          default: provider.default,
          models: boundedKeepingDefault(provider.models, LIMITS.modelsPerProvider).map((model) => ({
            id: model.id,
            displayName: boundTitle(model.displayName),
            default: model.default,
            ...(model.reasoningLevels ? { reasoningLevels: model.reasoningLevels.slice(0, 32).map((level) => ({ id: level.id, displayName: boundTitle(level.displayName) })) } : {}),
          })),
          ...(provider.reasoningLevels ? { reasoningLevels: provider.reasoningLevels.slice(0, 32).map((level) => ({ id: level.id, displayName: boundTitle(level.displayName) })) } : {}),
          ...(provider.permissionModes ? { permissionModes: boundedKeepingDefault(provider.permissionModes, 32).map((mode) => ({ id: mode.id, displayName: boundTitle(mode.displayName), default: mode.default })) } : {}),
          // What a running session may change through `session.reply.settings`, with the scope of each; only the three known fields pass. U47
          settings: {
            ...(provider.settings?.model ? { model: provider.settings.model } : {}),
            ...(provider.settings?.reasoningLevel ? { reasoningLevel: provider.settings.reasoningLevel } : {}),
            ...(provider.settings?.permissionMode ? { permissionMode: provider.settings.permissionMode } : {}),
          },
        })),
      },
    };
  },
});

/**
 * A longer list is cut to the first N in the host's order, the default kept: a catalog longer than the cap (a host's
 * provider was measured listing 450 models with its default last) must still answer with exactly one default per list
 * (03 §`providers.list`, §`workspaces.list` for environments), so when the default falls past the cap it takes the last
 * kept slot. Order is otherwise the host's. The guide and 08 §Limits state the rule in these words (PC-17).
 */
export function boundedKeepingDefault<T>(items: readonly T[], max: number, isDefault: (item: T) => boolean = (item) => (item as { default: boolean }).default): T[] {
  if (items.length <= max) return [...items];
  const kept = items.slice(0, max);
  if (kept.some(isDefault)) return kept;
  const chosen = items.find(isDefault);
  if (chosen === undefined) return kept;
  kept[max - 1] = chosen;
  return kept;
}
