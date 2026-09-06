import { describe, expect, it } from "vitest";

import {
  BRIDGE_ERROR_CODES,
  BRIDGE_MAX_CONFIRMATION_TTL_MS,
  BRIDGE_MAX_ID_LENGTH,
  BRIDGE_MAX_JSON_DEPTH,
  BRIDGE_MAX_SERIALIZED_BYTES,
  BRIDGE_PROTOCOL_VERSION,
  authorizeBridgeInvocation,
  capabilityDescriptors,
  completeBridgeInvocation,
  createCapabilityRegistry,
  createTrustedOuterConfirmation,
  decodeBridgeRequest,
  decodeBridgeResponse,
  encodeBridgeResponse,
  makeBridgeFailureResponse,
  resolveBridgeInvocation,
  strictParityCapabilityRegistry,
  validateJsonValue,
  type BridgeRequest,
  type BridgeValidationResult,
  type JsonValue,
  type ValidatedBridgeInvocation,
} from "./bridge.js";

const REVISION = "a".repeat(64);

function request(
  method: string,
  params: JsonValue,
  overrides: Partial<BridgeRequest> = {},
): BridgeRequest {
  return {
    v: BRIDGE_PROTOCOL_VERSION,
    id: "request-1",
    method,
    params,
    pageRevision: REVISION,
    ...overrides,
  };
}

function resolved(
  method: string,
  params: JsonValue,
  overrides: Partial<BridgeRequest> = {},
): ValidatedBridgeInvocation {
  const result = resolveBridgeInvocation(request(method, params, overrides));
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function expectFailureCode(
  result: { ok: boolean; error?: { code: string } },
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error?.code).toBe(code);
}

describe("strict JSON transport", () => {
  it("accepts and detaches strict JSON values", () => {
    const source = { answer: [1, true, null, "yes"], nested: { ok: true } };
    const result = validateJsonValue(source);

    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok) throw new Error("expected JSON value");
    source.answer[0] = 2;
    expect((result.value as { answer: JsonValue[] }).answer[0]).toBe(1);
  });

  it.each([
    ["undefined", undefined],
    ["bigint", 1n],
    ["function", () => undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["class instance", new Date()],
  ])("rejects %s instead of coercing it", (_label, value) => {
    const result = validateJsonValue(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("not_json_safe");
  });

  it("rejects cycles, accessors, symbols, sparse arrays, and hidden data", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const accessor = {};
    Object.defineProperty(accessor, "secret", {
      enumerable: true,
      get: () => "secret",
    });

    const symbol = { ok: true } as Record<PropertyKey, unknown>;
    symbol[Symbol("secret")] = true;

    const sparse = new Array(2);
    sparse[1] = "present";

    const hidden = {};
    Object.defineProperty(hidden, "secret", {
      enumerable: false,
      value: "secret",
    });

    for (const value of [cyclic, accessor, symbol, sparse, hidden]) {
      const result = validateJsonValue(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues[0]?.code).toBe("not_json_safe");
    }
  });

  it("rejects prototype-sensitive keys", () => {
    const value = JSON.parse('{"safe":true,"__proto__":{"admin":true}}');
    const result = validateJsonValue(value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe("$.__proto__");
  });

  it("bounds both nesting and serialized UTF-8 size", () => {
    let deep: unknown = true;
    for (let index = 0; index <= BRIDGE_MAX_JSON_DEPTH; index += 1) {
      deep = { child: deep };
    }
    const tooDeep = validateJsonValue(deep);
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.issues[0]?.code).toBe("too_deep");

    const tooLarge = validateJsonValue("é".repeat(BRIDGE_MAX_SERIALIZED_BYTES));
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.issues[0]?.code).toBe("too_large");
  });
});

