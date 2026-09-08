/**
 * Navigation belongs to the trusted shell. Destinations arrive from the host,
 * already validated; the shell never builds one from page-supplied text.
 * spec R5.29–R5.34
 */
export interface Navigator {
  /** Same-origin destinations navigate the reader's view in place. */
  inPlace(url: string): void;
  /** Claims a window during a user gesture so a later navigation is not a blocked popup. */
  reserveWindow(): void;
  /** Sends the reserved window (or, failing that, this view) to an external URL. */
  external(url: string): void;
  /** Releases a reserved window that will not be used. */
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
            // Some browsers refuse; the navigation below still uses noreferrer semantics.
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
          return;
        } catch {
          try {
            target.close();
          } catch {
            // ignore
          }
        }
      }
      win.location.assign(url);
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
