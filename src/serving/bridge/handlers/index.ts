import type { CapabilityHandler } from "../handler.ts";
import { navigationOpenExternal, pagesOpen, sessionsOpenHost } from "./navigation.ts";
import { contextGet, projectsList, providersList, sessionActivity, sessionsSnapshot, storageGet, storageSet } from "./reads.ts";
import { projectsBrowse, projectsCreate, sessionReply, sessionsArchive, sessionsSend, sessionsStart, sessionsStop } from "./writes.ts";

/** Every implemented capability's handler. The dispatcher checks this list against the registry at load. */
export const ALL_HANDLERS: readonly CapabilityHandler[] = [
  contextGet,
  sessionActivity,
  sessionsSnapshot,
  projectsList,
  providersList,
  storageGet,
  storageSet,
  sessionReply,
  sessionsSend,
  sessionsStart,
  sessionsStop,
  sessionsArchive,
  projectsBrowse,
  projectsCreate,
  pagesOpen,
  sessionsOpenHost,
  navigationOpenExternal,
] as CapabilityHandler[];
