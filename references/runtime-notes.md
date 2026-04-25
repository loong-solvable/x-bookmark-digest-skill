# Runtime Notes

## Real Browser Only

This skill is intentionally locked to the user's real Chromium browser session.

Do not switch to:

- Playwright
- OpenClaw managed browser
- copied browser profiles
- temporary isolated Chrome windows

If the real-browser bridge is unavailable, stop and tell the user what is missing.

## What The Exporter Actually Does

1. Uses the bundled `vendor/bb-browser/dist/daemon.js`
2. Talks to the browser extension loaded from `vendor/bb-browser/extension`
3. Lists tabs in the user's real browser
4. Reuses an existing `https://x.com/i/bookmarks` tab when possible
5. Otherwise opens one new bookmarks tab in that same browser
6. Scrolls, extracts visible posts, normalizes them, and writes local artifacts

No profile copy is created.

## Readiness Check

Use:

```bash
node scripts/export_x_bookmarks.mjs --check
```

Healthy output should show:

- `daemon_running: true`
- `extension_connected: true`

If `extension_connected` is `false`, load the unpacked extension from:

```text
vendor/bb-browser/extension
```

into the user's usual browser.

## Common Failures

### Port 19824 is busy

The bundled daemon uses `http://localhost:19824` by default.

Either free the port or intentionally move both:

- the daemon endpoint passed to `--daemon-url`
- the extension upstream URL in its options page

### Extension never connects

Likely causes:

- the unpacked extension was not loaded
- the user opened the wrong browser
- the browser is closed
- the extension options page points at the wrong daemon URL

### X redirects to login

The real browser is not logged into the intended X account.

Fix it in the same browser first, then rerun the exporter.

### Page loads but tweet count stays zero

Possible causes:

- X rendered an empty bookmarks state
- X changed markup
- a login / consent interstitial blocked the timeline

Check:

- `summary/session.json`
- `raw/rounds.json`

## Scaling Guidance

If the export contains hundreds of bookmarks, do not load `raw/bookmarks.json` directly into the model first.

Prefer:

1. `summary/stats.json`
2. `summary/seed.md`
3. `chunks/chunk-*.json`
