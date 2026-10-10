// `PagesRequest` helpers: `readJsonBody(request, maxBytes)`, `readBytesField(envelope, field, maxBytes)` (base64 → `Uint8Array`, bounded before decoding), `requireReader` (401), `requestOrigins(headers)` (05 R2.4, R-S8, 03 R5.32a; DESIGN §B.2).
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { parseStrictJson, type JsonLimits, type JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { PagesRequest } from "../host/serving.ts";
import { base64Within } from "../runtime/shared/envelopes.ts";

/** The serving host resolved no reader: 401, nothing else happens. 05 R2.4, R-S8 */
export function requireReader(request: PagesRequest): void {
  if (request.reader === null) throw new PageError("unauthenticated", PUBLIC_MESSAGES.unauthenticated);
}

/** The body as strict JSON within `maxBytes`: `413 request_too_large` over the bound, `400 invalid_json` otherwise. 05 §Errors on routes; DESIGN §B.2 */
export async function readJsonBody(request: PagesRequest, maxBytes: number, limits: JsonLimits = {}): Promise<JsonValue> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PageError("request_too_large", `The request body is larger than ${maxBytes} bytes`);
  const bytes = await request.body();
  if (bytes.byteLength > maxBytes) throw new PageError("request_too_large", `The request body is larger than ${maxBytes} bytes`);
  const parsed = parseStrictJson(Buffer.from(bytes).toString("utf8"), { maxBytes, maxDepth: LIMITS.capabilityJsonDepth, maxNodes: LIMITS.capabilityJsonNodes, ...limits });
  if (!parsed.ok) throw new PageError("invalid_json", PUBLIC_MESSAGES.invalidJson);
  return parsed.value;
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A base64 field decoded to bytes, refused over `maxBytes` before decoding. DR-1 */
export function readBytesField(envelope: Record<string, unknown>, field: string, maxBytes: number): Uint8Array {
  const value = envelope[field];
  if (typeof value !== "string") throw new PageError("invalid_request", `"${field}" must be base64`);
  if (!base64Within(value, Number.MAX_SAFE_INTEGER)) throw new PageError("invalid_request", `"${field}" must be base64`);
  if (!base64Within(value, maxBytes)) throw new PageError("request_too_large", `"${field}" decodes to more than ${maxBytes} bytes`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > maxBytes) throw new PageError("request_too_large", `"${field}" decodes to more than ${maxBytes} bytes`);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * The origins a reader reaches this host at, from the request alone: `Host`
 * and the `X-Forwarded-Host`/`X-Forwarded-Proto` a proxy set, plus `Origin`.
 * Read for `navigation.openExternal` and nothing else. 03 R5.32a; 05 R-S3
 */
export function requestOrigins(headers: Headers): string[] {
  const origins = new Set<string>();
  const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0]!.trim().toLowerCase();
  const schemes = proto === "https" || proto === "http" ? [proto] : ["http", "https"];
  for (const name of ["host", "x-forwarded-host"]) {
    for (const raw of (headers.get(name) ?? "").split(",")) {
      const host = raw.trim().toLowerCase();
      if (!host || /[\s/\\]/.test(host)) continue;
      for (const scheme of schemes) origins.add(`${scheme}://${host}`);
    }
  }
  const origin = headers.get("origin");
  if (origin && /^https?:\/\/[^\s/]+$/i.test(origin)) origins.add(origin.toLowerCase());
  return [...origins];
}
