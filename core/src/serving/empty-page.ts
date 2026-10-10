// The not-yet-written frame document and `EMPTY_REVISION` (04 R6.19; DESIGN P23; U49: the document says so itself, no chrome does).
import { EMPTY_REVISION } from "../domain/revision.ts";
import { EMPTY_PAGE_STATUS } from "../runtime/shared/protocol.ts";

export { EMPTY_REVISION };

/**
 * A page its agent has not written yet: the frame shows a host document
 * that says so, under the digest of nothing; the poll notices the first
 * save as any revision change. 04 R6.19
 */
export const EMPTY_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Not written yet</title>
<style>html,body{height:100%;margin:0;background:Canvas;color:GrayText}body{display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif}p{margin:0;padding:1rem;max-width:30rem;text-align:center}</style>
</head>
<body><p>${EMPTY_PAGE_STATUS}</p></body>
</html>
`;
