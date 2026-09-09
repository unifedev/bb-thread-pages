/**
 * Names the 0.3.x API answered for, when a page still calls it. spec R5.38–R5.41
 *
 * 1.0.0 renamed the whole page-facing surface with no migration path, and the
 * only signal a page got back was `unknown_method: threads.spawn` — which
 * reads as "this host cannot do that" rather than "this is called something
 * else now". Naming the replacement turns a debugging session into a one-line
 * fix. There are no aliases and there will be none: the old name still fails.
 */
export const RENAMED_METHODS: Readonly<Record<string, string>> = Object.freeze({
  "threads.spawn": "sessions.start",
  "threads.snapshot": "sessions.snapshot",
  "threads.send": "sessions.send",
  "threads.stop": "sessions.stop",
  "threads.archive": "sessions.archive",
  "threads.activity": "session.activity",
  "threads.reply": "session.reply",
  "threads.openPage": "pages.open",
  "threads.openBb": "sessions.openHost",
  "thread.get": "context.get",
  "thread.reply": "session.reply",
  "thread.activity": "session.activity",
  "page.storage.get": "storage.get",
  "page.storage.set": "storage.set",
  "navigation.open": "navigation.openExternal",
});

/** The `unknown_method` message for a method, naming its replacement when there is one. */
export function unknownMethodMessage(method: string): string {
  const replacement = RENAMED_METHODS[method];
  return replacement
    ? `Unknown capability: ${method} (renamed to ${replacement} in 1.0; there is no alias)`
    : `Unknown capability: ${method}`;
}
