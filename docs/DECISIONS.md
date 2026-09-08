# Design decisions

Decided · September 2026

Eight questions raised by building a multi-page console on the plugin. All eight
are now answered. This records the answer, the reasoning behind it, and the
implications that follow — including the ones that contradict what the plugin
does today.

Two answers changed the product rather than confirming it: **D1** replaced the
question with a better model, and **D7** reversed a standing non-goal. Both are
written out in full because everything downstream depends on them.

Where a written answer was broader than the option selected, **the written answer
is authoritative** and the difference is noted.

---

## The principles these answers express

Stated by the owner alongside the answers, and binding on everything below.

1. **Stay native to HTML and instructions.** No hidden or invented functionality,
   and no coupling to a UI. A page behaves identically wherever it is read.
2. **The server contract must be portable.** It should be possible to reimplement
   the same functionality on another server and have pages keep working. bb is
   the first host, not the definition. This strengthens the existing
   *Portability* constraint: it now applies to the **server surface**, not only
   to the page.
3. **One agent is one page.** By default a single HTML file; it may grow into a
   full site of several files if the agent needs that.
4. **bb functionality reaches a page only as attributes and capabilities.** Other
   sites are *linked*. Embedding them in a frame is wanted, and deferred.
5. **Functionality is the priority.** Users are responsible, the whole thing is
   behind auth, and the agent already has the machine. Restrictions must earn
   their place; where instructions can do the job, prefer instructions.

---

## D1. What is a page, and where do durable surfaces come from?

**Decided: one agent owns one page, always. Durable surfaces are composition, not
a feature.**

The selected option was *detach*, but the written answer keeps a page tied to a
thread id. The written answer governs, and it is not any of the three options I
offered — it dissolves the question instead of answering it.

### The model

- A page is **the product of one agent's work**, tied to that agent's thread id.
  There is no second kind of page, no pageless page, and no page that outlives
  its owner's identity.
- A page is **one HTML file by default**, and may become a site of several files
  when the agent needs that.
- **A durable console is a page whose forms spawn fresh agents** rather than
  messaging its owner. Nothing asks the owning agent to rewrite it, so it stays
  put. The spawned agent may have no connection back into the page at all.
- **The home page is a convention, not a mechanism.** It is one agent's page that
  we happen to point at. Any page can be home; making one home is setting a
  pointer.
- **Want a new dashboard? Ask an agent to be one.** Spawn an agent with
  instructions to build that dashboard; it writes its own page. Link to it, or
  make it home.
- **An agent reads and writes only its own page.** If it wants another interface
  to exist, it spawns another agent — native bb behaviour — and gives it
  instructions. The user still reads the first agent's output; the dashboard
  arrives as the second agent's page. The first agent can talk to the second and
  have the page adjusted, without ever writing to it.

### Why this is better than what I proposed

My three options all treated durability as a property a page needs to be
*granted* — a second page kind, or detachment from threads. This model gets
durability for free from a property the system already has: an agent that is not
asked to do anything does not change its page. The mechanism stays one sentence
long, and "make me a dashboard" becomes an ordinary agent task rather than a
plugin feature.

It also makes the console pattern I built architecturally legitimate while
condemning how I built it. The *shape* was right — pages whose buttons start
fresh work. The *construction* was wrong: I created agentless threads by
scheduling their prompt a month out and deleting the queued message, so the pages
would have no owner to disturb them. Under this model that hack is unnecessary
and wrong. Each console page should be owned by a real agent that built it and
then stopped.

### Implications

- **`threads.spawn` becomes load-bearing.** It is the mechanism durable surfaces
  are made of, not a convenience. It must always work. See D5.
- **The consoles need rebuilding** so each page has a genuine owning agent.
- **Multi-file pages are now in scope**, and today's storage forbids them: assets
  are a flat directory with no subdirectories, served from a *separate* preview
  origin through an injected `<base href>`. That indirection is also the direct
  cause of two open bugs (asset CSP scheme, preview TTL). Serving a page's own
  directory as a site under the page's own route would satisfy the multi-file
  requirement and remove both bugs' cause at once. **Flagged as a design
  direction, not decided.**
- **The standing agent instruction needs to teach this**: a page is yours alone;
  to create another interface, spawn an agent and ask for it.
