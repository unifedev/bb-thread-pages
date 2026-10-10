// bb/SDK failure → ProviderError: one mapping on the SDK's structured `status` / `body.code`, no message regexes
// (DESIGN §B.0, D-bb-17). `message` names the member, never a path (05 R2.42); the cause rides along for the log.
import { ProviderError } from "../../core/src/host/index.ts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const record = asRecord(error);
  const message = record?.message;
  return typeof message === "string" ? message : String(error);
}

export function httpStatus(error: unknown): number | null {
  const record = asRecord(error);
  if (!record) return null;
  const direct = record.status ?? record.statusCode;
  if (typeof direct === "number") return direct;
  const body = asRecord(record.body);
  return typeof body?.status === "number" ? body.status : null;
}

export function bodyCode(error: unknown): string | null {
  const record = asRecord(error);
  if (!record) return null;
  const body = asRecord(record.body);
  if (typeof body?.code === "string") return body.code;
  return typeof record.code === "string" ? record.code : null;
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);

export function isNetworkError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  if (record.name === "AbortError") return true;
  const code = typeof record.code === "string" ? record.code : typeof asRecord(record.cause)?.code === "string" ? (asRecord(record.cause)!.code as string) : null;
  if (code && NETWORK_CODES.has(code)) return true;
  // `fetch` rejects with a TypeError("fetch failed") when the server cannot be reached.
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

export function providerError(error: unknown, context: string): ProviderError {
  if (error instanceof ProviderError) return error;
  const status = httpStatus(error);
  const code = bodyCode(error);
  if (status === 404 || code === "not_found" || code === "ENOENT") return new ProviderError("not_found", `${context}: not found`, undefined, { cause: error });
  if (status === 413 || code === "file_too_large") return new ProviderError("too_large", `${context}: larger than bb reads`, undefined, { cause: error });
  if (status === 409 || code === "conflict") return new ProviderError("conflict", `${context}: conflict`, undefined, { cause: error });
  if (status === 410 || code === "thread_archived") return new ProviderError("unavailable", `${context}: archived`, "archived", { cause: error });
  if ((status !== null && status >= 500) || isNetworkError(error)) return new ProviderError("unavailable", `${context}: bb did not answer`, undefined, { cause: error });
  return new ProviderError("other", `${context}: ${errorText(error)}`, undefined, { cause: error });
}

/** Runs one SDK call under the mapping. */
export async function sdkCall<T>(context: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw providerError(error, context);
  }
}
