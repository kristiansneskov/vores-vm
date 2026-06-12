# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`Vores VM` — a self-contained, read-only static site showing the standings of a friendly
World Cup sweepstake. Each player is assigned **two nations**; the site ranks players by
the combined stats of their two teams, and also offers a full per-nation table. No
database, no build step, no backend, no auth. The whole UI is in **Danish**.

## Commands

There is **no build, lint, or test tooling** (no `package.json`, no framework).

- **Run locally** (required — the page uses `fetch`, so `file://` won't work):
  ```
  python3 -m http.server 8000      # then open http://localhost:8000
  ```
- **Syntax-check the JS** after edits: `node --check app.js`
- **Verify ranking/aggregation logic** without a browser: run a small `node -e '...'`
  script that `require('./data.json')` and mirrors the aggregation in `app.js`
  (sum a player's two teams → points = won*3+drawn, goalDiff, sort by TIEBREAK).

## Architecture

Four files do everything: `index.html` (static shell), `styles.css`, `app.js` (all
logic, an ES module), and `data.json` (all content). `assets/flags/` holds 270+ bundled
ISO-code SVGs (offline); `assets/players/` holds photos + `placeholder.svg`.

**`data.json` is the single source of truth and the only file edited day-to-day.**
- `teams`: map of `teamId → { name, code, played, won, drawn, lost, goalsFor,
  goalsAgainst, yellow, red }`. `name` is the Danish display name; `code` is the ISO
  alpha-2 flag filename in `assets/flags/<code>.svg` (e.g. England = `gb-eng`).
- `players`: `{ id, name, photo, teams: [twoTeamIds] }`. `photo` is a filename in
  `assets/players/` (missing photos fall back to the silhouette automatically).
- `fantasyWeights`, `title`, `subtitle`, `lastUpdated`.

**Everything derived is computed in `app.js`, never stored:** points, goal difference,
fantasy score, and all player totals. Only raw per-team numbers are hand-entered, so the
data can't drift out of sync. Adding a new stat = add a field to each team in
`data.json` + **one line** in the relevant column-config array.

**`app.js` structure:**
- `COLUMNS` (player board) and `TEAM_COLUMNS` (nations table) are data-driven column
  configs (`{ key, label, full, dir, signed? }`). `TIEBREAK` (`points → goalDiff →
  goalsFor`) is the canonical standings order used everywhere.
- `boot()` fetches `data.json`, builds `state.rows` (player aggregates via
  `aggregate()`), `state.teams` (flat team objects with derived `points`/`goalDiff`),
  and `state.teamOwner` (teamId → owning player name).
- **Hash routing** (`currentRoute`/`render`) drives three views: the player board
  (default / `#`), the nations table (`#/lande`, `renderTeams`), and player detail
  (`#/player/<id>`, `renderDetail`). `viewTabs()` is the Spillere/Lande toggle.
- Shared helpers to reuse: `flagImg`, `photoImg`, `esc` (HTML-escape — always use for
  data values), `fmt`/`signClass` (signed/coloured values), `compare`/`compareTeams`.

**Mobile-first rendering:** the player and nations tables share the `.scoreboard` CSS,
which renders as **stacked cards by default** and only becomes a real `<table>` at
≥721px. Because of this, every stat `<td>` must carry a `data-label` attribute (used as
the card-row label on phones). The nations table adds `.static` to disable the
clickable-row affordances.

## Conventions

- **Danish everywhere user-visible** (column labels, buttons, country names). Keep code
  identifiers/`data.json` keys in English. `<html lang="da">`.
- **Recording match results:** only enter stats for teams **held by a player**;
  opponents not in the roster are ignored (they don't get a `teams` entry). A result
  updates the held team's raw fields (e.g. a 2–0 win → `played+1, won+1, goalsFor+2`).
- **Fantasy is currently computed but hidden** (removed from display "for now"). To
  restore, re-add the `fantasy` entry to `COLUMNS` and the fantasy `tcell` in
  `renderDetail` — the score is still calculated.

## Deploy

GitHub Pages from a public repo named `vores-vm` (`.nojekyll` present). Live at
`https://<user>.github.io/vores-vm/`. There is no build step, so **every `git push` is a
deploy**; updating stats = edit `data.json`, commit, push. See `README.md` (Danish) for
the full deploy + daily-update steps.
