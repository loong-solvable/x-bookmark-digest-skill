# Runtime Notes

## Scope Boundary

This skill is a bookmark raw-data collector, not an X action bot.

Do not mix it into:

- `opencli twitter timeline`
- `opencli twitter like`
- `opencli twitter reply`
- `bird`
- Playwright browser automation

Those are separate automation workflows. This skill only extracts bookmarks and prepares local artifacts for later summarization.

## What The Exporter Actually Does

1. Resolves `auth_token` and `ct0` from one of these sources:
   - `--auth-token` and `--ct0`
   - `X_AUTH_TOKEN` and `X_CT0`
   - `--cookie-header` or `X_COOKIE_HEADER`
   - the user's real macOS Chromium profile
2. Resolves the current Bookmarks GraphQL `queryId`
3. Calls X's bookmarks API directly
4. Normalizes the response into bookmark rows
5. Writes local artifacts under `runs/<timestamp>/`

No profile copy is created.
No automation browser or extension is required.
The SQLite reader is bundled inside the skill via vendored `sql.js`, so macOS users do not need an external `sqlite3` CLI.

## Readiness Check

Use:

```bash
node scripts/export_x_bookmarks.mjs --check
```

Healthy output should show:

- `mode: "embedded-mini-opencli"`
- `ready: true`
- a usable `auth_source`

If `ready` is `false`, the check output should also show which browser / profile was probed.

## Common Failures

### Automatic cookie discovery finds the wrong profile

Pass:

```bash
--browser chrome --profile Default
```

or another explicit browser/profile pair.

### macOS prompts for Keychain access

This is expected when the exporter decrypts Chromium cookies for the first time.

The exporter only needs the browser's Safe Storage entry so it can decrypt `auth_token` and `ct0`.

If the user does not want that prompt, use manual cookies instead:

```bash
--auth-token <value> --ct0 <value>
```

### GraphQL returns 401 or 403

Usually the browser login state is stale.

Fix it in that same browser, then rerun the exporter.

### TLS certificate verification fails

If this machine has a local certificate-chain issue, rerun with:

```bash
--insecure
```

Only use that when you know the failure is local TLS validation rather than a network attack.

### GraphQL shape changes or query id expires

Check:

- `summary/session.json`
- `raw/rounds.json`

## Scaling Guidance

If the export contains hundreds of bookmarks, do not load `raw/bookmarks.json` directly into the model first.

Prefer:

1. `summary/stats.json`
2. `summary/seed.md`
3. `chunks/chunk-*.json`
