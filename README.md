# X Bookmark Digest

Turn a messy X/Twitter bookmark pile into a local, readable digest.

This repo is a self-contained `macOS` skill for Codex / Claude / OpenClaw. It exports a logged-in user's X bookmarks from their real Chromium browser session, saves structured local artifacts, and then lets the agent produce:

- a categorized digest
- a bookmark index
- a reading queue
- high-signal summaries instead of a giant unsorted bookmark list

## What Problem It Solves

A common pattern on X is:

1. see a good post
2. throw it into bookmarks
3. never clean it up
4. later need it again, but the bookmark list is a mess

This skill is built for exactly that problem.

## Current Status

- `macOS only`
- tested with real logged-in Chromium browser state
- no external `opencli`
- no external `bb-browser`
- no external `sqlite3` CLI
- no `npm install` required

The skill vendors its own bookmark extractor and its own SQLite reader.

## Requirements

- `node >= 18`
- one of:
  - Chrome
  - Arc
  - Brave
  - Edge
  - Chromium
- that browser must already be logged into X
- network access to X

On first use, macOS may show a one-time Keychain prompt for the browser's Safe Storage entry. That is only used to decrypt the local X cookies needed for bookmark export.

## How It Works

The bundled exporter:

1. finds `auth_token` and `ct0` from the user's real browser session
2. calls X's Bookmarks GraphQL API directly
3. saves normalized bookmark data under `runs/<timestamp>/`

Then the skill workflow continues from those local artifacts and writes the final reports.

## Recommended Usage

Use this repo as a skill inside Codex / Claude / OpenClaw.

The intended end-to-end result is not just raw export files. The task is only complete when these two files exist:

```text
runs/<timestamp>/report/bookmark-digest.md
runs/<timestamp>/report/bookmark-index.md
```

## Quick Start

From the repo root:

```bash
npm run check
npm run export
```

If the browser auto-detection picks the wrong profile:

```bash
node scripts/export_x_bookmarks.mjs --browser chrome --profile Default
```

If you prefer not to use Keychain-based cookie discovery, pass cookies manually:

```bash
node scripts/export_x_bookmarks.mjs \
  --auth-token "$X_AUTH_TOKEN" \
  --ct0 "$X_CT0"
```

## Skill Mode vs Script Mode

These are different:

- `script mode`
  - runs `scripts/export_x_bookmarks.mjs`
  - exports bookmarks into local artifacts
  - good for checking auth and data extraction
- `skill mode`
  - runs inside Codex / Claude / OpenClaw as a skill
  - exports bookmarks
  - reads the local artifacts
  - writes the final digest and bookmark index

If you only run the script from shell, you should expect export artifacts first, not a fully written digest.

## Output Layout

Each run creates a new folder:

```text
runs/<timestamp>/
├── raw/
│   ├── bookmarks.json
│   ├── bookmarks.jsonl
│   └── rounds.json
├── index/
│   └── bookmarks.csv
├── chunks/
│   └── chunk-001.json ...
├── summary/
│   ├── stats.json
│   ├── seed.md
│   └── session.json
└── report/
    ├── bookmark-digest.md
    └── bookmark-index.md
```

## What The Final Result Looks Like

The final digest should tell the user:

- what their bookmark library is really about
- the main topic buckets
- why each bucket exists
- which posts are worth reading first
- repeated authors / domains / themes
- what is actionable now
- what should be archived as reference

The bookmark index should group items by category and include:

- short title
- one-line summary
- author / handle
- original X link

## Privacy

- everything runs locally
- raw bookmark data stays on the user's machine
- this skill does not upload bookmark data to third-party services

## Known Boundary

This repo currently guarantees the `macOS` path only.

Windows and Linux are not yet packaged to the same self-contained standard.
