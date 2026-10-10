// providers.list + providers.models (DESIGN §B.11): models, reasoning levels (per model, and their union), permission
// modes; exactly one default per list; `settings` — what `threads.send` takes per message (U47): every field with
// something to choose from, scope `turn`. A listing failure is `unavailable`, never an empty list (R5.15). The
// defaults are bb's own (BB-11): the provider is the general setting `defaultProviderId` (`system.config`) when it
// names an available one, else the first available; the permission mode is what the server picks for a thread that
// names none (`resolveSupportedPermissionMode`: "auto", else "full", else the first offered).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type ProviderChoice, type ProviderHost } from "../../core/src/host/index.ts";
import { asRecord } from "./errors.ts";

const PERMISSION_LABELS: Record<string, string> = { "accept-edits": "Accept edits", auto: "Auto", full: "Full access" };
const PERMISSION_MODE_PREFERENCE = ["auto", "full"] as const;

export const levelLabel = (level: string): string => level.charAt(0).toUpperCase() + level.slice(1);

/** The reasoning efforts a model row of `providers.models` lists, as ids. */
export function effortsOf(model: Record<string, unknown>): string[] {
  return unique((Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((e) => asRecord(e)?.reasoningEffort).filter((l): l is string => typeof l === "string"));
}

export function createBbProviders(bb: BbPluginApi): NonNullable<ProviderHost["providers"]> {
  return {
    async list() {
      let listed: unknown;
      try {
        listed = await bb.sdk.providers.list();
      } catch (error) {
        throw new ProviderError("unavailable", "providers.list: bb could not list providers", undefined, { cause: error });
      }
      const providers = (Array.isArray(listed) ? listed : []).map(asRecord).filter((p): p is Record<string, unknown> => p !== null && typeof p.id === "string");
      const general = asRecord(asRecord(await bb.sdk.system.config().catch(() => null))?.generalSettings);
      const preferredProvider = typeof general?.defaultProviderId === "string" ? general.defaultProviderId : null;
      const choices = await Promise.all(
        providers.map(async (provider): Promise<ProviderChoice> => {
          const id = provider.id as string;
          const catalog = asRecord(await bb.sdk.providers.models({ providerId: id }).catch(() => null));
          const models = (Array.isArray(catalog?.models) ? catalog.models : [])
            .map(asRecord)
            .filter((m): m is Record<string, unknown> => m !== null && typeof m.id === "string" && (m.providerId === undefined || m.providerId === id))
            .map((m) => ({ id: m.id as string, displayName: typeof m.displayName === "string" ? m.displayName : (m.id as string), default: m.isDefault === true, efforts: effortsOf(m) }));
          // Per model where the catalog says so (U47); the flat list stays as their union for readers of the first shape.
          const reasoningLevels = unique(models.flatMap((m) => m.efforts));
          const modes = (Array.isArray(asRecord(provider.capabilities)?.permissionModes) ? (asRecord(provider.capabilities)!.permissionModes as unknown[]) : []).filter((m): m is string => typeof m === "string");
          const choice: ProviderChoice = {
            id,
            displayName: typeof provider.displayName === "string" ? provider.displayName : id,
            available: provider.available !== false,
            default: id === preferredProvider,
            models: oneDefault(models.map(({ id: mid, displayName, default: d, efforts }) => ({ id: mid, displayName, default: d, ...(efforts.length > 0 ? { reasoningLevels: efforts.map((level) => ({ id: level, displayName: levelLabel(level) })) } : {}) }))),
            // `threads.send` takes `model`, `reasoningLevel` and `permissionMode` per message (`executionInputSources` explicit): each is a `turn` setting wherever there is something to choose from (U47).
            settings: {
              ...(models.length > 0 ? { model: "turn" as const } : {}),
              ...(reasoningLevels.length > 0 ? { reasoningLevel: "turn" as const } : {}),
              ...(modes.length > 0 ? { permissionMode: "turn" as const } : {}),
            },
          };
          if (reasoningLevels.length > 0) choice.reasoningLevels = reasoningLevels.map((level) => ({ id: level, displayName: levelLabel(level) }));
          const preferredMode = PERMISSION_MODE_PREFERENCE.find((mode) => modes.includes(mode)) ?? modes[0];
          if (modes.length > 0) choice.permissionModes = oneDefault(modes.map((mode) => ({ id: mode, displayName: PERMISSION_LABELS[mode] ?? mode, default: mode === preferredMode })));
          return choice;
        }),
      );
      return oneDefault(choices, (c) => c.available);
    },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Exactly one `default: true` per non-empty list: the first marked, else the first (available) one. */
function oneDefault<T extends { default: boolean }>(items: T[], prefer: (item: T) => boolean = () => true): T[] {
  if (items.length === 0) return items;
  const chosen = items.find((i) => i.default && prefer(i)) ?? items.find(prefer) ?? items[0]!;
  return items.map((item) => ({ ...item, default: item === chosen }));
}