- **The non-goal *A fixed dashboard* is reinforced**, not weakened. A dashboard
  is an agent's page, never something the plugin renders.

---

## D2. Networks of pages

**Decided: emergent.** Pages may link to one another through the existing
capability. The plugin does not model a page graph, own navigation between pages,
or introduce a shell that swaps documents.

Consistent with D1: if pages are individual agents' work, a link is a link.
Consistent with principle 4: other sites are linked too.

**Still true and still worth fixing:** `threads.openPage` opens a tab via
`window.open`, which mobile browsers block outright. The already-agreed fix (the
trusted shell navigates in place) stands on its own as a bug fix — this decision
just means it stops there and does not grow into a navigation framework.

**Deferred, wanted:** embedding another site or page in a frame. Explicitly "for
later to discuss". Today `frame-src 'none'` forbids it.

---

## D3. Sharing code and design between pages

**Decided: no sharing.** Each page carries its own copy of everything.

Follows from D1 — one agent, one page, no shared runtime between them — and
preserves the property already recorded in the roadmap: per-page copies are what
make restyling one page safe and plugin updates harmless.

**Implication for what I built:** the shared `hub.js` rail copied into six
threads is against this decision. It was a reasonable experiment and it is not
the pattern to keep. If several pages should look alike, that is an instruction
to the agents that write them, not a shared file.

**Removes from the roadmap:** the *shared asset space* idea, and any notion of a
plugin-shipped library. The symlink refusal is no longer a problem to solve, only
a fact to document.

---

## D4. What a page may read about other sessions

**Decided: widen.** Pages get more than id, title, status and timestamp for
threads other than their own.

Rationale, consistent with principle 5: a page that can only see status cannot
be a useful progress surface, and the information is the user's own.

**Left to specify.** The decision is the direction; the fields are not chosen.
Each additional field is its own question — last message, last output, error
detail — and each one puts more of one session inside another page. Worth
deciding as a set rather than one at a time.

**Interaction to design around:** with D7 opening the network, whatever a page
can read it can also send anywhere. That is not an argument against either
decision, but it means the widened fields should be chosen deliberately rather
than by taking whatever the snapshot happens to hold.

**Also unblocks:** `threads.snapshot` paging, currently a stub with
`nextCursor` always `null` and a hard cap of 200.

---

## D5. Starting work from a page

**Decided: pages may start any work they want, with explicit defaults that always
work.** The defaults are documented in the guidelines so that an agent using or
overriding them is making a deliberate choice.

This makes the current `threads.spawn` failure a plain bug rather than an open
question: the call must supply whatever bb requires — including the `environment`
field it omits today — and must succeed without the page having to know about it.

**Rejected by this answer:** the roadmap's lean toward pages not starting
sessions at all, on the grounds that it is "a confirmation dialog and a guess at
defaults". Under D1 that position is untenable: spawning is how durable surfaces
come to exist. The roadmap note should be corrected rather than left standing.

**What "explicit defaults" commits us to.** The default must be stated, not
implicit — an agent reading the guide should know which environment, provider and
model a page-started session gets when it says nothing, and how to say something
else. That is a documentation obligation as much as a code one.

**Interim:** the dispatcher-session workaround I built (a page messages an agent
that runs `bb thread spawn` itself) stays only until the capability works, and
should then be deleted rather than kept as a pattern.

---

## D6. Automatic form capture

**Decided: documentation only.** Every `<form>` without
`data-thread-page-manual` continues to submit to the thread. The behaviour is
correct and the plain-HTML promise is worth more than the sharp edge.

The guide must warn about it, and specifically about the case that caught me: a
`<form method="dialog">` inside a `<dialog>`, written only to close a local
confirm, sent a real message to the thread and reported "Sent (queued)" while the
page's own dialog handling never ran.

Consistent with principle 5: prefer instructions to restrictions.

---

## D7. Network access — reversal of a non-goal

**Decided: pages get internet access.** The selected option was the narrow
*same-origin reads of its own assets*; the written answer asks for full access
and supersedes it. The narrow option is subsumed — with general access, a page
fetching its own asset works trivially.

This reverses the standing non-goal *General network access from a page* and
substantially rewrites the network half of the trust boundary.

### The reasoning, which I have checked and agree with

- **The agent already owns the machine.** It can take any destructive action
  directly; it does not need the page to do it.
