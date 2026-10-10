// `quotable(text)`: host-foreign text (a title, a file name, a prompt) made safe to quote in a confirmation summary (05 R3.22a); `verbatim(text)` for text carried whole (a decision summary, 03 R-C7); `oneLine(text)` for a title on one line (02 §Framing lines).

// Quotation marks of every script the host might quote with.
const QUOTES = /["'`‘’‚‛“”„‟‹›«»「」『』＂＇]/g;
// C0 and C1 controls, zero-width characters (U+200B–U+200F, U+2060–U+2064, U+FEFF), bidi controls (U+202A–U+202E, U+2066–U+2069, U+061C).
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩؜﻿]/g;
// The same set less `\n` and `\t`, the two controls a summary's own layout uses.
const INVISIBLE_BUT_LAYOUT = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩؜﻿]/g;

/**
 * Text quoted from a session or a page cannot close its quotation and
 * continue in the host's voice: quotation marks, control, bidi and
 * zero-width characters are removed and whitespace collapsed. spec 05 R3.22a
 */
export function quotable(text: string, maxChars = 240): string {
  const cleaned = text.replace(/\s+/g, " ").replace(QUOTES, "").replace(INVISIBLE, "").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Text carried whole — the provider's decision summary, which the reader
 * approves as the provider will run it: quotation marks, line breaks and
 * tabs stay; only the hazard 05 R3.22a names goes (other C0/C1 controls,
 * bidi and zero-width characters). CR and CRLF become LF. 03 R-C7
 */
export function verbatim(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(INVISIBLE_BUT_LAYOUT, "");
}

/**
 * A title on one line: whitespace folded, control, bidi and zero-width
 * characters removed, quotation marks kept — so a framing line that names
 * a session cannot be split by the title it carries. 02 §Framing lines (T-22)
 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").replace(INVISIBLE, "").trim();
}
