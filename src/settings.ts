// bb.settings.define: five settings, read live (DESIGN §D, D-bb-15). bb's settings are a config surface, not
// a store: the values the core owns are forwarded as `PagesSettings` and never kept a second time.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createHash } from "node:crypto";
import type { PagesSettings } from "./core.ts";

/**
 * Five settings. 1.9's sixth, `homeSessionId`, is not declared and not read: the home designation is the core's
 * (`pages-core:home` in kv, `bb pages home`); a value 1.9 stored under that name is ignored here by construction,
 * since `readSettings` reads the five names below and nothing else (DESIGN §D, D-bb-15).
 */
export interface Settings {
  readonly agentInstructions: boolean;
  readonly agentInstructionText: string;
  readonly pageSeedHtml: string;
  readonly workingLabel: string;
  readonly embedAnswerGrants: boolean;
}

export const DEFAULT_WORKING_LABEL = "Working — this is the last saved version";

/**
 * Defaults earlier versions of this plugin shipped, by sha256: bb persists a default as the stored value, so an install
 * that came through those versions holds the then-default byte for byte (measured on the owner's install in 1.3.0,
 * `past-defaults.ts` of 1.3.0–1.9.0). A stored value equal to one reads as "the core's current text" — the operator
 * who never edited the instruction gets `bb pages` instead of `bb thread-page` (DR-4) and never a seed with 1.x's
 * `{{TITLE}}`/`{{DATE}}` placeholders; a value changed by one character is the operator's and is kept. Every hash 1.9
 * carried is carried here (review BI-2); the texts are in the public repository's tags, hashed in `test/settings.test.ts`.
 */
export const PAST_INSTRUCTION_DEFAULTS: ReadonlySet<string> = new Set([
  // The standing instruction of 1.0.3–1.2.0.
  "88d9816fb6d27169b151db457df450f076de421cbf68f9b7b140a8483c0f7aef",
  // 1.3.0's instruction before the scenarios revised it; it ran unreleased on the owner's install.
  "733cfbea19e110e909ab0ee4e910b0dbd280060b005b8045f8dd970587357a24",
  // The standing instruction of 1.3.0–1.9.0 (named `bb thread-page`).
  "9dac5ab7d484d0d41bf94b0959f24761649fe8719cfd9c8510469077a7c8f557",
]);

/** The page seed of 1.0.3, and of 1.1.0–1.2.0 (templates with `{{TITLE}}`/`{{DATE}}`); 1.3.0 onwards shipped no seed. */
export const PAST_SEED_DEFAULTS: ReadonlySet<string> = new Set([
  "11a943b27db00d4e7ea9ab5014cfff2cb2570a737028a8d283f98f6d25af55f0",
  "b1da21f912d912ee3400d40fabc7a1a677679ae55d076b20b5cf0ee299c89593",
]);

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

export function isPastInstructionDefault(text: string): boolean {
  return PAST_INSTRUCTION_DEFAULTS.has(sha256Hex(text));
}

export function isPastSeedDefault(text: string): boolean {
  return PAST_SEED_DEFAULTS.has(sha256Hex(text));
}

export interface LiveSettings {
  current(): Settings;
  /** The core's view (DR-4): `instructionText` null for a blank or past-default text; `seed` null when blank or a past default. */
  pages(): PagesSettings;
  onChange(listener: (next: Settings) => void): void;
}

export const SETTING_DESCRIPTORS = {
  agentInstructions: {
    type: "boolean",
    label: "Agent instructions",
    description: "Inject the standing Unife Pages instruction into every eligible new session. On from install; turn it off to stop new sessions writing pages.",
    default: true,
  },
  agentInstructionText: {
    type: "string",
    label: "Agent instruction text",
    description: "What eligible new sessions receive when Agent instructions is on. Empty: the built-in text. Changing it affects future sessions only.",
    experimental_multiline: true,
    default: "",
  },
  pageSeedHtml: {
    type: "string",
    label: "New-page starting file",
    description: "Optional. HTML a new page starts from; {title} is replaced, escaped. Empty (the default): `bb pages init` creates no file and the agent writes the whole page. Existing pages are never rewritten.",
    experimental_multiline: true,
    default: "",
  },
  workingLabel: {
    type: "string",
    label: "Working indicator text",
    description: "Shown in the page header while the owning session is mid-turn. Blank hides the indicator.",
    default: DEFAULT_WORKING_LABEL,
  },
  embedAnswerGrants: {
    type: "boolean",
    label: "Ask before a page answers another session",
    description: "A page can show another session's page inside it. On (the default): the first time you answer that session from inside the page, you are asked once and can revoke it in the page header. Off: never asked.",
    default: true,
  },
} as const;

export async function defineSettings(bb: BbPluginApi): Promise<LiveSettings> {
  const handle = bb.settings.define(SETTING_DESCRIPTORS);
  let current = readSettings(await handle.get());
  const listeners: ((next: Settings) => void)[] = [];
  handle.onChange((next) => {
    current = readSettings(next);
    for (const listener of listeners) listener(current);
  });
  return {
    current: () => current,
    pages: () => pagesSettingsOf(current),
    onChange: (listener) => void listeners.push(listener),
  };
}

export function readSettings(values: { agentInstructions?: unknown; agentInstructionText?: unknown; pageSeedHtml?: unknown; workingLabel?: unknown; embedAnswerGrants?: unknown }): Settings {
  return {
    agentInstructions: values.agentInstructions !== false, // on unless turned off (R8.16)
    agentInstructionText: typeof values.agentInstructionText === "string" ? values.agentInstructionText : "",
    pageSeedHtml: typeof values.pageSeedHtml === "string" ? values.pageSeedHtml : "",
    workingLabel: typeof values.workingLabel === "string" ? values.workingLabel.trim() : DEFAULT_WORKING_LABEL,
    embedAnswerGrants: values.embedAnswerGrants !== false,
  };
}

export function pagesSettingsOf(s: Settings): PagesSettings {
  const text = s.agentInstructionText.trim();
  return {
    instructionEnabled: s.agentInstructions,
    instructionText: text === "" || isPastInstructionDefault(s.agentInstructionText) ? null : s.agentInstructionText,
    workingLabel: s.workingLabel,
    seed: s.pageSeedHtml.trim() === "" || isPastSeedDefault(s.pageSeedHtml) ? null : s.pageSeedHtml,
    embedAnswerGrants: s.embedAnswerGrants,
    audioInputDeviceId: null, // no slot on bb (DESIGN §D, O-12)
  };
}
