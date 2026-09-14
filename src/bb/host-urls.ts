import type { SessionRecord } from "../host/types.ts";

/** bb's own project for sessions that belong to no project of the reader's. */
export const BB_PERSONAL_PROJECT_ID = "proj_personal";

/**
 * The bb app's address for a session's conversation, origin-relative. A
 * session in a project is at `/projects/<projectId>/threads/<id>`; only the
 * Personal project's sessions use the project-less `/threads/<id>` — bb's
 * `client-core/src/routes/route-paths.ts`. spec R5.31a
 */
export function bbSessionUrl(session: Pick<SessionRecord, "id" | "projectId">): string {
  const id = encodeURIComponent(session.id);
  return session.projectId && session.projectId !== BB_PERSONAL_PROJECT_ID ? `/projects/${encodeURIComponent(session.projectId)}/threads/${id}` : `/threads/${id}`;
}
