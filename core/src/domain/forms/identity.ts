// `FormIdentity`, `formKey(...)`, `matchForm(current, wanted, currentRevision, wantedIndex?)` — the one matching rule for server, shell and kernel (02 R-K5).

/** One captured form of a document: its identity and the names of its controls. 02 R-K5 */
export interface FormIdentity {
  /** The form's `id`, or null. */
  readonly id: string | null;
  /** The form's `data-title`, trimmed, or null when absent or empty after trimming. */
  readonly title: string | null;
  /** The form's position among every `<form>` of the document, in document order. */
  readonly index: number;
  /** Every control name associated with the form (descendants and `form=` attribute), excluding buttons and submit/reset/button/image inputs. 02 R4.5a */
  readonly fields: ReadonlySet<string>;
}

/** What a submission or draft says about its form. 02 R-K6, 05 R2.32 */
export interface WantedForm {
  readonly formId: string | null;
  readonly formTitle: string | null;
  readonly writtenAgainst: string;
  /** The field names the submission or draft carries. */
  readonly fields: readonly string[];
}

/** A `data-title` as identity: trimmed, null when empty. 02 R-K5 */
export function normalizeTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The key a form's drafts are stored under: `id:<id>` when it has an id, else
 * `title:<data-title>`, else `none:<revision>:<index>` — matched only within
 * that revision. 02 R-K5; DESIGN P12
 */
export function formKey(form: { id: string | null; title: string | null; index: number }, revision: string): string {
  if (form.id !== null && form.id !== "") return `id:${form.id}`;
  const title = normalizeTitle(form.title);
  if (title !== null) return `title:${title}`;
  return `none:${revision}:${form.index}`;
}

/** The key of a text control outside any form: its `id`, else its `name`; null when it has neither (not drafted). 02 R-K4 */
export function controlKey(control: { id: string | null; name: string | null }): string | null {
  if (control.id) return `ctl:${control.id}`;
  if (control.name) return `ctl:name:${control.name}`;
  return null;
}

function carriesEveryField(candidate: FormIdentity, fields: readonly string[]): boolean {
  return fields.every((field) => candidate.fields.has(field));
}

/**
 * The one matching rule (02 R-K5, 05 R2.32): by `id` when the form had one;
 * else by `data-title` when exactly one id-less form of the current revision
 * carries it; else, only when `writtenAgainst` is the current revision, the
 * form at `wantedIndex`. A candidate matches only if it carries every field
 * the submission or draft names. Position never matches across revisions.
 */
export function matchForm(current: readonly FormIdentity[], wanted: WantedForm, currentRevision: string, wantedIndex?: number): FormIdentity | null {
  if (wanted.formId !== null && wanted.formId !== "") {
    const byId = current.find((form) => form.id === wanted.formId);
    return byId && carriesEveryField(byId, wanted.fields) ? byId : null;
  }
  const title = normalizeTitle(wanted.formTitle);
  if (title !== null) {
    const byTitle = current.filter((form) => form.id === null && form.title === title);
    if (byTitle.length !== 1) return null;
    const only = byTitle[0]!;
    return carriesEveryField(only, wanted.fields) ? only : null;
  }
  if (wanted.writtenAgainst !== currentRevision || wantedIndex === undefined) return null;
  const byIndex = current.find((form) => form.index === wantedIndex && form.id === null && form.title === null);
  return byIndex && carriesEveryField(byIndex, wanted.fields) ? byIndex : null;
}
