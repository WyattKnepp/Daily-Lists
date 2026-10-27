# Daily-Lists

A personal daily-checklist web app: an Express API backend plus a React
frontend built with Vite.

## Architecture

- `server.js` — Express server on port `3001`. Serves the built React app
  (`client/dist/`) as static files and exposes a small REST API.
- `client/` — the React frontend, its own npm project (Vite + React 19, no
  router, no state library — plain `useState`/`useEffect`, one file per
  component).
  - `client/src/App.jsx` — top-level state and orchestration.
  - `client/src/api.js` — fetch wrapper. Requests use **relative paths**
    (`/lists`, `/list/:name`, …), not an absolute URL — see Hosting below.
  - `client/src/utils.js` — markdown parse/serialize + date helpers
    (`todayKey`, `pickDefault`) shared with the backend's file-naming
    convention.
  - `client/src/components/` — `Header` (date + prev/next-day chevrons;
    quick buttons Refresh / Today / Counts; a ⋮ overflow menu holding
    Calendar, Graph, Recurring items, Move to next day, Import Google
    Calendar, Delete list), `CalendarPanel`, `ProgressBar`, `ItemList`,
    `CountsPanel`, `RecurringPanel` (bottom sheet), `GraphPage` (full page,
    replaces the old `TrendsPanel` sheet), `AddRow`, `Toast`.
  - Navigation is a `graphOpen` boolean in `App.jsx` (no router): when true
    the app renders `GraphPage` instead of the list view.
- `data/` — gitignored, created on server start. `recurring.json`
  (recurring items), `calendars.json` (optional extra Google calendar IDs,
  you write it by hand — see Google Calendar below).
- `lists/` — one markdown file per checklist (e.g. `9-22-26.md`), lines like
  `- [x] done item` / `- [ ] todo item` / `- [>] moved item` (sent to the
  next day via move mode; neither done nor todo, excluded from progress).
  Parsed into `{id, label, checked, moved}` by `parseMd`/`toMd`.
  Gitignored — personal data, never committed. Created automatically on
  server start if missing.
- Per-list metadata (`lists/<name>.json`) stores the counters shown in the
  counts panel and charted on the graph page. The category set/order lives
  in one place, `client/src/utils.js` (`COUNT_CATEGORIES`, currently
  `MM, DO, AL, WD, PA`) — the backend is category-agnostic, it just
  reads/writes whatever object the client sends, so adding or renaming a
  category is a frontend-only change (see `migrate-counts.js` below for
  renaming values already on disk).

## API

All routes except static files require header `x-token: password`
(hardcoded in `server.js` and `client/src/api.js`, no HTTPS, no per-user
auth — this is a single-shared-secret personal tool, not meant to be
exposed publicly).

- `GET /lists` — list names
- `GET /list/:name` / `PUT /list/:name` / `DELETE /list/:name` — markdown body
- `GET /meta/:name` / `PUT /meta/:name` — one list's counters, `{cat: n, ...}`
- `GET /meta` — every list's counters at once, keyed by list name; used by
  the trends chart so it doesn't issue one request per day in range
- `GET/PUT /recurring` — recurring items, `[{id, label, days: [0..6]}]`
  (`days` follow `Date.getDay()`, 0 = Sunday)
- `GET /gcal/status` — `{configured, connected, failures: [{id, reason}]}`;
  `failures` lists extra calendars that failed on the latest events fetch (or
  one `calendars.json` entry if that file is invalid) — drives the ⋮ red dot
- `GET /gcal/events?timeMin=ISO&timeMax=ISO` — events from the primary
  calendar plus every calendar in `data/calendars.json`, merged and sorted
  (all-day first, then by start); `{title, start}`, `start` null for all-day.
  A failing extra calendar is skipped (logged, recorded in `failures`); only a
  primary failure fails the request (500)
- The client still has a leftover `window.open('/gcal/start…')` in
  `importCalendar` from the old OAuth flow; that route no longer exists.

## Features

- **Prev/next day**: chevrons right of the date in the header; stepping to a
  day with no list creates it.
