import { readConfig, type ShellConfig } from "../shared/protocol.ts";
import { installShell } from "./install.ts";

// Entry for the bundled shell runtime.
const config = readConfig<ShellConfig>(document.currentScript);
const frame = document.querySelector("iframe");
const status = document.querySelector<HTMLElement>("[data-shell-status]");
const work = document.querySelector<HTMLElement>("[data-shell-working]");
const reload = document.querySelector<HTMLButtonElement>("[data-shell-reload]");
const dialog = document.querySelector("dialog");
if (!frame || !status || !work || !reload || !dialog) throw new Error("Thread Page shell: chrome is incomplete");
installShell(window, config, { frame, status, work, reload, dialog });
