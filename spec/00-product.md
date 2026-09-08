# 00 — Product definition

## What it is

Thread Pages gives every agent session one web page it writes itself, and one
stable URL a human opens to read it and answer from.

An agent working on a task often has more to say than a chat transcript can
carry: a comparison, a diagram, a set of options, a decision only the human can
make. Chat forces all of that into a linear stream of prose. A page does not.

The page is written for one task by one agent. It is not a template with slots
and not a dashboard with widgets, because the shape of what needs saying changes
with the task. The product supplies a secure host and a narrow way for the page
to talk back; it supplies no design.

## Who it is for

A person running agent sessions who wants to follow and steer them from anywhere,
including a phone, without watching a terminal. They are the owner of the machine
the agents run on, they are authenticated, and they are responsible for what
their agents do. This last point is load-bearing: it is why the product is
permissive where a multi-tenant product could not be (P5).

## The model

### One agent, one page

A page is the product of one agent's work and is tied to that agent's session
identity. There is no second kind of page, no page without an owner, and no page
shared between agents.

An agent reads and writes **only its own page**. If it wants another interface to
exist, it starts another agent and asks for it — which is ordinary behaviour, not
a feature of this product.

### Durable surfaces are composition, not a feature

A console, a dashboard, a launcher — anything that should stay put rather than be
rewritten each turn — is a page whose **forms start fresh agents** instead of
messaging its owner. Nothing asks the owning agent to change the page, so it does
not change. The started agent may have no route back into the page at all.

This is the whole mechanism. There is no "durable page" flag, no pinning, and no
second lifecycle. It follows that:

- **Starting work from a page is load-bearing**, not a convenience. It is how
  durable surfaces come to exist. See [05-capabilities.md](./05-capabilities.md).
- **A new dashboard is an agent, not a feature request.** Start an agent, tell it
  what to build, it writes its own page. Link to it, or make it home.

### Home is a convention

One page may be designated *home*. That designation is a pointer, nothing more:
home is an ordinary agent-authored page that the host happens to link back to
from every other page. Any page can be home. The host MUST NOT render a home page
of its own.

### Networks of pages are emergent

Pages MAY link to one another and to any other site. The host does not model a
page graph, does not own navigation between pages, and does not provide a shell
that swaps documents. A link is a link (P1).

## What the product guarantees

1. **The page is a file the agent edits directly.** Saving is publishing. There
   is no separate publish step, no template to fill, and no API to post a page to.
2. **The agent's contract stays small.** One command, one short standing
   instruction, and a longer guide the agent fetches only when it needs one.
3. **The page holds no host authority.** It is generated code, so it never
   receives the host's credentials. Everything it can make the host *do* goes
   through one named, validated capability at a time.
4. **One URL, every device.** A page is served from the origin the reader is
   already authenticated to, so the same link works on a laptop and a phone with
   no additional port, tunnel, or password.
5. **The page outlives the turn.** A reader who opens a page while the agent is
   mid-turn sees the last saved version and is told a new one is coming.

## Non-goals

**A component library or theme picker.** The host hosts pages; it does not design
them. A starting stylesheet in the seed is a starting point, not a menu.

**A fixed dashboard.** Anything the host renders itself is one thing an agent
cannot adapt to the task. Under the model above there is nothing to render even
in principle: a dashboard is a page some agent was asked to build.

**A page that knows where it is being read.** A page behaves the same in a host
application, a browser, and a phone. No host-only affordance, and no host-only
fix for a problem a phone also has (P1, P2).

**Strict no-exfiltration.** Preventing a page from moving data it can already see
would require forbidding authored JavaScript, which is the product. See
[03-trust.md](./03-trust.md) for why this is a stated trade and not an oversight.

**A host-credential proxy.** Pages reach the network directly (see
[03-trust.md](./03-trust.md)), but anything requiring the *host's* identity gets a
named capability, never a generic pass-through.

## Deliberately deferred

These are wanted and not specified here. An implementation MUST NOT invent them.

- **Embedding another page or site in a frame.** Wanted; the shape is undecided.
- **Widened cross-session reads.** The direction is decided
  ([05-capabilities.md](./05-capabilities.md) §Reads), the field set is not.
- **Voice capture.** A contract exists; no behaviour is specified.