- **Recurring items**: managed in `RecurringPanel` (item + `su..sa` toggle
  buttons). Applied when a *new* list is created (`seedFor` in `App.jsx`).
  On existing lists, the header's **Refresh** button reloads the list, then
  appends (unchecked, at the bottom) *that list's* weekday's recurring items,
  then that day's Google Calendar events (same range/labels as the import),
  skipping any label already on it in any state (`[ ]`/`[x]`/`[>]`, exact
  match), and saves once. The merge is `missingLabels` in `utils.js` (also
  used by Import Google Calendar). No toast on success; a failed reload, save,
  recurring fetch or calendar fetch toasts. Google not configured = events
  skipped silently; configured but failing = recurring items still added +
  error toast. Recurring items are refetched on each Refresh. Deleted
  recurring items *and* deleted/renamed events come back on Refresh (no
  tombstones). Refresh waits behind `moveQueue`.
  - Recurring edits are saved through a serial queue (`recurringSave` in
    `App.jsx`) and Refresh waits for it before `GET /recurring`. Root cause
    of the old "new recurring item not added on Refresh" bug: saves were
    fire-and-forget, so on a slow connection Refresh read `recurring.json`
    before the new item/day toggle landed, added nothing, and then
    overwrote the panel's state with the stale copy (the next edit would
    re-save it, erasing the day). Saves could also land out of order.
