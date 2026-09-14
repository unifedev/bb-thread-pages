import { PageError } from "../domain/errors.ts";
import { revisionOf } from "../domain/revision.ts";
import type { LoadedPage } from "../pages/page-store.ts";
import type { ServingContext } from "./context.ts";

/**
 * A page its agent has not written yet. The product ships no starting file,
 * so an eligible session's link is valid before the first save: the shell
 * says so in its own chrome, the frame shows one line of host text, and the
 * revision poll picks the page up the moment the file exists.
 * spec R6.18–R6.19, DECISIONS D11
 */
export const EMPTY_REVISION = revisionOf("");

export async function loadUnlessUnwritten(serving: ServingContext, session: string): Promise<LoadedPage | null> {
  try {
    return await serving.pages.load(session);
  } catch (error) {
    if (PageError.is(error) && error.code === "no_page") return null;
    throw error;
  }
}

export const EMPTY_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Not written yet</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;color:GrayText;background:Canvas}p{margin:0;padding:1rem;max-width:32rem;text-align:center}</style>
</head>
<body><p>This session has not written its page yet. It appears here as soon as the agent saves it.</p></body>
</html>`;
