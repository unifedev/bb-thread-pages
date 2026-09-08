# 06 — The agent contract

Everything the agent side of the product consists of. It is deliberately tiny:
one command, one short standing instruction, one seed, one on-demand guide.

- **R6.1** There MUST NOT be an agent tool, a skill, a required project file, or
  a runtime library copied into the user's repository. A page is a file the agent
  already knows how to edit (P1).
- **R6.2** A session that never uses its page MUST pay nothing beyond the
  standing instruction.

## The command

One command with three subcommands. Names are normative; the binary is not.

### `init`

- **R6.3** MUST print the absolute path of the page's entry document and a URL
  the reader can open.
- **R6.4** MUST create the page from the seed when absent, and MUST NOT touch an
  existing page. It MUST say which happened.
- **R6.5** For an ineligible session ([01-page-model.md](./01-page-model.md)) it
  MUST say so plainly and instruct the agent to answer normally without creating
  a page. Silence here produces sub-agents fighting over a page.
- **R6.6** MUST be idempotent and cheap enough to run at the start of every turn.
- **R6.7** The printed URL MUST be externally reachable when the host has a
  public origin, and the loopback URL otherwise.

### `home`

- **R6.8** MUST designate the current session's page as home, and MUST support
  clearing the designation.
- **R6.9** MUST refuse for an ineligible session.
- **R6.10** MUST NOT overwrite an existing page's content. Home is a pointer
  ([00-product.md](./00-product.md) §Home is a convention).
- **R6.11** SHOULD warn when a different page is already home, so a second one is
  not created by accident.

### `guide`

- **R6.12** MUST print the authoring guide and nothing else.
- **R6.13** MUST NOT be loaded into any session automatically. Its cost is paid
  only by sessions that need it.

## The standing instruction

Injected into every eligible new session when enabled. It MUST be short: it is
paid for by every session, so it holds only what changes behaviour.

- **R6.14** MUST be injected only into eligible sessions, and only when enabled.
- **R6.15** MUST be configurable, so an operator can change it for all future
  sessions without touching existing pages.
- **R6.16** MUST default to off, and enabling it MUST be a deliberate act.

It MUST convey:

1. **The page is the conversation.** The reader reads the page and replies from
   it; chat carries the link and one line.
2. **Start by initialising.** Read an existing page before editing it. Saving
   publishes immediately.
3. **Every page ends with a way to answer.** A plain `<form>` is wired
   automatically; blank answers are valid; nothing is required.
4. **Asking well is most of the work.** Buttons and radios for decisions,
   checkboxes for multi-select, free text where the answer is genuinely open. A
   scale needs a meaning. Always leave one open field for what the agent failed
   to anticipate — a form permitting only expected answers takes the decision
   away from the reader.
5. **What belongs on a page:** what was done, decisions that are the reader's
   with a recommendation, what only the reader can supply, and anything a wrong
   assumption would make costly. Report failures and mistakes plainly.
6. **The SKIP case.** If told the session is ineligible, answer in chat and stay
   off the page.
7. **One agent, one page** — see below.
8. **Where to get more.** A page needing more than prose and a form runs the
   guide command first.

### One agent, one page — required content

- **R6.17** The standing instruction MUST teach:
  - **Your page is yours alone.** You never read or write another agent's page.
  - **To create another interface, start an agent and ask for it.** If the reader
    wants a dashboard, a console or a second view, start a session with
    instructions to build it; that agent writes its own page. Link to it, or
    suggest making it home.
  - **A page that should stay put is one whose forms start fresh agents** instead
    of messaging you. Nothing then asks you to rewrite it.
  - **You may talk to an agent whose page you want changed** rather than editing
    its file.

*Rationale:* this is the whole durable-surface mechanism (P3). If the instruction
does not teach it, agents invent workarounds — including creating sessions purely
to hold pages, which [01-page-model.md](./01-page-model.md) forbids.

## The seed

The full document a new page starts from.

- **R6.18** MUST be a complete, valid HTML document that renders acceptably with
  no edits.
- **R6.19** MUST include a working captured form, so the response path exists
  before the agent writes anything.
- **R6.20** MUST be configurable in full, and MUST NOT be applied to existing
  pages.
- **R6.21** MUST support at least a title substitution, escaped.
- **R6.22** SHOULD carry its own stylesheet, which the page then owns
  (R4.36–R4.37).
- **R6.23** SHOULD carry a short comment stating the conventions the agent needs
  while it is already reading the file — this costs no context (P1).

## The authoring guide

Printed on demand. Unbounded in length, and free to sessions that never ask.

- **R6.24** MUST document, at minimum:
  - what plain semantic HTML already gives, so an agent does not rebuild it;
  - forms, the opt-out attribute, independent form state, blank answers;
  - **automatic form capture and the `method="dialog"` trap** (R4.18) — a page
    that means to confirm locally must opt out;
  - uploads and where files land;
  - the page's own files: relative references, nested paths, `fetch` of own data;
  - `window.threadPage`: `invoke`, `watch` and stopping it, `setDirty`;
  - every capability, its parameters, and which ones confirm;
  - **handling `cancelled`**, because a declined confirmation is normal;
  - **`sessions.start` and its explicit defaults** (R5.22) — what a page gets by
    saying nothing, and how to say otherwise;
  - **network access**: pages may fetch from any origin, load remote fonts,
    scripts and data;
  - **the unavailable browser affordances** (R4.13–R4.14): no `window.open`, no
    `prompt`, no `alert`, no `confirm`, no top-level navigation, and what to use
    instead;
  - **the one-agent-one-page rule and the composition route** (R6.17), in the
    fuller form the standing instruction has no room for;
  - accessibility and responsiveness expectations (R4.38).

- **R6.25** The guide MUST NOT describe behaviour the implementation does not
  have. It moves *with* the implementation, never ahead of it. A guide that
  claims a limit the code does not enforce, or denies one it does, is a defect —
  it is the agent's only source of truth about its own sandbox.

- **R6.26** The guide SHOULD state each limit as a number, not an adjective, so
  an agent can design against it.
