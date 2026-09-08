import { readConfig, type KernelConfig } from "../shared/protocol.ts";
import { installKernel } from "./install.ts";

// Entry for the bundled kernel: runs before any authored script (spec R4.1)
// and reads its configuration from its own script element.
installKernel(window, readConfig<KernelConfig>(document.currentScript));