- **Local programs and scripts are not a new threat surface** — they can already
  trigger agents from elsewhere.
- **A remote script the agent chose to include is not a new risk** either: the
  agent could have used that script anywhere.
- **The system is behind auth**, and the user is responsible for it.
- **Functionality is the priority.** Fonts, images, data, maps, libraries and
  live sources are most of what makes a page a real application.

### What I checked before agreeing

The old non-goal was partly justified by exfiltration. That justification does
not hold, and `ARCHITECTURE.md` already concedes why: page JavaScript can
navigate its own frame and encode data in the destination URL, and neither
sandbox flags nor CSP resource directives close that channel. So for data already
inside the frame, `connect-src 'none'` was buying obscurity, not prevention. The
honest position is the one now taken.

The page still holds **no bb authority**: no cookie, no mutation token, no parent
DOM, no raw API. That is enforced by the opaque origin and is unaffected by
network access. Everything a page can make bb *do* still goes through one
validated capability at a time, with trusted confirmations. Opening the network
does not touch that boundary.

### One consequence to design for, not an objection

A page runs in the **reader's** browser, which is often not on the same network
as the bb host — a phone on home wifi, a laptop at an office. With an open
`connect-src`, page JavaScript can reach whatever *that* network can reach,
including loopback and private-range addresses on the reader's own device. This
is the one capability that does not follow from "the agent already owns the bb
host", because it is a different machine.

It is also not cleanly preventable: CSP cannot express "public internet but not
private ranges", so the realistic choices are open access or a curated
allow-list, and an allow-list contradicts the decision. **Recorded as an accepted
consequence** unless the owner says otherwise.

### Follow-on

The written answer also says agents should be **informed when their instructions
are wrong**, rather than being silently restricted. That is a real obligation on
the guide and error surfaces, and it sits in tension with D8 — see below.

---

## D8. Honesty about a page's own failures

**Decided: status quo.** No new failure channel is built. Page authors and agents
diagnose from the plugin log.

**Recorded tension.** The D7 answer says we should "rather inform the agent if it
gives wrong instructions". That is agent-facing feedback, which was option (c)
here. The two are reconcilable if read narrowly:

- **No new channel** — nothing is built to stream page errors back to an agent.
- **But nothing should fail silently by design.** Where a limit exists, the guide
  should state it plainly so an agent does not have to discover it by
  experiment.

Under that reading, D7 largely dissolves the problem rather than needing a
channel: the failures that cost the most time — blocked stylesheets, blocked
scripts, an unreachable asset base — were all consequences of CSP restrictions
that D7 removes or reduces.

**Left standing as a known cost:** a broken capability still reports only "Could
not execute the Thread Page action" while the real cause sits in the plugin log.

---

## What these answers change in the existing documents

| Document | Change |
| --- | --- |
| `ARCHITECTURE.md` | Intent gains the one-agent-one-page model and the composition route to durable surfaces. Trust boundary rewritten for network access. Portability extended to the server contract. |
| `docs/ROADMAP.md` | Non-goal *General network access* reversed. The lean against page-started sessions corrected. Shared-asset ideas dropped. Multi-file pages added. |
| `docs/MODEL.md` | Storage section becomes wrong if a page may be several files. |
| `authoring.ts` | The standing instruction must teach the spawn-an-agent route to new interfaces. The guide must document network access, the default spawn environment, and the form-capture trap. **Not yet edited on purpose:** it currently tells agents that "ordinary fetch and subresource networking are blocked", which is true of the code as it stands. Changing that sentence before the CSP changes would make the guide lie to every session. It moves with the implementation, not before it. |

## Written up as a specification

These answers are now specified in full in [../spec/](../spec/) — a complete,
implementation-independent description of the product, written so it can be
rebuilt from scratch on bb or another host. The five principles above appear
there as **P1–P5** and every requirement traces to one of them.

This file remains the record of *why*; the spec is the record of *what*.

## Still open after these answers

1. **Which fields D4 widens to.** Direction decided, set not chosen.
2. **The storage shape for multi-file pages**, and whether serving a page's own
   directory under its own route replaces the preview-origin indirection.
3. **Frame embedding of other pages and sites** — wanted, explicitly deferred.
4. **Whether the reader's-network reachability under D7 is accepted** as written
   above.
