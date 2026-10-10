// The operator's seed with escaped `{title}` substitution; there is no default seed (04 R6.18, R6.20–R6.21).
import { escapeHtml } from "../domain/html/escape.ts";

/** An operator configured a seed: anything but blank. 04 R6.20 */
export function hasSeed(seed: string | null): seed is string {
  return seed !== null && seed.trim().length > 0;
}

/** The seed with `{title}` substituted, HTML-escaped, so a title cannot inject markup. 04 R6.21 */
export function renderSeed(seed: string, title: string): string {
  return seed.replaceAll("{title}", escapeHtml(title));
}
