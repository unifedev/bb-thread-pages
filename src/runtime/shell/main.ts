import { readConfig, type ShellConfig } from "../shared/protocol.ts";
import { installShell } from "./install.ts";

// Entry for the bundled shell runtime.
const config = readConfig<ShellConfig>(document.currentScript);
const frame = document.querySelector("iframe");
const status = document.querySelector<HTMLElement>("[data-shell-status]");
const work = document.querySelector<HTMLElement>("[data-shell-working]");
const reload = document.querySelector<HTMLButtonElement>("[data-shell-reload]");
const dialog = document.querySelector<HTMLDialogElement>("dialog:not([data-shell-grants-dialog])");
const grantsButton = document.querySelector<HTMLButtonElement>("[data-shell-grants]");
const grantsDialog = document.querySelector<HTMLDialogElement>("[data-shell-grants-dialog]");
const title = document.querySelector<HTMLElement>(".title");
// The session actions are absent on the built-in home page, which has no session.
const acts = document.querySelector<HTMLElement>("[data-shell-acts]");
const pin = document.querySelector<HTMLButtonElement>('[data-act="pin"]');
const read = document.querySelector<HTMLButtonElement>('[data-act="read"]');
const archive = document.querySelector<HTMLButtonElement>('[data-act="archive"]');
const bar = document.querySelector<HTMLElement>("[data-shell-recorder]");
const wave = bar?.querySelector<HTMLCanvasElement>("canvas") ?? null;
const time = bar?.querySelector<HTMLElement>("[data-rec-time]") ?? null;
const recStatus = bar?.querySelector<HTMLElement>("[data-rec-status]") ?? null;
const cancel = bar?.querySelector<HTMLButtonElement>('[data-rec="cancel"]') ?? null;
const done = bar?.querySelector<HTMLButtonElement>('[data-rec="done"]') ?? null;
const recordButton = bar?.querySelector<HTMLButtonElement>('[data-rec="record"]') ?? null;
if (!frame || !status || !work || !reload || !dialog || !title) throw new Error("Thread Page shell: chrome is incomplete");
installShell(window, config, {
  frame,
  status,
  work,
  reload,
  dialog,
  title,
  acts,
  pin,
  read,
  archive,
  grants: grantsButton && grantsDialog ? { button: grantsButton, dialog: grantsDialog } : null,
  recorder: bar && wave && time && recStatus && cancel && done && recordButton ? { bar, wave, time, status: recStatus, cancel, done, record: recordButton } : null,
});
