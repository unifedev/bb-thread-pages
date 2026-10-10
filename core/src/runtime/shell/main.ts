// Entry: read `data-config`, find the elements the shell HTML provides by id (DESIGN §F.2), `installShell`. No chrome is built: the frame, the notice strip, the dialog and the recorder are all there is (U49).
import { readConfig, type ShellConfig } from "../shared/protocol.ts";
import { installShell } from "./install.ts";

const config = readConfig<ShellConfig>(document.currentScript as HTMLScriptElement | null);
const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const notice = byId<HTMLElement>("tp-notice");
const frameHost = byId<HTMLElement>("tp-frame-host");
const dialog = byId<HTMLDialogElement>("tp-dialog");
if (!notice || !frameHost || !dialog) throw new Error("The shell's document is incomplete");

installShell(window, config, { notice, frameHost, dialog, recorder: byId<HTMLElement>("tp-recorder") });
