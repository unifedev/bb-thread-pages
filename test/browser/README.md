# Browser pass

What `npm run check` cannot see: a real browser against a running bb. Not part
of the unit suite; run it before a release that touches the shell, the kernel or
the serving pipeline. 33 checks (refresh A, embeds B, parts C), plus
`navcheck.mjs` (an embedded page navigates only on the reader's click) and
`csp-check.mjs` (what the document CSP does to `srcdoc` and URL frames; needs no
bb).

Needs: Playwright with its browsers (`npm i playwright && npx playwright install`
somewhere outside this repository), a running bb with this plugin, and **two
eligible sessions** — a host session that is *mid-turn* while the script runs
(the fast cadence is what is measured) and a second one to embed. The second
receives real messages, so use a throwaway session told to do nothing.

1. Copy `pages/t-*.html` and `pages/_tparts/` into the host session's page root,
   and `pages/embedded/*` into the embedded session's page root as `index.html`
   and `second.html`. Replace `HOST_SESSION_ID`, `EMBEDDED_SESSION_ID` and
   `THIRD_SESSION_ID` (any third eligible session; it is only read, and the
   script declines the grant) in them. Add a symbolic link
   `_tparts/zz-link.html -> /etc/hosts` to check that it is not included.
2. `TP_HOST_SESSION=thr_… TP_EMBEDDED_SESSION=thr_… ENGINE=chromium node live.mjs ABC`
   (`ENGINE` is `chromium`, `firefox` or `webkit`; the letters pick the groups).
3. `TP_HOST_SESSION=… TP_EMBEDDED_SESSION=… node navcheck.mjs`

The script turns `embedAnswerGrants` off and on again and revokes all grants
(`bb thread-page grants --revoke-all`). Playwright's `evaluate()` runs with a
simulated user gesture; `navcheck.mjs` therefore evaluates nothing while the
page loads.

Results of 20 September 2026 are in the specification repository,
`verify/EXPECTATIONS.md` §Fixture 09.
