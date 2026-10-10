// `ContributorHost`, `ContributorCall`, `ContributorAnswer` — 07 §The call. No imports.

/** Where a host has contributors, how the server lists and calls them. spec 07 §The call, §Discovery per host */
export interface ContributorHost {
  /** Every enabled contributor with its raw declaration. Rejects only when the host cannot list. */
  list(): Promise<{ id: string; declaration: unknown }[]>;
  /** One call. Rejects only when the contributor cannot be reached; its own failure is an answer. */
  invoke(contributorId: string, call: ContributorCall): Promise<ContributorAnswer>;
  /** The session's workspace as a contributor needs it: the folder the session works in, on which machine. null when the host has no folder for it. Rejects only when the host cannot say. spec 07 §The call (U44) */
  workspaceOf(sessionId: string): Promise<ContributorWorkspace | null>;
}

/** Who is calling, as far as a contributor is concerned: the session's workspace id (as the host reports it everywhere else), its folder, and the machine the folder is on. spec 07 §The call (U44) */
export interface ContributorWorkspace {
  id: string;
  path: string;                                                   // absolute, as it is on `machine`; host → contributor only, never to a page (03 R-C5)
  machine: string | null;                                         // the host's name for the machine; null where the host has one machine
}

/** One contributed call as the contributor receives it. spec 07 §The call, R5.48, R5.49, R5.84 */
export interface ContributorCall {
  method: string;
  params: unknown;                                                // validated in params mode before the call (07 R5.48)
  caller: { sessionId: string | null; scope: string | null;      // from the action token; null session on the built-in home (R5.49)
            workspace: ContributorWorkspace | null };             // the host's, for that session; null on the built-in home (U44)
  requestId: string;
}

/** What a contributor answers: a result, or a failure in the fixed code set with a declared reason. spec 07 §The call, 03 R5.41b */
export type ContributorAnswer =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message?: string; reason?: string; detail?: unknown } };
