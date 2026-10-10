// projects.attachments.upload; refusal; no remove (DESIGN §B.10, X54). `attachmentId` is opaque: a random id the
// store maps to the stored item for a bounded time, so bb's absolute path of the stored file never leaves the
// server (05 R2.42; BB-4). `promptInput` resolves ids back into bb's composer shape, text first.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type AttachmentRef, type ProviderHost } from "../../core/src/host/index.ts";
import { randomBytes } from "node:crypto";
import { asRecord, sdkCall } from "./errors.ts";

export interface StoredAttachment { kind: "image" | "file"; path: string; name: string; mimeType: string; sizeBytes: number }

/** bb's caps on what it attaches: 10 MB for an image, 25 MB for any other file (host-daemon `_he`, `ph`). */
export const BB_ATTACHMENT_IMAGE_BYTES = 10 * 1024 * 1024;
export const BB_ATTACHMENT_FILE_BYTES = 25 * 1024 * 1024;
/** How long an issued id stays valid: longer than the core's upload window after an approved call (30 min). */
export const ATTACHMENT_TTL_MS = 60 * 60 * 1000;
export const ATTACHMENT_STORE_MAX = 512;
/** Live ids one owner may hold under the global cap; the owner is the workspace, the only key `upload` is given (BB-4b). */
export const ATTACHMENT_STORE_MAX_PER_OWNER = 64;

export interface AttachmentStore {
  /** A fresh opaque id for a stored item, held for its owner (the uploading workspace). */
  issue(stored: StoredAttachment, owner: string): string;
  /** The item behind an id this store issued; ProviderError `other` for anything else or after the TTL. */
  lookup(attachmentId: string): StoredAttachment;
}

export function createAttachmentStore(options: { now?: () => number; ttlMs?: number; max?: number; maxPerOwner?: number; random?: (bytes: number) => Uint8Array } = {}): AttachmentStore {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? ATTACHMENT_TTL_MS;
  const max = options.max ?? ATTACHMENT_STORE_MAX;
  const maxPerOwner = options.maxPerOwner ?? ATTACHMENT_STORE_MAX_PER_OWNER;
  const random = options.random ?? ((bytes: number) => new Uint8Array(randomBytes(bytes)));
  const items = new Map<string, { stored: StoredAttachment; owner: string; at: number }>();
  const oldestOf = (owner: string | null): string | undefined => {
    for (const [id, item] of items) if (owner === null || item.owner === owner) return id; // insertion order: the oldest first
    return undefined;
  };
  /** Expired ids go; then the owner's oldest beyond its share; then the oldest of all beyond the global cap. */
  function sweep(owner: string): void {
    const cutoff = now() - ttlMs;
    for (const [id, item] of items) if (item.at < cutoff) items.delete(id);
    while ([...items.values()].filter((item) => item.owner === owner).length > maxPerOwner) items.delete(oldestOf(owner)!);
    while (items.size > max) items.delete(oldestOf(null)!);
  }
  return {
    issue(stored, owner) {
      const id = Buffer.from(random(16)).toString("base64url");
      items.set(id, { stored: { ...stored }, owner, at: now() });
      sweep(owner);
      return id;
    },
    lookup(attachmentId) {
      const item = items.get(attachmentId);
      if (!item || item.at < now() - ttlMs) throw new ProviderError("other", "attachment id not issued by this host");
      return { ...item.stored };
    },
  };
}

export type PromptItem =
  | { type: "text"; text: string; mentions: never[] }
  | { type: "localImage"; path: string }
  | { type: "localFile"; path: string; name: string; mimeType: string; sizeBytes: number };

/** The prompt as bb's composer sends it: the text, then each attachment (R5.76). */
export function promptInput(text: string, attachments: readonly AttachmentRef[], store: AttachmentStore): PromptItem[] {
  return [
    { type: "text", text, mentions: [] },
    ...attachments.map((ref): PromptItem => {
      const stored = store.lookup(ref.attachmentId);
      return stored.kind === "image" ? { type: "localImage", path: stored.path } : { type: "localFile", path: stored.path, name: stored.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes };
    }),
  ];
}

export function createBbAttachments(bb: BbPluginApi, store: AttachmentStore): NonNullable<ProviderHost["attachments"]> {
  return {
    refusal(meta) {
      const type = (meta.type.split(";")[0] ?? "").trim().toLowerCase();
      if (/^image\/hei[cf](-sequence)?$/.test(type) || /\.hei[cf]$/i.test(meta.name)) return `“${meta.name}” is a HEIC/HEIF image, which bb does not attach; convert it to JPEG or PNG first`;
      if (type.startsWith("image/") && meta.size > BB_ATTACHMENT_IMAGE_BYTES) return `“${meta.name}” is an image over 10 MB, the most bb attaches`;
      if (!type.startsWith("image/") && meta.size > BB_ATTACHMENT_FILE_BYTES) return `“${meta.name}” is over 25 MB, the most bb attaches`;
      return null;
    },
    async upload(workspaceId, file, meta) {
      const stored = asRecord(
        await sdkCall("attachments.upload", () =>
          bb.sdk.projects.attachments.upload({ projectId: workspaceId, clientFile: new Blob([Buffer.from(file)], { type: meta.type }), filename: meta.name, mimeType: meta.type }),
        ),
      );
      if (!stored || typeof stored.path !== "string") throw new ProviderError("other", "attachments.upload: bb returned no stored item");
      return {
        attachmentId: store.issue(
          {
            kind: stored.type === "localImage" ? "image" : "file",
            path: stored.path,
            name: typeof stored.name === "string" ? stored.name : meta.name,
            mimeType: typeof stored.mimeType === "string" ? stored.mimeType : meta.type,
            sizeBytes: typeof stored.sizeBytes === "number" ? stored.sizeBytes : file.byteLength,
          },
          workspaceId,
        ),
      };
    },
  };
}
