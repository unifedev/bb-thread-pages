# Thread Pages

Give every bb thread its own web page — written by the agent, for that one task.

## What it does

An agent working on a task usually has more to tell you than chat can carry: a
comparison, a diagram, a set of choices, a thing only you can decide. Thread
Pages gives it a real page to say it on.

The agent runs one command, gets an HTML file, and edits it directly. Saving the
file publishes it. You open one stable link — in bb, in a browser, on your
phone — read the page, and answer from inside it. Your answer arrives as the
agent's next message.

The page is a complete HTML document the agent writes for the task at hand. Not
a template with slots. If the task needs a chart, it writes a chart. If it needs
an eight-screen wizard, a diagram you click, or three separate forms, it writes
that. The plugin supplies the secure host, never the design.

## Why it is built this way

**Nothing to learn, nothing to load.** There is no skill in the agent's context,
no page tool, no publish protocol, no runtime copied into your files. The
standing instruction is two sentences. Deeper guidance is one optional command
away, so a simple task never pays for it.

**The page is a file.** It lives in the thread's own storage as ordinary HTML.
The agent reads and writes it with the tools it already has. You can open it,
diff it, or keep it.

**Your bb, your page.** Pages are served through the bb origin you are already
authenticated to, so they work over bb Connect and on mobile without exposing a
second port or a public URL.

**Safe by construction.** Page code runs in an opaque-origin sandbox with no bb
cookie, no mutation token, no parent DOM, no raw API, and no general network
access. Anything the page can ask bb to do goes through one narrow, validated
capability at a time.

## In the page

- Any HTML, CSS, and JavaScript the task needs, including Web Components, SVG,
  canvas, and multi-screen state.
- Forms that reply to the thread with no code at all — blank answers included,
  several forms at once, each with its own state.
- File attachments, stored beside the thread and handed to the agent by path.
- Images, stylesheets, fonts, and data from a confined per-thread asset folder.
- Live thread activity, and a working indicator while the agent is mid-turn.
- Listing, messaging, starting, stopping and archiving sessions from a page.
- Update protection, so a page reload never eats what you were typing.
- A read-only cached copy when the source machine goes offline.

## Getting started

Install the plugin, then turn on **Agent initialization hint** in its settings
to have new sessions use their page automatically. Or leave it off and ask any
agent to run `bb thread-page init`.

The page seed and the instruction text are both settings, so you can change what
every future page starts from without touching any existing page.

## The home page

`bb thread-page home` writes a session hub grouped by project, each group with
its own look, and every other page then shows a **← Sessions** link back to it.

Home is an ordinary page afterwards — ask the agent that owns it to regroup or
restyle it. Groups are not tied to projects: a group is a label, a look, and a
set of projects, so "Work" and "Side projects" are as valid as one-per-project,
and a project can appear in both.

## Current state

Everything needed for daily use is implemented and verified in a browser: page
authoring, forms, attachments, confined assets, live activity, the session hub,
and the full capability set with trusted confirmations. Voice dictation has a
defined contract but no handler yet.

One limitation worth stating plainly: page JavaScript can navigate its own frame
and put data in that URL. Browsers cannot prevent this while still allowing page
scripts. It grants no bb authority, but a page you did not write is still code
you are choosing to run.