- **Move mode** (⋮ → Move to next day; `moveMode` in `App.jsx`): unchecked
  items show an arrow instead of a checkbox, and `AddRow` is replaced by a
  yellow "End move mode" button. Tapping an arrow appends the item (unchecked,
  duplicates allowed) to the day *after the viewed list*, creating that list via
  `seedFor` if missing, and marks the original `[>]` (yellow outline/text).
  Tapping a moved item in move mode undoes it: it removes the last unchecked
  same-label copy from the next day (if any) and clears the marker. Writes go
  next day first, then the current list; if the second write fails, the first
  is rolled back. Moves are queued (`moveQueue`) so rapid taps don't race.
  Outside move mode, moved items are inert (can't be checked). Manual only:
  no automatic carry-over.
- **Graph page**: full page; legend chips toggle which `COUNT_CATEGORIES`
  are plotted.
- **Google Calendar**: read-only, via a **service account**
  (`calendar.readonly`). Key file at `GOOGLE_SA_KEYFILE` (default
  `/home/openclaw/.openclaw/workspace/.credentials/google-service-account.json`);
  the primary calendar is `GOOGLE_CALENDAR_ID` (default
  `wyattjoeknepp@gmail.com`), which must be shared with the service account's
  `client_email`. New lists auto-import events; Refresh (see Recurring items
  above) and the ⋮ → Import Google Calendar button add events whose label
  isn't already on the list (an event on two calendars is added once).
  - **Extra calendars**: `data/calendars.json`, a JSON array of calendar ID
    strings (`{"calendars": [...]}` is also accepted, but the array is
    canonical):
    ```json
    ["abc123@group.calendar.google.com", "family0123@group.calendar.google.com"]
    ```
    Primary is always included; listing `"primary"` or the primary ID again
    is de-duplicated. Missing file = primary only, no warning. Re-read on
    every fetch, so edits apply without a restart. Events look identical
    regardless of source calendar (no label/color).
  - **Finding a calendar ID**: Google Calendar on the web → hover the calendar
    in the left sidebar → ⋮ → **Settings and sharing** → scroll to
    **Integrate calendar** → copy **Calendar ID** (usually
    `...@group.calendar.google.com`). In the same settings page, under
    **Share with specific people**, add the service account's `client_email`
    (from the key file) — otherwise that calendar fails with "no access".
  - `data/` isn't synced by git: **create `data/calendars.json` on the
    droplet too**.
  - **Red-dot warning**: if any extra calendar fails (not found, no access,
    network error…) the server logs it, still imports the rest, and keeps
    the failures in memory (`lastCalendarFailures` in `server.js`).
    `/gcal/status` returns them; the client fetches it on load and after every
    events fetch, shows a red dot on the header ⋮ button, and lists each
    failing ID + reason at the top of the menu. It reflects the latest fetch:
    it clears once the calendar works again, and immediately once the ID is
    removed from `calendars.json` (status filters to IDs still configured).
    An invalid `calendars.json` (bad JSON / wrong shape) shows as a
    "calendars.json is invalid: …" warning while primary still imports.
    No manual dismiss. Failures reset on server restart until the next fetch.

## Running it

**Dev** (hot reload, two processes):

```
node server.js          # API on :3001
cd client && npm run dev  # Vite dev server, proxies /lists,/list,/meta,/recurring,/gcal to :3001
```

Open the Vite dev URL it prints (usually `http://localhost:5173`).

**Production** (single process, what the droplet runs):

```
npm run build   # builds client/dist via the client's own npm install + vite build
npm start        # node server.js, serves client/dist + the API on :3001
```

Open `http://<host>:3001/`.

**Env overrides** (all optional, defaults = the behavior above): `PORT`
(3001), `HOST` (`127.0.0.1`), `LISTS_DIR` (`./lists`, also honored by
`migrate-counts.js`), `DATA_DIR` (`./data`). They exist so tests can run the
real server against a temp dir on a free port.

## Tests

`node:test` suites in `tests/` (see `.claude/skills/test-report/SKILL.md`):

```
make -C /home/wyatt/Programs/Claude_Code_Pipeline test PROJECT=Daily-Lists
```

Writes `test-report.testreport` at the repo root. `tests/helpers/server.js`
spawns `server.js` on a free port with temp `LISTS_DIR`/`DATA_DIR` and a
nonexistent `GOOGLE_SA_KEYFILE`, so no test touches real data or Google.
Covers the API, restart persistence, `client/src/utils.js` logic,
`migrate-counts.js`, and a vite build into a temp dir. Known bugs are kept as
`todo` tests (unvalidated list names allow path traversal; `PUT /list/:name`
with no `content` returns a 500).

## Hosting — this is now the same everywhere

Previously the frontend had the droplet's IP hardcoded as an absolute API
URL, so it always talked to the droplet no matter where the page was
served from. That's fixed: `client/src/api.js` now uses relative paths, so
the frontend always calls whatever origin served it.

- Locally: `node server.js` serves both the app and the API on
  `localhost:3001` — fully self-contained, uses your local `lists/` folder.
- On the droplet: same server, same code, just running on the droplet's
  `lists/` folder instead. No config differences, no per-environment edits.
- In `vite dev` mode specifically, the frontend is served by Vite's own dev
  server on a different port, so `vite.config.js` proxies `/lists`,
  `/list`, `/meta`, `/recurring`, and `/gcal` to `http://localhost:3001` — that's the one place
  the backend's location is still named, and only for local development.

**How the droplet keeps the server running (systemd/pm2/tmux/cron) is not
captured anywhere in this repo** — it's droplet-side config. Check the
droplet directly; update this section once confirmed. Whatever process
manager is used there should run `npm run build` (or `cd client && npm
install && npm run build`) once after pulling changes, then `npm start`.

## Migrating count category names on existing data

Category names/keys live only in `lists/<name>.json` files and in
`client/src/utils.js` — there's no database migration system. When
`COUNT_CATEGORIES` is renamed (as it was once already: `D→DO`, `A→AL`,
`W→WD`, `P→PA`), any `lists/*.json` already on disk from before the rename
still has the old keys and needs a one-time fixup. `migrate-counts.js` at
the repo root does this:

```
npm run migrate:counts             # apply the rename
npm run migrate:counts -- --dry-run  # preview only, writes nothing
```

It's idempotent (already-migrated files are left alone) and only touches
`lists/*.json`. Run it once on the droplet after deploying a category
rename, before anyone opens the trends chart — otherwise old data reads as
zero under the new names. The rename map is hardcoded at the top of the
script (currently the one historical rename); update it if you rename
categories again.

## Notes

- The old static `public/index.html` / `index_main.html` frontend (with a
  fragile string-patch injecting a refresh button into raw HTML at request
  time) has been replaced entirely by the React app in `client/`.
- `cors` was dropped as a dependency — frontend and API are now same-origin
  in both dev (via the Vite proxy) and production, so no CORS headers are
  needed.
- Trends chart colors are a fixed categorical palette validated against this
  app's dark surface with the `dataviz` skill's `validate_palette.js`
  (`client/src/utils.js`, `COUNT_COLORS`) — keep the hue order fixed if you
  add/reorder categories; re-validate rather than eyeballing new hex values.
