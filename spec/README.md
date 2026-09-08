# Thread Pages — specification

Version 1.0 · September 2026

This is a complete, implementation-independent specification of Thread Pages. It
is written so that someone who has never seen the existing code can build the
product from it, on bb or on another host.

The existing implementation (`@unifedev/thread-pages` 0.3.x) is a **partial and
in places contradictory** realisation of this spec. Where they differ, this spec
wins; [09-conformance.md](./09-conformance.md) lists every known difference.

## Read in this order

| # | File | What it settles |
| --- | --- | --- |
| 00 | [00-product.md](./00-product.md) | What this is, who it is for, the model, the non-goals |
| 01 | [01-page-model.md](./01-page-model.md) | What a page *is*: ownership, lifecycle, storage, multi-file sites |
| 02 | [02-serving.md](./02-serving.md) | Routes, tokens, the shell, the document, caching, offline |
| 03 | [03-trust.md](./03-trust.md) | The trust boundary, sandbox, CSP, network access, threat model |
| 04 | [04-page-runtime.md](./04-page-runtime.md) | The API a page sees: forms, uploads, assets, `window.threadPage` |
| 05 | [05-capabilities.md](./05-capabilities.md) | Every capability, its parameters, effects and confirmation |
| 06 | [06-agent-contract.md](./06-agent-contract.md) | The CLI, the instruction, the seed, the authoring guide |
| 07 | [07-configuration.md](./07-configuration.md) | Settings, defaults, and the home-page pointer |
| 08 | [08-host-contract.md](./08-host-contract.md) | What a host must provide, for portability off bb |
| 09 | [09-conformance.md](./09-conformance.md) | Limits table, acceptance criteria, known divergences |

## The five principles

Every requirement in this spec traces to one of these. They were set by the
product owner and are binding; a proposed change that violates one is rejected
without further argument.

**P1 — Native to HTML and instructions.** No hidden or invented functionality. No
coupling to any UI. A page behaves identically wherever it is read. Where a
guideline can do the job, prefer a guideline to a mechanism.

**P2 — The server contract is portable.** It must be possible to reimplement the
host and have existing pages keep working. bb is the first host, not the
definition.

**P3 — One agent, one page.** A page is the product of one agent's work. One HTML
file by default; a site of several files when the agent needs that.

**P4 — Host functionality reaches a page only as attributes and capabilities.**
Other sites are linked. Nothing page-facing is shaped like the host's UI.

**P5 — Functionality first.** Users are responsible, the surface is behind
authentication, and the agent already has the machine. A restriction must earn
its place by preventing something a determined page could not otherwise do.

## Conventions

- **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used in the RFC 2119 sense.
- *Host* means the server implementing this spec (bb, or another).
- *Page* means the agent-authored document and its assets.
- *Shell* means the trusted, host-authored chrome outside the page's sandbox.
- *Agent* means the AI session that owns a page.
- *Reader* means the human who opens a page. Their device is **not** the host's
  device, and several requirements depend on that distinction.

Decisions and their reasoning live in [../docs/DECISIONS.md](../docs/DECISIONS.md).
This spec states the *outcome*; that document states *why*, and should be read
before proposing a change to anything here.