describe("request and response envelopes", () => {
  it("decodes the exact request shape from an object or JSON text", () => {
    const value = request("context.get", null);

    expect(decodeBridgeRequest(value)).toEqual({ ok: true, value });
    expect(decodeBridgeRequest(JSON.stringify(value))).toEqual({ ok: true, value });
  });

  it("uses stable failures for malformed JSON, size, version, and shape", () => {
    expectFailureCode(decodeBridgeRequest("{"), "invalid_json");
    expectFailureCode(
      decodeBridgeRequest("x".repeat(BRIDGE_MAX_SERIALIZED_BYTES + 1)),
      "request_too_large",
    );
    expectFailureCode(
      decodeBridgeRequest({ ...request("context.get", null), v: 2 }),
      "unsupported_version",
    );
    expectFailureCode(
      decodeBridgeRequest({ ...request("context.get", null), extra: true }),
      "invalid_request",
    );
    expectFailureCode(
      decodeBridgeRequest({ ...request("context.get", null), params: undefined }),
      "invalid_request",
    );
  });

  it("bounds and constrains correlation ids, method names, and revisions", () => {
    const cases = [
      { id: "x".repeat(BRIDGE_MAX_ID_LENGTH + 1) },
      { id: "space is unsafe" },
      { method: "fetch" },
      { method: "sdk.threads.send()" },
      { pageRevision: "revision with spaces" },
      { pageRevision: "" },
    ];
    for (const overrides of cases) {
      expectFailureCode(
        decodeBridgeRequest({ ...request("context.get", null), ...overrides }),
        "invalid_request",
      );
    }
  });

  it("validates success and error responses without accepting ad-hoc codes", () => {
    const success = { v: 1, id: "request-1", ok: true, result: { saved: true } };
    const failure = {
      v: 1,
      id: "request-1",
      ok: false,
      error: { code: "conflict", message: "Changed" },
    };

    expect(decodeBridgeResponse(success)).toEqual({ ok: true, value: success });
    expect(decodeBridgeResponse(JSON.stringify(failure))).toEqual({
      ok: true,
      value: failure,
    });
    expectFailureCode(
      decodeBridgeResponse({
        ...failure,
        error: { code: "raw_server_error", message: "no" },
      }),
      "invalid_response",
    );
    expectFailureCode(
      decodeBridgeResponse({ ...success, result: new Date() }),
      "invalid_response",
    );
    expect(BRIDGE_ERROR_CODES).toContain("confirmation_required");
    expect(BRIDGE_ERROR_CODES).toContain("stale_page");
  });

  it("serializes only bounded valid responses and safely forms errors", () => {
    const response = makeBridgeFailureResponse(
      "unsafe id with spaces",
      "handler_error",
      "x".repeat(1_000),
    );
    expect(response.id).toBe("invalid");
    expect(response.error.message.length).toBeLessThanOrEqual(512);
    expect(encodeBridgeResponse(response).ok).toBe(true);

    expectFailureCode(
      encodeBridgeResponse({
        v: 1,
        id: "request-1",
        ok: true,
        result: "é".repeat(BRIDGE_MAX_SERIALIZED_BYTES),
      }),
      "response_too_large",
    );
  });
});

describe("capability registry", () => {
  const expectedMethods = [
    "context.get",
    "thread.activity",
    "threads.snapshot",
    "thread.reply",
    "threads.continue",
    "threads.spawn",
    "threads.openPage",
    "threads.openBb",
    "threads.stop",
    "threads.archive",
    "navigation.openExternal",
    "projects.list",
    "projects.browse",
    "projects.create",
    "providers.list",
    "storage.get",
    "storage.set",
    "voice.captureAndTranscribe",
  ];

  it("exposes exactly the strict-parity named surface, with no raw escape", () => {
    const methods = strictParityCapabilityRegistry.list().map((item) => item.method);
    expect(methods).toEqual(expectedMethods);
    expect(methods).not.toContain("fetch");
    expect(methods).not.toContain("sdk.call");
    expect(methods).not.toContain("files.read");
    expect(methods).not.toContain("files.write");
    expect(methods).not.toContain("cli.exec");
  });

  it("requires trusted confirmation for every cross-thread, destructive, and device effect", () => {
    for (const spec of strictParityCapabilityRegistry.list()) {
      if (["cross-thread-write", "destructive", "device"].includes(spec.effect)) {
        expect(spec.confirmation, spec.method).toBe("trusted-outer");
      }
    }
    expect(strictParityCapabilityRegistry.get("projects.create")?.confirmation).toBe(
      "trusted-outer",
    );
    expect(strictParityCapabilityRegistry.get("threads.stop")?.confirmation).toBe(
      "trusted-outer",
    );
    expect(
      strictParityCapabilityRegistry.get("navigation.openExternal")?.confirmation,
    ).toBe("trusted-outer");
    expect(strictParityCapabilityRegistry.get("thread.reply")?.confirmation).toBe(
      "none",
    );
    for (const method of ["threads.openPage", "threads.openBb"]) {
      expect(strictParityCapabilityRegistry.get(method)).toMatchObject({
        effect: "navigation",
        confirmation: "none",
      });
    }
  });

  it("exports data-only descriptors while keeping all rendering page-owned", () => {
    const descriptors = capabilityDescriptors();
    expect(descriptors).toHaveLength(expectedMethods.length);
    expect(descriptors[0]).toEqual({
      method: "context.get",
      effect: "read",
      confirmation: "none",
    });
    expect(Object.keys(descriptors[0]!)).toEqual([
      "method",
      "effect",
      "confirmation",
    ]);
  });

  it("is extensible but rejects duplicates and unsafe effect policy", () => {
    const acceptNull = (value: unknown): BridgeValidationResult<null> =>
      value === null
        ? { ok: true, value: null }
        : {
            ok: false,
            issues: [
              { code: "invalid_type", path: "$", message: "Expected null" },
            ],
          };
    const custom = {
      method: "custom.inspect",
      description: "Inspect custom page state.",
      effect: "read" as const,
      confirmation: "none" as const,
      validateParams: acceptNull,
      validateResult: acceptNull,
    };
    const registry = createCapabilityRegistry([custom]);

    expect(registry.get("custom.inspect")?.method).toBe("custom.inspect");
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.get("custom.inspect"))).toBe(true);
    expect(() => createCapabilityRegistry([custom, custom])).toThrow(/Duplicate/);
    expect(() =>
      createCapabilityRegistry([
        {
          ...custom,
          method: "custom.mutate",
          effect: "cross-thread-write",
        },
      ]),
    ).toThrow(/trusted outer confirmation/);
    expect(() =>
      createCapabilityRegistry([
        {
          ...custom,
          method: "projects.create",
        },
      ]),
    ).toThrow(/trusted outer confirmation/);
  });

  it("does not let an extension validator smuggle non-JSON values", () => {
    const registry = createCapabilityRegistry([
      {
        method: "custom.unsafe",
        description: "A deliberately invalid extension for boundary testing.",
        effect: "read",
        confirmation: "none",
        validateParams: () => ({ ok: true, value: new Date() }),
        validateResult: () => ({ ok: true, value: new Date() }),
      },
    ]);
    const invocation = resolveBridgeInvocation(
      request("custom.unsafe", null),
      registry,
    );

    expectFailureCode(invocation, "invalid_params");
  });
});

