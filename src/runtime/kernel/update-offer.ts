/**
 * Inside an embed: a new version of this page exists and the reader is in the
 * middle of something, so it is offered rather than forced — the embedded
 * equivalent of the shell's "Page changed — reload when ready". Host-authored,
 * and drawn again if the page removes it. spec R4.46
 */
export const UPDATE_ATTRIBUTE = "data-thread-page-update";

export interface UpdateOffer {
  show(): void;
  /** Draws the offer again when the page's own changes removed it. */
  prepare(): void;
}

export function createUpdateOffer(doc: Document, accept: () => void): UpdateOffer {
  let offered = false;

  function draw(): void {
    if (!offered || !doc.body || doc.querySelector(`[${UPDATE_ATTRIBUTE}="host"]`)) return;
    const bar = doc.createElement("aside");
    bar.setAttribute(UPDATE_ATTRIBUTE, "host");
    bar.setAttribute("role", "status");
    bar.setAttribute(
      "style",
      "position:sticky;top:0;z-index:2147483647;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin:0;padding:.6rem 1rem;border-bottom:1px solid currentColor;font:600 14px/1.4 system-ui,sans-serif;background:Canvas;color:CanvasText",
    );
    const text = doc.createElement("span");
    text.textContent = "This page changed — what you typed is kept until you update.";
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = "Update";
    button.setAttribute("style", "font:inherit;padding:.2rem .7rem;cursor:pointer");
    button.addEventListener("click", () => {
      button.disabled = true;
      accept();
    });
    bar.append(text, button);
    doc.body.insertBefore(bar, doc.body.firstChild);
  }

  return {
    prepare: draw,
    show() {
      offered = true;
      draw();
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", draw, { once: true });
    },
  };
}
