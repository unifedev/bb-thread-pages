// Entry: read `data-config`, take primitives, create the port, post `ready` with the port (05 R2.3a), install. Bundled by scripts/build-runtime.mjs; runs before any authored script (02 R4.1).
import { readConfig, type KernelConfig } from "../shared/protocol.ts";
import { installKernel } from "./install.ts";

installKernel(window, readConfig<KernelConfig>(document.currentScript as HTMLScriptElement | null));
