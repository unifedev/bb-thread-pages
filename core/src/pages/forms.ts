// Server-side form matching: assembled HTML → `FormIdentity[]` via `domain/html/forms.ts`, then `matchForm` (05 R-S11, 02 R-K5).
import { matchForm, type FormIdentity, type WantedForm } from "../domain/forms/identity.ts";
import type { PageStore } from "../serving/stores.d.ts";

export interface FormMatch {
  /** The current document's revision, which the match was made in. */
  readonly revision: string;
  readonly form: FormIdentity | null;
}

/**
 * Matches a submission's form in the current document by identity only:
 * `formId`, else `formTitle`; a form with neither only on the revision it was
 * written against — there, the first form without an identity that carries
 * every field the submission names, since a submission carries no position
 * (DESIGN §D.4; the index is this slice's reading, NOTES-slice2). Position
 * never matches across revisions. 05 R2.32, R-S11; 02 R-K5
 */
export async function matchSubmissionForm(pages: PageStore, session: string, path: string | null, wanted: WantedForm): Promise<FormMatch> {
  const { revision, forms } = await pages.forms(session, path);
  let wantedIndex: number | undefined;
  if (!wanted.formId && !wanted.formTitle?.trim() && wanted.writtenAgainst === revision) {
    wantedIndex = forms.find((form) => form.id === null && form.title === null && wanted.fields.every((field) => form.fields.has(field)))?.index;
  }
  return { revision, form: matchForm(forms, wanted, revision, wantedIndex) };
}
