/**
 * The dirty flag: typing into a captured form, or a page's explicit
 * `setDirty(true)`, tells the shell not to reload under the reader.
 * spec R2.21–R2.23
 */
export interface DirtyTracker {
  /** Current combined state. */
  isDirty(): boolean;
  /** Marks a form dirty; returns the version recorded for it. */
  markForm(form: HTMLFormElement): number;
  /** The version a form was last marked with, if any. */
  versionOf(form: HTMLFormElement): number | undefined;
  /** Clears a form's dirt only if nothing touched it since `version`. */
  clearForm(form: HTMLFormElement, version: number | undefined): void;
  setCustom(dirty: boolean): void;
}

export function createDirtyTracker(onChange: (dirty: boolean) => void): DirtyTracker {
  const versions = new Map<HTMLFormElement, number>();
  let sequence = 0;
  let custom = false;
  let last = false;

  function sync(): void {
    const next = custom || versions.size > 0;
    if (next === last) return;
    last = next;
    onChange(next);
  }

  return {
    isDirty: () => last,
    markForm(form) {
      sequence += 1;
      versions.set(form, sequence);
      sync();
      return sequence;
    },
    versionOf: (form) => versions.get(form),
    clearForm(form, version) {
      if (version !== undefined && versions.get(form) === version) {
        versions.delete(form);
        sync();
      }
    },
    setCustom(dirty) {
      custom = dirty === true;
      sync();
    },
  };
}
