import { describe, expect, it } from "vitest";
import { canonicalJson, fingerprint } from "../../src/domain/json/canonical.ts";
import { validateJson } from "../../src/domain/json/strict-json.ts";

describe("strict JSON", () => {
  it("accepts plain values and returns a detached copy", () => {
    const input = { a: [1, "two", null, { b: true }] };
    const result = validateJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(input);
    expect(result.value).not.toBe(input);
  });

  it("rejects cycles, accessors, symbols, sparse arrays, class instances and unsafe keys", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateJson(cyclic).ok).toBe(false);
    const accessor = Object.defineProperty({}, "x", { get: () => 1, enumerable: true });
    expect(validateJson(accessor).ok).toBe(false);
    expect(validateJson({ [Symbol("s")]: 1 }).ok).toBe(false);
    expect(validateJson([1, , 3]).ok).toBe(false);
    expect(validateJson(new Date()).ok).toBe(false);
    expect(validateJson(JSON.parse('{"__proto__": {"polluted": true}}')).ok).toBe(false);
    expect(validateJson({ constructor: 1 }).ok).toBe(false);
    expect(validateJson(Number.NaN).ok).toBe(false);
    expect(validateJson(() => 1).ok).toBe(false);
  });

  it("bounds depth, node count and serialised size", () => {
    let deep: unknown = 1;
    for (let index = 0; index < 20; index += 1) deep = [deep];
    expect(validateJson(deep).ok).toBe(false);
    expect(validateJson(deep, { maxDepth: 25 }).ok).toBe(true);
    expect(validateJson(Array.from({ length: 11_000 }, () => 1)).ok).toBe(false);
    const big = { text: "x".repeat(70_000) };
    const tooLarge = validateJson(big);
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.issues[0]?.code).toBe("too_large");
    expect(validateJson(big, { maxBytes: 100_000 }).ok).toBe(true);
  });
});

describe("canonical JSON", () => {
  it("is independent of key order at every level", () => {
    const a = { z: 1, a: { d: [1, { y: 2, x: 1 }], c: null } };
    const b = { a: { c: null, d: [1, { x: 1, y: 2 }] }, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint({ z: 1 })).not.toBe(fingerprint({ z: 2 }));
  });
});
