// In-place navigation for `pages.open` and host open; new-tab external open after confirmation, never replacing the shell (03 R5.29–R5.34; 02 R4.15).

export interface Navigator {
  /** Same-origin destinations navigate the reader's view in place. */
  inPlace(url: string): void;
  /** Claims a window during a user gesture so a later navigation is not a blocked popup. */
  reserveWindow(): void;
  /** Sends the reserved window (or, failing that, a new one) to an external URL; false when the browser refused both, in which case the page stays and the caller says so. 03 R5.33, 02 R4.15 */
  external(url: string): boolean;
  release(): void;
}

export function createNavigator(win: Window): Navigator {
  let reserved: Window | null = null;
  return {
    inPlace(url) {
      win.location.assign(url);
    },
    reserveWindow() {
      try {
        reserved = win.open("", "_blank");
        if (reserved) {
          try {
            reserved.opener = null;
          } catch {
            // Some browsers refuse; noreferrer semantics hold regardless.
          }
        }
      } catch {
        reserved = null;
      }
    },
    external(url) {
      const target = reserved;
      reserved = null;
      if (target && !target.closed) {
        try {
          target.location.href = url;
          return true;
        } catch {
          try {
            target.close();
          } catch {
            // ignore
          }
        }
      }
      try {
        return win.open(url, "_blank", "noopener,noreferrer") !== null;
      } catch {
        return false;
      }
    },
    release() {
      const target = reserved;
      reserved = null;
      try {
        target?.close();
      } catch {
        // ignore
      }
    },
  };
}
