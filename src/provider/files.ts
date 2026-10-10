// files.* under the page root, paths relative to it (DESIGN §B.4, D-bb-10). `stat` is a `files.read` under the
// root on bb (the SDK exposes no stat; the daemon's `host.file_metadata` is not reachable through it), kept for
// the `read` that follows so the pair costs one round trip; `statIsCheap: false` (DR-15). `list` is
// `files.listPaths`, a bounded walk of the subtree that answers `{ paths, truncated }` (BB-1, BB-3).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type ProviderHost } from "../../core/src/host/index.ts";
import { asRecord, bodyCode, errorText, providerError } from "./errors.ts";
import type { StorageLocation } from "./sessions.ts";

const LIST_LIMIT = 5_000;
const READ_MEMO_MS = 5_000;

/** Joins `relative` under `root`, refusing traversal, absolute paths and empty segments (01 R1.4). */
export function joinUnderRoot(root: string, relative: string): string {
  if (relative.includes("\0") || relative.includes("\\") || relative.startsWith("/")) throw new ProviderError("not_found", "files: path outside the page root");
  if (relative.includes("//")) throw new ProviderError("not_found", "files: path outside the page root"); // an empty segment
  const segments = relative.split("/").filter((s) => s !== "");
  for (const segment of segments) if (segment === "." || segment === "..") throw new ProviderError("not_found", "files: path outside the page root");
  const base = root.replace(/\/+$/, "");
  return segments.length === 0 ? base : `${base}/${segments.join("/")}`;
}

interface ReadResult { bytes: Uint8Array; sizeBytes: number; modifiedAtMs: number }

/**
 * bb's daemon refuses `read_file` on a directory with `invalid_path` "Path is a directory, not a file"
 * (host-daemon `vW`); the same code names a path that escapes the root, which `joinUnderRoot` makes impossible
 * and a symlink that leaves the root ("escapes read root") must stay an error. The one message match in this
 * module, beside the code (D-bb-17).
 */
export function isDirectoryRefusal(error: unknown): boolean {
  const cause = error instanceof ProviderError ? error.cause : error;
  return bodyCode(cause) === "invalid_path" && /is a directory/i.test(errorText(cause));
}

export function createBbFiles(bb: BbPluginApi, locate: (session: string) => Promise<StorageLocation>, now: () => number = Date.now): ProviderHost["files"] {
  const memo = new Map<string, { at: number; result: Promise<ReadResult> }>();
  const abs = async (session: string, relative: string) => {
    const location = await locate(session);
    return { location, path: joinUnderRoot(location.rootPath, relative) };
  };

  async function readFresh(location: StorageLocation, path: string): Promise<ReadResult> {
    let raw: unknown;
    try {
      raw = await bb.sdk.files.read({ hostId: location.hostId, path, rootPath: location.rootPath });
    } catch (error) {
      throw providerError(error, "files.read");
    }
    const record = asRecord(raw);
    const content = typeof record?.content === "string" ? record.content : "";
    const bytes = record?.contentEncoding === "base64" ? new Uint8Array(Buffer.from(content, "base64")) : new Uint8Array(Buffer.from(content, "utf8"));
    return { bytes, sizeBytes: typeof record?.sizeBytes === "number" ? record.sizeBytes : bytes.byteLength, modifiedAtMs: typeof record?.modifiedAtMs === "number" ? record.modifiedAtMs : 0 };
  }

  /** A fresh read, kept for the `read` that follows a `stat`. */
  function readAndKeep(location: StorageLocation, path: string): Promise<ReadResult> {
    const result = readFresh(location, path);
    memo.set(path, { at: now(), result });
    result.catch(() => memo.delete(path));
    return result;
  }

  function takeKept(path: string): Promise<ReadResult> | null {
    const kept = memo.get(path);
    if (!kept) return null;
    memo.delete(path);
    return now() - kept.at <= READ_MEMO_MS ? kept.result : null;
  }

  async function listDir(location: StorageLocation, path: string): Promise<{ entries: { name: string; path: string; kind: "file" | "dir" }[]; truncated: boolean }> {
    let raw: unknown;
    try {
      raw = await bb.sdk.files.listPaths({ hostId: location.hostId, path, limit: LIST_LIMIT, includeFiles: true, includeDirectories: true });
    } catch (error) {
      throw providerError(error, "files.list");
    }
    const record = asRecord(raw);
    const rows = Array.isArray(record?.paths) ? record.paths : []; // `host.list_paths` answers `paths`, not `files` (BB-1)
    const prefix = `${path.replace(/\/+$/, "")}/`;
    const entries = rows
      .map(asRecord)
      .filter((e): e is Record<string, unknown> => e !== null && typeof e.name === "string")
      .map((e) => {
        const entryPath = typeof e.path === "string" ? e.path : (e.name as string);
        const relative = entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : entryPath;
        return { name: e.name as string, path: relative, kind: e.kind === "directory" || e.kind === "dir" ? ("dir" as const) : ("file" as const) };
      })
      .filter((e) => !e.path.includes("/")); // direct children only; bb skips symlinks itself
    return { entries, truncated: record?.truncated === true };
  }

  return {
    async stat(session, relative) {
      if (relative.split("/").every((segment) => segment === "")) return { size: 0, mtimeMs: 0, kind: "dir" }; // the root itself: no call, nothing above it is listed (BB-7)
      const { location, path } = await abs(session, relative);
      try {
        const read = await readAndKeep(location, path);
        return { size: read.sizeBytes, mtimeMs: read.modifiedAtMs, kind: "file" };
      } catch (error) {
        if (error instanceof ProviderError && error.code === "not_found") return null;
        if (isDirectoryRefusal(error)) return { size: 0, mtimeMs: 0, kind: "dir" };
        throw error;
      }
    },

    async read(session, relative, range) {
      const { location, path } = await abs(session, relative);
      const result = await (takeKept(path) ?? readFresh(location, path));
      return range ? result.bytes.subarray(range.offset, range.offset + range.length) : result.bytes;
    },

    async list(session, dir) {
      const { location, path } = await abs(session, dir);
      let listed: Awaited<ReturnType<typeof listDir>>;
      try {
        listed = await listDir(location, path);
      } catch (error) {
        if (error instanceof ProviderError && error.code === "not_found") return [];
        throw error;
      }
      if (listed.truncated) throw new ProviderError("unavailable", "bb cut the listing short", "listing_truncated");
      return listed.entries.map((e) => ({ name: e.name, kind: e.kind }));
    },

    async write(session, relative, bytes, { onlyIfAbsent }) {
      const { location, path } = await abs(session, relative);
      memo.delete(path);
      let written: unknown;
      try {
        written = await bb.sdk.files.write({
          hostId: location.hostId,
          path,
          rootPath: location.rootPath,
          content: Buffer.from(bytes).toString("base64"),
          contentEncoding: "base64",
          createParents: true,
          mode: 0o644,
          ...(onlyIfAbsent ? { expectedSha256: null } : {}),
        });
      } catch (error) {
        throw providerError(error, "files.write");
      }
      if (asRecord(written)?.outcome === "conflict") throw new ProviderError("conflict", "the file already exists");
    },

    async delete(session, relative) {
      const { location, path } = await abs(session, relative);
      memo.delete(path);
      try {
        await bb.sdk.files.remove({ hostId: location.hostId, path, rootPath: location.rootPath });
      } catch (error) {
        throw providerError(error, "files.delete");
      }
    },

    statIsCheap: false,
  };
}
