# 07 — Configuration

## Settings

Five, and no more without a decision. Each MUST be readable and writable by the
operator without editing code.

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `agentInstructions` | boolean | `false` | Inject the standing instruction into eligible new sessions |
| `agentInstructionText` | multiline string | the default instruction | What gets injected |
| `pageSeedHtml` | multiline string | the default seed | What a new page starts from |
| `workingLabel` | string | a short sentence | Working-indicator wording; blank hides it |
| `homeSessionId` | string | empty | Which page is home |

- **R7.1** Changing `agentInstructionText` or `pageSeedHtml` MUST affect only
  future sessions and future pages. Existing pages MUST NOT be rewritten.
- **R7.2** `agentInstructions` MUST default to off (R6.16).
- **R7.3** A blank `workingLabel` MUST hide the indicator rather than show an
  empty element.
- **R7.4** An invalid or stale `homeSessionId` MUST degrade gracefully: no home
  link on other pages, and a clear message on the home route. It MUST NOT break
  page serving.
- **R7.5** Settings MUST be applied live. A change MUST NOT require a restart.
- **R7.6** A host MUST NOT add a setting that selects a design, theme, or
  component set ([00-product.md](./00-product.md) §Non-goals).

## The home pointer

- **R7.7** Home MUST be a single session id, set from within the session that
  should own it, and clearable.
- **R7.8** Every page except home MUST show a link to home, rendered by the shell
  (R2.15). Home MUST NOT link to itself.
- **R7.9** The home route MUST redirect to the designated page. It MUST NOT
  render a listing of its own.
- **R7.10** With no home set, other pages MUST simply show no home link.

## Operator visibility

- **R7.11** The operator MUST be able to see, without reading source: the current
  settings and their values, the exact instruction text a new session would
  receive right now (or that none would), and the page path and URL for a given
  session.
- **R7.12** A host SHOULD provide a preview of the configured seed as it will
  render.
- **R7.13** A host MUST NOT require the operator to know a session id to reach
  their pages; home serves that purpose.

## What is not configurable

Stated so an implementation does not add knobs that break invariants.

- **R7.14** The trust boundary is not configurable. There MUST NOT be a setting
  that grants the page top-level navigation, modal dialogs, the host's
  credentials, or a wider sandbox.
- **R7.15** Rate limits, token lifetimes and size limits MAY be tunable by an
  operator but MUST have safe defaults and MUST NOT be settable from a page.
- **R7.16** Capability availability MUST NOT be page-settable. A host MAY let an
  operator disable capabilities; the roster in `context.get` MUST then reflect
  it (R5.9).
