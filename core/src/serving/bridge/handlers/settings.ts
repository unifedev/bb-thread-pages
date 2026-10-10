// `session.reply { settings }` checked against the session's provider row in `providers.list` before any dialog or delivery (03 §`session.reply`, §Errors `settings_unsupported`; U47), and the per-call confirmation of `permissionMode` worded like a decision (R-C7, U29).
import { SETTING_FIELDS, type SettingField } from "../../../domain/capabilities/specs.ts";
import { PageError, mapProviderError, settingsUnsupported } from "../../../domain/errors.ts";
import type { AppliedSettings, ProviderChoice, ReplySettings, SessionRecord, SessionSettings, SettingScope } from "../../../host/provider.ts";
import type { ServingContext } from "../../context.ts";
import { quotable } from "../../../domain/quotable.ts";
import { boundTitle, quoted } from "../handler.ts";

export interface CheckedSettings {
  /** The provider row the session belongs to. */
  readonly provider: ProviderChoice;
  /** The fields asked for with the scope the roster promises; the provider's `send` echoes the same or the call fails. */
  readonly scopes: AppliedSettings;
  /** The permission mode's display name, when one was asked for. */
  readonly permissionModeLabel: string | null;
}

/** The fields a reply names, in roster order; empty when `settings` is absent or empty. */
export function namedSettings(settings: ReplySettings | undefined): SettingField[] {
  if (!settings) return [];
  return SETTING_FIELDS.filter((field) => settings[field] !== undefined);
}

const SETTING_VALUE_MAX: Record<SettingField, number> = { model: 160, reasoningLevel: 64, permissionMode: 64 };

/**
 * A session's current settings as `context.get` and `sessions.snapshot` report them: the record's `settings`, kept to
 * the three known fields, each a non-empty one-line string the result validator accepts; anything else is dropped, and
 * an empty set is `undefined` so the key is absent rather than `{}`. The host reports what it knows, never a guess
 * (06 R-P2; U50).
 */
export function knownSettings(record: Pick<SessionRecord, "settings">): SessionSettings | undefined {
  const given = record.settings;
  if (!given) return undefined;
  const out: SessionSettings = {};
  for (const field of SETTING_FIELDS) {
    const value = given[field];
    if (typeof value === "string" && value.length > 0 && value.length <= SETTING_VALUE_MAX[field] && !/[\u0000-\u001f\u007f]/.test(value)) out[field] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The provider row a session runs on: by `providerId`, else the default row, else the first. 06 R-P2 `providerId` (U47) */
export function providerOf(record: SessionRecord, choices: readonly ProviderChoice[]): ProviderChoice | null {
  if (record.providerId !== undefined) return choices.find((choice) => choice.id === record.providerId) ?? null;
  return choices.find((choice) => choice.default) ?? choices[0] ?? null;
}

/**
 * Every named field must be one the provider's `settings` lists for running
 * sessions, and every value one it lists: `model` among `models[].id`,
 * `permissionMode` among `permissionModes[].id`, `reasoningLevel` among the
 * chosen model's own `reasoningLevels` where that model lists them, else the
 * provider's flat list. Anything else fails the whole call before any dialog
 * or delivery with `settings_unsupported` naming the fields. 03 §`session.reply`, U47
 */
export async function checkReplySettings(ctx: ServingContext, record: SessionRecord, settings: ReplySettings | undefined): Promise<CheckedSettings | null> {
  const named = namedSettings(settings);
  if (!settings || named.length === 0) return null;
  const providers = ctx.provider.providers;
  if (!providers) throw settingsUnsupported(named);
  let choices: ProviderChoice[];
  try {
    choices = await providers.list();
  } catch (error) {
    throw mapProviderError(error, ctx.log, "providers.list");
  }
  const provider = providerOf(record, choices);
  if (!provider) throw settingsUnsupported(named);
  const unsupported: SettingField[] = [];
  const scopes: { model?: SettingScope; reasoningLevel?: SettingScope; permissionMode?: SettingScope } = {};
  let permissionModeLabel: string | null = null;
  for (const field of named) {
    const scope = provider.settings[field];
    const value = settings[field]!;
    let listed = false;
    if (scope !== undefined) {
      if (field === "model") listed = provider.models.some((model) => model.id === value);
      else if (field === "permissionMode") {
        const mode = provider.permissionModes?.find((candidate) => candidate.id === value);
        listed = mode !== undefined;
        permissionModeLabel = mode?.displayName ?? null;
      } else {
        const chosen = settings.model !== undefined ? provider.models.find((model) => model.id === settings.model) : undefined;
        const levels = chosen?.reasoningLevels ?? provider.reasoningLevels ?? [];
        listed = levels.some((level) => level.id === value);
      }
    }
    if (scope === undefined || !listed) unsupported.push(field);
    else scopes[field] = scope;
  }
  if (unsupported.length) throw settingsUnsupported(unsupported);
  return { provider, scopes, permissionModeLabel };
}

/** The decision challenge's words for `settings.permissionMode`: the session, the mode and how long it holds. 03 R-C7, U29, U47 */
export function permissionModeSummary(record: SessionRecord, settings: ReplySettings, checked: CheckedSettings): string {
  const mode = settings.permissionMode;
  if (mode === undefined || checked.scopes.permissionMode === undefined) throw new PageError("invalid_params", "No permission mode to confirm");
  // The mode id is shown whole (it is at most 64 characters, `safeName`); the title at the bound `decisionSummary` uses. RS-11
  const label = checked.permissionModeLabel && checked.permissionModeLabel !== mode ? `${quoted(checked.permissionModeLabel, 64)} (${quotable(mode, 64)})` : `“${quotable(mode, 64)}”`;
  const holds = checked.scopes.permissionMode === "turn" ? "for this one answer" : "from now on, for the rest of the session";
  return `Set the permission mode of “${quotable(boundTitle(record.title)) || "untitled"}” (${record.id}) to ${label} ${holds}?`;
}
