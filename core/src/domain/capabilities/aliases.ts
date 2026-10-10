// `projects.list/browse/create` → `workspaces.*` (U34); `unknownMethodMessage` naming the new name.

/** Old names kept as aliases of the new methods until protocol version 2; absent from the roster. 03 §Renames (U34) */
export const METHOD_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "projects.list": "workspaces.list",
  "projects.browse": "workspaces.browse",
  "projects.create": "workspaces.create",
});

/** The method a request names, with an alias resolved to the method it stands for. 03 §Renames (U34) */
export function canonicalMethod(method: string): string {
  return METHOD_ALIASES[method] ?? method;
}

export function isAliasMethod(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(METHOD_ALIASES, method);
}

/** The `unknown_method` message for a method, naming the new name when an old one was used. 03 R5.6 */
export function unknownMethodMessage(method: string): string {
  const replacement = METHOD_ALIASES[method];
  return replacement ? `Unknown capability: ${method} (now ${replacement}, which this host does not enable)` : `Unknown capability: ${method}`;
}