describe("strict-parity method validators", () => {
  const validCalls: Record<string, JsonValue> = {
    "context.get": null,
    "thread.activity": { limit: 8 },
    "threads.snapshot": {},
    "thread.reply": { result: { choice: "approve", points: [1, 2] } },
    "threads.continue": { threadId: "thr_other", prompt: "Please continue." },
    "threads.spawn": {
      projectId: "proj_test",
      prompt: "Start the implementation.",
      providerId: "codex",
      model: "gpt-5.6-sol",
      reasoningLevel: "high",
    },
    "threads.openPage": { threadId: "thr_other" },
    "threads.openBb": { threadId: "thr_other" },
    "threads.stop": { threadId: "thr_other" },
    "threads.archive": { threadId: "thr_other" },
    "navigation.openExternal": {
      url: "https://example.com/report?view=full#result",
      label: "Full report",
    },
    "projects.list": {},
    "projects.browse": {},
    "projects.create": { selectionToken: "selection.abc", name: "New project" },
    "providers.list": null,
    "storage.get": { key: "wizard.screen" },
    "storage.set": { key: "wizard.state", value: { screen: 3 } },
    "voice.captureAndTranscribe": { language: "en-US" },
  };

  const validResults: Record<string, JsonValue> = {
    "context.get": {
      protocolVersion: 1,
      thread: { id: "thr_current", title: "Current", projectId: "proj_test" },
      page: { revision: REVISION, readOnly: false },
      capabilities: capabilityDescriptors() as unknown as JsonValue,
    },
    "thread.activity": {
      state: "working",
      updatedAtMs: 1_800_000_000_000,
      items: [
        {
          kind: "command",
          done: false,
          atMs: 1_800_000_000_001,
          label: "Running command",
          text: "npm test",
        },
      ],
    },
    "threads.snapshot": {
      threads: [
        {
          id: "thr_other",
          title: "Other",
          projectId: "proj_test",
          parentThreadId: null,
          status: "active",
          archived: false,
          page: { available: true, revision: "b".repeat(64) },
          updatedAtMs: 1_800_000_000_000,
        },
      ],
      nextCursor: null,
      generatedAtMs: 1_800_000_000_001,
    },
    "thread.reply": { delivery: "queued", duplicate: false },
    "threads.continue": {
      threadId: "thr_other",
      delivery: "steered",
      duplicate: false,
    },
    "threads.spawn": { threadId: "thr_new" },
    "threads.openPage": { opened: true },
    "threads.openBb": { opened: true },
    "threads.stop": { stopped: true },
    "threads.archive": { archived: true },
    "navigation.openExternal": { opened: true },
    "projects.list": {
      projects: [{ id: "proj_test", name: "Test", kind: "standard" }],
    },
    "projects.browse": {
      selection: {
        token: "selection.abc",
        displayPath: "/Users/example/project",
        hostName: "Laptop",
      },
    },
    "projects.create": {
      project: { id: "proj_new", name: "New project", kind: "standard" },
    },
    "providers.list": {
      providers: [
        {
          id: "codex",
          displayName: "Codex",
          available: true,
          models: [{ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol" }],
        },
      ],
    },
    "storage.get": { found: true, value: { screen: 3 } },
    "storage.set": { stored: true },
    "voice.captureAndTranscribe": { text: "Transcribed text" },
  };

  it("accepts and completes every initial method contract", () => {
    for (const [method, params] of Object.entries(validCalls)) {
      const invocation = resolved(method, params);
      const response = completeBridgeInvocation(invocation, validResults[method]);
      expect(response.ok, method).toBe(true);
      expect(response.id, method).toBe("request-1");
    }
  });

  it("normalizes bounded defaults for snapshot, reply, continue, browse, and voice", () => {
    expect(resolved("threads.snapshot", {}).params).toEqual({
      projectId: null,
      includeArchived: false,
      limit: 100,
      cursor: null,
    });
    expect(resolved("thread.reply", { result: "done" }).params).toEqual({
      result: "done",
      mode: "queue",
    });
    expect(
      resolved("threads.continue", {
        threadId: "thr_other",
        prompt: "Continue",
      }).params,
    ).toEqual({ threadId: "thr_other", prompt: "Continue", mode: "queue" });
    expect(resolved("projects.browse", {}).params).toEqual({ startProjectId: null });
    expect(resolved("voice.captureAndTranscribe", {}).params).toEqual({
      maxDurationSeconds: 120,
    });
  });

  it("supports both queue and explicit steer for the current reply", () => {
    expect(resolved("thread.reply", { result: "later", mode: "queue" }).params).toMatchObject({ mode: "queue" });
    expect(resolved("thread.reply", { result: "urgent", mode: "steer" }).params).toMatchObject({ mode: "steer" });
    expectFailureCode(
      resolveBridgeInvocation(
        request("thread.reply", { result: "bad", mode: "auto" }),
      ),
      "invalid_params",
    );
  });

  it("rejects raw SDK, fetch, host, path, and audio escape fields", () => {
    const hostile: Array<[string, JsonValue]> = [
      [
        "threads.continue",
        {
          threadId: "thr_other",
          prompt: "x",
          sdkMethod: "threads.delete",
        },
      ],
      [
        "threads.spawn",
        {
          projectId: "proj_test",
          prompt: "x",
          environment: { type: "host", path: "/" },
        },
      ],
      ["threads.openPage", { threadId: "thr_other", url: "https://evil.test" }],
      [
        "navigation.openExternal",
        { url: "https://example.com", fetchOptions: { credentials: "include" } },
      ],
      ["projects.browse", { path: "/etc", hostId: "host_other" }],
      [
        "projects.create",
        { selectionToken: "selection.abc", path: "/etc", hostId: "host_other" },
      ],
      ["storage.get", { key: "x", filesystemPath: "/etc/passwd" }],
      ["voice.captureAndTranscribe", { audioBase64: "raw-device-data" }],
    ];

    for (const [method, params] of hostile) {
      expectFailureCode(resolveBridgeInvocation(request(method, params)), "invalid_params");
    }
  });

  it("rejects unsafe output projection fields and invalid handler results", () => {
    const snapshot = resolved("threads.snapshot", {});
    const leaked = {
      threads: [
        {
          id: "thr_other",
          title: "Other",
          projectId: "proj_test",
          parentThreadId: null,
          status: "idle",
          archived: false,
          page: { available: false, revision: null },
          updatedAtMs: 1,
          prompt: "private prompt",
          hostId: "host_private",
          path: "/private/path",
        },
      ],
      nextCursor: null,
      generatedAtMs: 1,
    };

    expect(completeBridgeInvocation(snapshot, leaked)).toMatchObject({
      ok: false,
      error: { code: "invalid_result" },
    });
    expect(
      completeBridgeInvocation(resolved("projects.browse", {}), {
        selection: {
          token: "selection.abc",
          displayPath: "/safe/display",
          hostName: "Laptop",
          hostId: "host_private",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_result" } });
  });

  it("bounds storage values independently of the transport ceiling", () => {
    expectFailureCode(
      resolveBridgeInvocation(
        request("storage.set", {
          key: "large",
          value: "é".repeat(20_000),
        }),
      ),
      "invalid_params",
    );
  });

  it("allows only bounded absolute http/https external navigation targets", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "file:///etc/passwd",
      "/relative/path",
      "https://user:password@example.com/private",
      `https://example.com/${"x".repeat(2_048)}`,
    ]) {
      expectFailureCode(
        resolveBridgeInvocation(
          request("navigation.openExternal", { url }),
        ),
        "invalid_params",
      );
    }
    expect(
      resolved("navigation.openExternal", {
        url: "https://example.com/path?q=1#section",
      }).params,
    ).toEqual({ url: "https://example.com/path?q=1#section" });
    expect(
      resolved("navigation.openExternal", {
        url: "http://example.test/report",
        label: "Report",
      }).params,
    ).toEqual({ url: "http://example.test/report", label: "Report" });
    for (const label of ["", "x".repeat(161)]) {
      expectFailureCode(
        resolveBridgeInvocation(
          request("navigation.openExternal", {
            url: "https://example.com",
            label,
          }),
        ),
        "invalid_params",
      );
    }
  });

  it("reports unknown capabilities and stale page revisions before dispatch", () => {
    expectFailureCode(
      resolveBridgeInvocation(request("threads.rawCall", {})),
      "unknown_method",
    );
    expectFailureCode(
      resolveBridgeInvocation(request("context.get", null), undefined, "new-revision"),
      "stale_page",
    );
  });
});

describe("trusted outer confirmation", () => {
  const confirmedAtMs = 1_800_000_000_000;
  const expiresAtMs = confirmedAtMs + 60_000;

  it("does not burden read or current-thread writes with confirmation", () => {
    for (const invocation of [
      resolved("context.get", null),
      resolved("thread.reply", { result: "done" }),
      resolved("storage.set", { key: "state", value: 1 }),
      resolved("threads.openPage", { threadId: "thr_other" }),
      resolved("threads.openBb", { threadId: "thr_other" }),
    ]) {
      expect(authorizeBridgeInvocation(invocation, null, confirmedAtMs).ok).toBe(true);
    }
  });

  it.each([
    ["threads.continue", { threadId: "thr_other", prompt: "Continue" }],
    ["threads.spawn", { projectId: "proj_test", prompt: "Start" }],
    ["threads.stop", { threadId: "thr_other" }],
    ["threads.archive", { threadId: "thr_other" }],
    ["navigation.openExternal", { url: "https://example.com" }],
    ["projects.browse", {}],
    ["projects.create", { selectionToken: "selection.abc" }],
    ["voice.captureAndTranscribe", {}],
  ] as const)("requires trusted chrome for %s", (method, params) => {
    const invocation = resolved(method, params as JsonValue);
    expectFailureCode(
      authorizeBridgeInvocation(invocation, null, confirmedAtMs),
      "confirmation_required",
    );
  });

  it("accepts a short-lived branded confirmation bound to the exact request", () => {
    const invocation = resolved("threads.continue", {
      threadId: "thr_other",
      prompt: "Continue the work",
    });
    const confirmation = createTrustedOuterConfirmation(invocation, {
      confirmedAtMs,
      expiresAtMs,
    });

    expect(confirmation.source).toBe("trusted-outer");
    expect(confirmation.humanSummary).toContain("thr_other");
    expect(
      authorizeBridgeInvocation(invocation, confirmation, confirmedAtMs + 1),
    ).toEqual({ ok: true, value: invocation });
  });

  it("rejects a JSON-cloned forgery, expiry, and confirmation replay on changed params", () => {
    const first = resolved("threads.continue", {
      threadId: "thr_other",
      prompt: "Approved prompt",
    });
    const confirmation = createTrustedOuterConfirmation(first, {
      confirmedAtMs,
      expiresAtMs,
    });
    const clone = JSON.parse(JSON.stringify(confirmation));

    expectFailureCode(
      authorizeBridgeInvocation(first, clone, confirmedAtMs + 1),
      "confirmation_required",
    );
    expectFailureCode(
      authorizeBridgeInvocation(first, confirmation, expiresAtMs),
      "confirmation_invalid",
    );

    const changed = resolved(
      "threads.continue",
      { threadId: "thr_other", prompt: "Different prompt" },
      { id: first.request.id },
    );
    expectFailureCode(
      authorizeBridgeInvocation(changed, confirmation, confirmedAtMs + 1),
      "confirmation_invalid",
    );
  });

  it("bounds confirmation lifetime", () => {
    const invocation = resolved("threads.archive", { threadId: "thr_other" });
    expect(() =>
      createTrustedOuterConfirmation(invocation, {
        confirmedAtMs,
        expiresAtMs: confirmedAtMs + BRIDGE_MAX_CONFIRMATION_TTL_MS + 1,
      }),
    ).toThrow(/lifetime/);
  });
});
