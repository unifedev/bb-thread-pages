import { isRecord, type ShellConfig } from "../shared/protocol.ts";

/**
 * The bar's list of the sessions this page may answer from an embed, each
 * revocable. Trusted chrome: the page cannot see, draw over or click it, and
 * the titles come from the host. spec R5.65, DECISIONS D31
 */
export interface GrantElements {
  button: HTMLButtonElement;
  dialog: HTMLDialogElement;
}

export interface GrantsChrome {
  add(grant: { sessionId: string; title: string }): void;
}

export function createGrantsChrome(config: ShellConfig, elements: GrantElements, deps: { setStatus(text: string, warn: boolean): void; fetchImpl?: typeof fetch }): GrantsChrome {
  const { button, dialog } = elements;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const list = dialog.querySelector("ul");
  const close = dialog.querySelector<HTMLButtonElement>('button[value="close"]');
  let grants = [...config.grants];

  function render(): void {
    button.hidden = grants.length === 0;
    button.textContent = `Answers → ${grants.length}`;
    button.title = "Sessions this page may send your answers to";
    if (!list) return;
    list.textContent = "";
    for (const grant of grants) {
      const item = list.ownerDocument.createElement("li");
      const name = list.ownerDocument.createElement("span");
      name.textContent = grant.title || grant.sessionId;
      const revoke = list.ownerDocument.createElement("button");
      revoke.type = "button";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", () => void revokeGrant(grant.sessionId, revoke));
      item.append(name, revoke);
      list.appendChild(item);
    }
    if (grants.length === 0 && dialog.open) dialog.close();
  }

  async function revokeGrant(sessionId: string, control: HTMLButtonElement): Promise<void> {
    control.disabled = true;
    try {
      const response = await fetchImpl(config.chromeActionUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionToken: config.actionToken, action: "revoke-grant", sessionId }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isRecord(body) || body.ok !== true) throw new Error((isRecord(body) && typeof body.message === "string" && body.message) || `Request failed (${response.status})`);
      grants = grants.filter((grant) => grant.sessionId !== sessionId);
      render();
    } catch (error) {
      control.disabled = false;
      deps.setStatus(error instanceof Error ? error.message : "Could not revoke", true);
    }
  }

  button.addEventListener("click", () => {
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  });
  close?.addEventListener("click", () => {
    if (dialog.open) dialog.close();
  });
  render();

  return {
    add(grant) {
      if (!grants.some((entry) => entry.sessionId === grant.sessionId)) grants = [...grants, grant];
      render();
    },
  };
}
