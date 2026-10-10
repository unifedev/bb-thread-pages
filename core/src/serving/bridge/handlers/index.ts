// `ALL_HANDLERS`: every implemented capability's handler; the dispatcher checks this list against the registry at load (DESIGN §E.4, §H slice 4).
import type { CapabilityHandler } from "../../context.ts";
import { contextGet } from "./context.ts";
import { navigationOpenExternal, pagesOpen } from "./navigation.ts";
import { pagesAnswer, pagesRead } from "./pages.ts";
import { providersList } from "./providers.ts";
import { sessionActivity, sessionMessages, sessionReply, sessionRespond, sessionUsage } from "./session.ts";
import { sessionsArchive, sessionsMarkRead, sessionsMessages, sessionsOpenHost, sessionsRespond, sessionsSend, sessionsSnapshot, sessionsStart, sessionsStop } from "./sessions.ts";
import { storageGet, storageSet, storageSetMany } from "./storage.ts";
import { voiceCaptureAndTranscribe } from "./voice.ts";
import { workspacesBrowse, workspacesCreate, workspacesList } from "./workspaces.ts";

export const ALL_HANDLERS: readonly CapabilityHandler[] = Object.freeze([
  contextGet,
  sessionActivity,
  sessionMessages,
  sessionReply,
  sessionRespond,
  sessionUsage,
  storageGet,
  storageSet,
  storageSetMany,
  workspacesList,
  workspacesBrowse,
  workspacesCreate,
  sessionsSnapshot,
  sessionsMessages,
  sessionsStart,
  sessionsSend,
  sessionsStop,
  sessionsArchive,
  sessionsMarkRead,
  sessionsRespond,
  sessionsOpenHost,
  providersList,
  pagesOpen,
  pagesRead,
  pagesAnswer,
  navigationOpenExternal,
  voiceCaptureAndTranscribe,
] as CapabilityHandler[]);
