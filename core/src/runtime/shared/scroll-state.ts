// `ScrollState { window: {x,y}; elements: { key, top, left }[] }`, the `elementKey` rule, the guard (05 R-S11; DESIGN §D.2).

export interface ScrollState {
  window: { x: number; y: number };
  /** At most `SCROLL_ELEMENTS` inner scrollers, the most recently scrolled kept. */
  elements: { key: string; top: number; left: number }[];
}

export const SCROLL_ELEMENTS = 64;

/**
 * How an inner scroller is named across revisions: `#<id>` when it has an
 * id, else `title:<data-title>`, else a `tag:nth-of-type` path from the body.
 * The kernel builds the path; this names the forms. DESIGN §D.2
 */
export function elementKey(element: { id?: string | null; title?: string | null; path?: string | null }): string | null {
  if (element.id) return `#${element.id}`;
  if (element.title) return `title:${element.title.trim()}`;
  if (element.path) return `path:${element.path}`;
  return null;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isScrollState(value: unknown): value is ScrollState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as ScrollState;
  if (typeof state.window !== "object" || state.window === null || !isCoordinate(state.window.x) || !isCoordinate(state.window.y)) return false;
  if (!Array.isArray(state.elements) || state.elements.length > SCROLL_ELEMENTS) return false;
  return state.elements.every((element) => typeof element === "object" && element !== null && typeof element.key === "string" && element.key.length > 0 && element.key.length <= 1024 && isCoordinate(element.top) && isCoordinate(element.left));
}
