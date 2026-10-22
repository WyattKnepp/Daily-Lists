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
  (recurring items), `google-credentials.json` (OAuth client, you supply),
  `google-token.json` (refresh token, written after authorizing).
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
- `GET /gcal/status` — `{configured, connected}`
- `GET /gcal/events?timeMin=ISO&timeMax=ISO` — primary-calendar events
  (`{title, start}`, `start` null for all-day)
- `GET /gcal/start?token=password` and `GET /gcal/callback` — OAuth flow.
  These sit *before* the auth middleware because browser redirects can't send
  `x-token`; `/gcal/start` checks `?token=` itself.

## Features

- **Prev/next day**: chevrons right of the date in the header; stepping to a
  day with no list creates it.
- **Recurring items**: managed in `RecurringPanel` (item + `su..sa` toggle
  buttons). Applied only when a *new* list is created (`seedFor` in
  `App.jsx`), never to existing lists.
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
- **Google Calendar**: read-only OAuth (`calendar.readonly`, primary
  calendar). Setup: create an OAuth "Web application" client, enable the
  Calendar API, add `http://localhost:3001/gcal/callback` as a redirect URI,
  save `{"client_id","client_secret"}` to `data/google-credentials.json`
  (or set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), then click the header
  import button to authorize. Google rejects plain-IP `http` redirects, so
  authorize locally and copy `data/google-token.json` to the droplet. New
  lists auto-import events once connected; the import button adds events not
  already on the list (matched by label).

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
