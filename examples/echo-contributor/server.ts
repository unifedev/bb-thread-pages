import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * A reference contributor for Thread Pages (spec 05 §Contributed
 * capabilities). It answers the two plugin RPC methods Thread Pages calls:
 *
 *   threadPagesContributions → the declaration
 *   threadPagesInvoke        → one call: { method, params, caller: { sessionId }, requestId }
 *
 * `tp-echo.echo` is a read; `tp-echo.note` is a contributed write guarded by a
 * version, the same shape a repository contributor uses: a write names the
 * version it read, and a moved version refuses it with `conflict`.
 */

const DECLARATION = {
  version: "0.1.0",
  instruction:
    "The tp-echo plugin is a test contributor. A page may call tp-echo.echo and tp-echo.note; use them only when asked to test contributed capabilities.",
  guide: "tp-echo.echo returns what it was given and the calling session. tp-echo.note stores one short note per session; pass the version you last read as base.",
  methods: [
    {
      name: "tp-echo.echo",
      description: "Return the text given, and the session the host says is calling.",
      effect: "read",
      params: { type: "object", additionalProperties: false, properties: { text: { type: "string", maxLength: 200 } } },
      result: {
        type: "object",
        properties: { text: { type: ["string", "null"] }, sessionId: { type: ["string", "null"] }, note: { type: ["string", "null"] }, version: { type: "integer" } },
        required: ["text", "sessionId", "note", "version"],
      },
    },
    {
      name: "tp-echo.note",
      description: "Store one short note for the calling session, if nothing changed it since base.",
      effect: "contributed-write",
      params: {
        type: "object",
        additionalProperties: false,
        properties: { note: { type: "string", maxLength: 500 }, base: { type: "integer", minimum: 0 } },
        required: ["note", "base"],
      },
      result: { type: "object", properties: { version: { type: "integer" } }, required: ["version"] },
      reasons: {
        stale_base: { detail: { type: "object", properties: { current: { type: "integer" } }, required: ["current"] } },
        no_session: {},
      },
    },
  ],
};

interface Call {
  method: string;
  params: Record<string, unknown>;
  caller: { sessionId: string | null };
  requestId: string;
}

// Accepts anything; Thread Pages has validated the call before it arrives.
const anything = { "~standard": { version: 1 as const, vendor: "tp-echo", validate: (value: unknown) => ({ value }) } };

export default function echoContributor(bb: BbPluginApi): void {
  const notes = new Map<string, { note: string; version: number }>();

  bb.rpc.register(
    { threadPagesContributions: { input: anything, output: anything }, threadPagesInvoke: { input: anything, output: anything } },
    {
      threadPagesContributions: () => DECLARATION,
      threadPagesInvoke: (input: unknown) => {
        const call = input as Call;
        const session = call.caller.sessionId;
        const current = session ? notes.get(session) : undefined;
        if (call.method === "tp-echo.echo") {
          return {
            ok: true,
            result: { text: typeof call.params.text === "string" ? call.params.text : null, sessionId: session, note: current?.note ?? null, version: current?.version ?? 0 },
          };
        }
        if (call.method === "tp-echo.note") {
          if (!session) return { ok: false, error: { code: "unavailable", message: "Notes belong to a session; the home page has none.", reason: "no_session" } };
          const version = current?.version ?? 0;
          if (call.params.base !== version) {
            return { ok: false, error: { code: "conflict", message: "The note changed since you read it.", reason: "stale_base", detail: { current: version } } };
          }
          notes.set(session, { note: String(call.params.note), version: version + 1 });
          return { ok: true, result: { version: version + 1 } };
        }
        return { ok: false, error: { code: "unknown_method", message: `tp-echo has no ${call.method}` } };
      },
    },
  );
}
