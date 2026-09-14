import { createHash } from "node:crypto";

/**
 * Defaults earlier versions shipped, recorded by hash. An install upgraded
 * from an earlier version can hold an earlier default as its stored value —
 * measured on the owner's install, where both settings were byte-for-byte the
 * 1.2.0 defaults — and then a new default never reaches it. A stored value
 * that is exactly one of these is read as "the current default"; a value an
 * operator changed by even one character is theirs and is kept.
 * spec R7.1, DECISIONS D11, D16
 */
export type PastDefaultKey = "agentInstructionText" | "pageSeedHtml";

export const PAST_DEFAULTS: Readonly<Record<PastDefaultKey, ReadonlySet<string>>> = {
  // The standing instruction of 1.0.3–1.2.0.
  agentInstructionText: new Set(["88d9816fb6d27169b151db457df450f076de421cbf68f9b7b140a8483c0f7aef"]),
  // The seed of 1.0.3, and of 1.1.0–1.2.0.
  pageSeedHtml: new Set([
    "11a943b27db00d4e7ea9ab5014cfff2cb2570a737028a8d283f98f6d25af55f0",
    "b1da21f912d912ee3400d40fabc7a1a677679ae55d076b20b5cf0ee299c89593",
  ]),
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isPastDefault(key: PastDefaultKey, value: string, known: Readonly<Record<PastDefaultKey, ReadonlySet<string>>> = PAST_DEFAULTS): boolean {
  return known[key].has(sha256Hex(value));
}
