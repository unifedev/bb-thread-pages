import { escapeHtml } from "../../domain/html/escape.ts";

/**
 * An operator's own starting file for new pages. The product ships none: with
 * the setting empty, `init` creates nothing and the agent writes the whole
 * document. spec R6.18–R6.21, DECISIONS D11
 */
export function hasSeed(template: string): boolean {
  return template.trim().length > 0;
}

/** Applies the seed's substitutions; both are escaped. spec R6.21 */
export function renderSeed(template: string, title: string, now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return template.replaceAll("{{TITLE}}", escapeHtml(title)).replaceAll("{{DATE}}", escapeHtml(date));
}
