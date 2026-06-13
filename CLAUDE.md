# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`Vores VM` — a static site showing the standings of a friendly World Cup sweepstake.
Each player is assigned **two nations**; the site ranks players by the combined stats of
their two teams, and also offers a full per-nation table. The whole UI is in **Danish**.

**Match results are edited via `admin.html` — an editable table of all matches — and
stored in a free Firebase Firestore database** (one document, `state/current`). The
**matches list is the source of truth**: `app.js` derives every team's standings from the
match rows (`teamStatsFrom`), so editing/deleting a row just recomputes the table. The
public board reads the document live via `onSnapshot`, so a save shows up in seconds with
no git/push. `data.json` is no longer the live source — it's the one-time **seed** and the
**offline/last-resort fallback** if Firestore can't be reached. Still no build step. The
only "auth" is a single shared Firebase Auth email/password account (`SHARED_EMAIL` in
`firebase-config.js`) that the editor signs into; the Firestore rules allow public reads
but require sign-in to write.

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

Core files: `index.html` (static shell), `styles.css`, `app.js` (board logic, ES module),
`data.json` (seed/fallback content). Match editing adds `admin.html` + `admin.js` (the
matches table) and `firebase-config.js` (shared Firebase wiring; SDK loaded from the
modular ESM CDN, so still no build step). `assets/flags/` holds 270+ bundled ISO-code SVGs
(offline); `assets/players/` holds photos + `placeholder.svg`.

**`data.json` defines the data shape and seeds Firestore; the live source of truth at
runtime is the Firestore `state/current` document.** Its shape:
- `teams`: map of `teamId → { name, code }` (the seed also carries per-team stat fields,
  but those are only the legacy fallback — see below). `name` is the Danish display name;
  `code` is the ISO flag filename in `assets/flags/<code>.svg` (e.g. England = `gb-eng`).
- `players`: `{ id, name, photo, teams: [twoTeamIds] }`. `photo` is a filename in
  `assets/players/` (missing photos fall back to the silhouette automatically).
- `matches`: `[{ id, date, a, aName, b, bName, ga, gb, ca, cb, ka, kb, ya, ra, yb, rb,
  played }]` — one row per match; the **whole group-stage program is pre-loaded** in
  `data.json`. `a`/`b` are rostered teamIds (or `""` for a non-rostered opponent, whose
  display name then lives in `aName`/`bName`); `ga`/`gb` goals, `ca`/`cb` corners
  (hjørnespark), `ka`/`kb` goal kicks (målspark), `y*`/`r*` cards, `date` for reference.
  Per-side stats sum into each team via `addSide`; columns are in `COLUMNS`/`TEAM_COLUMNS`.
  **`played`
  gates the standings: only `played: true` rows are counted** (`teamStatsFrom` skips
  fixtures), so upcoming matches sit in the table scoreless until played. This is the
  source of truth for all team standings.
- `fantasyWeights`, `title`, `subtitle`, `lastUpdated`.

**Everything derived is computed in `app.js`, never stored:** `teamStatsFrom()` rebuilds
each team's played/won/drawn/lost/goals/cards from the `matches` rows; then points, goal
difference, fantasy score, and all player totals follow. Only match scores are entered, so
nothing can drift. **Legacy fallback:** if `matches` is empty, `teamStatsFrom` trusts the
seed's stored per-team aggregates, so the board still works before the first save.

**`app.js` structure:**
- `COLUMNS` (player board) and `TEAM_COLUMNS` (nations table) are data-driven column
  configs (`{ key, label, full, dir, signed? }`). `TIEBREAK` (`points → goalDiff →
  goalsFor`) is the canonical standings order used everywhere.
- `boot()` live-subscribes to the Firestore `state/current` doc (`onSnapshot`); each
  snapshot calls `applyData()`, which runs `teamStatsFrom()` (derive team stats from
  `matches`), then builds `state.rows` (player aggregates via `aggregate()`), `state.teams`
  (flat team objects with derived `points`/`goalDiff`), and `state.teamOwner` (teamId →
  owning player name), then `render()`. If Firebase isn't configured, or the read fails, or
  the doc isn't seeded yet, it falls back to `loadFallback()` (bundled `data.json`).
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
- **Recording match results:** use the `admin.html` matches table, not hand-editing. The
  group program is already there as rows; to record a result, type the goals/cards on that
  row (which auto-ticks **Spillet**) and hit **Gem ændringer** (writes the whole `matches`
  array with `setDoc`). **Countries are locked:** once a side has a team it renders as
  read-only text (`sideCell` → `.locked`; the value is preserved via the row's `data-*-id`
  /`data-*-name`), so only an empty/new side is an editable field. There `nameToId` (in
  `admin.js`) matches the typed name back to a pool teamId, otherwise it's an outside
  opponent (free-text label that supplies goals-against but gets no stats). W/D/L and
  points are
  derived from the scores by `teamStatsFrom`. **First-time load:** if Firestore's `matches`
  is empty, the editor shows **"Indlæs hele kampprogrammet"** (`loadProgram`), which copies
  `data.json`'s `matches` into Firestore and zeroes the legacy stored aggregates. Knockout
  matches (unknown until results) are added later via **＋ Tilføj kamp**.
- **Fantasy is currently computed but hidden** (removed from display "for now"). To
  restore, re-add the `fantasy` entry to `COLUMNS` and the fantasy `tcell` in
  `renderDetail` — the score is still calculated.

## Deploy

GitHub Pages from a public repo named `vores-vm` (`.nojekyll` present). Live at
`https://<user>.github.io/vores-vm/`. There is no build step, so **every `git push` is a
deploy** — but only *code* changes need a push now. *Match results* go to Firestore and
appear live with no push. Firebase is a **one-time setup** (create project + Firestore +
Email/Password user, paste `firebaseConfig` into `firebase-config.js`, set the rules, then
"Importér data.json" once). See `README.md` (Danish) for the full Firebase + deploy steps.
