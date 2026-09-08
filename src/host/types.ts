import type { SessionState } from "../domain/capabilities/specs.ts";

/**
 * The host's things, projected into the product's vocabulary. Nothing here is
 * shaped like a particular host's API. spec 08
 */
export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  readonly projectId: string | null;
  readonly state: SessionState;
  readonly visibility: "visible" | "hidden";
  readonly parentId: string | null;
  readonly forkOfId: string | null;
  readonly archived: boolean;
  readonly deleted: boolean;
  readonly updatedAtMs: number;
  /** The host's environment identity for `sessions.start` reuse; never shown to a page. */
  readonly environmentId: string | null;
}

export interface SessionListQuery {
  readonly projectId?: string;
  readonly archived: boolean;
  readonly offset: number;
  readonly limit: number;
}

export type SendMode = "queue" | "steer";
export type Delivery = "started" | "queued" | "steered";

export interface StartSessionArgs {
  readonly projectId: string;
  readonly prompt: string;
  readonly title?: string;
  readonly providerId?: string;
  readonly model?: string;
  readonly reasoningLevel?: string;
  readonly environment: { readonly kind: "project-default" } | { readonly kind: "reuse"; readonly environmentId: string };
}

export interface ActivityItem {
  readonly kind: string;
  readonly done: boolean;
  readonly atMs: number;
  readonly label: string;
  readonly text: string;
}

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: "standard" | "personal";
  /** Host id of the project's default source; needed to open a picker there. */
  readonly hostId: string | null;
}

export interface ProviderChoice {
  readonly id: string;
  readonly displayName: string;
  readonly available: boolean;
  readonly models: readonly { readonly id: string; readonly displayName: string; readonly isDefault: boolean; readonly reasoningLevels: readonly string[] }[];
}

export interface StorageLocation {
  readonly hostId: string;
  readonly rootPath: string;
}

export interface FileContent {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly modifiedAtMs: number | null;
}

export type WriteOutcome = "written" | "exists";

export interface HostLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
