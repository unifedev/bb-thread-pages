// projects.list → workspaces; browse/create (DESIGN §B.2, D-bb-19, D-bb-20). Opaque ids, no path, no
// environments (the SDK has no read that lists a project's environments: O-2).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type ProviderHost } from "../../core/src/host/index.ts";
import { asRecord, sdkCall } from "./errors.ts";

export interface BrowseSelection { hostId: string; path: string }

export function createBbWorkspaces(bb: BbPluginApi): ProviderHost["workspaces"] {
  return {
    async list() {
      const projects = await sdkCall("workspaces.list", () => bb.sdk.projects.list({ includePersonal: true }));
      return (Array.isArray(projects) ? projects : [])
        .map(asRecord)
        .filter((p): p is Record<string, unknown> => p !== null && typeof p.id === "string")
        .map((p) => ({ id: p.id as string, name: typeof p.name === "string" ? p.name : "", kind: p.kind === "personal" ? "personal" : "standard" }));
    },

    async browse() {
      const listed = await sdkCall("workspaces.browse", () => bb.sdk.hosts.list()); // one call (BB-5)
      const hosts = (Array.isArray(listed) ? (listed as unknown[]) : []).map(asRecord).filter((h): h is Record<string, unknown> => h !== null);
      const host = hosts.find((h) => h.status === "connected" && h.type === "persistent") ?? hosts.find((h) => h.status === "connected");
      if (!host || typeof host.id !== "string") throw new ProviderError("unavailable", "workspaces.browse: no connected host to open a picker on");
      const hostId = host.id;
      const picked = asRecord(await sdkCall("workspaces.browse", () => bb.sdk.hosts.pickFolder({ hostId, clientHostId: hostId } as never)));
      const path = typeof picked?.path === "string" ? picked.path : null;
      if (!path) return null; // cancelled or timed out (W1)
      const selection: BrowseSelection = { hostId, path };
      return { selection, display: `${baseName(path)} on ${typeof host.name === "string" ? host.name : "this device"}` };
    },

    async create({ selection, name }) {
      const record = asRecord(selection);
      if (!record || typeof record.hostId !== "string" || typeof record.path !== "string") throw new ProviderError("other", "workspaces.create: a selection this host did not produce");
      const created = asRecord(
        await sdkCall("workspaces.create", () => bb.sdk.projects.create({ name: name ?? baseName(record.path as string), source: { type: "local_path", hostId: record.hostId as string, path: record.path as string } })),
      );
      if (!created || typeof created.id !== "string") throw new ProviderError("other", "workspaces.create: bb returned no project id");
      return { id: created.id };
    },
  };
}

function baseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}
