// `escapeHtml`, `escapeAttribute`, `jsonForScript`.

/** Text safe inside an element. 05 R3.6 */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Text safe inside a double-quoted attribute. 05 R3.6 */
export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

/** JSON that is safe inside an inline `<script>`: no `<`, no line separators. 05 R3.6 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
