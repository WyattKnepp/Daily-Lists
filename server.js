const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const TOKEN = 'password';
const LISTS_DIR = path.join(__dirname, 'lists');
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

const DATA_DIR = path.join(__dirname, 'data');

fs.mkdirSync(LISTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());

// ============ STATIC — serve built React app ============
app.use(express.static(CLIENT_DIST));

// ============ GOOGLE CALENDAR (read-only OAuth) ============
// Setup: create an OAuth "Web application" client in Google Cloud Console,
// enable the Calendar API, add http://localhost:3001/gcal/callback as a
// redirect URI, and save {"client_id": "...", "client_secret": "..."} to
// data/google-credentials.json (or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
// The granted refresh token is stored in data/google-token.json.
const GCAL_CREDS_FILE = path.join(DATA_DIR, 'google-credentials.json');
const GCAL_TOKEN_FILE = path.join(DATA_DIR, 'google-token.json');
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function gcalCreds() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET };
  }
  const c = readJson(GCAL_CREDS_FILE, null);
  const web = c && (c.web || c.installed || c);
  return web && web.client_id && web.client_secret ? web : null;
}

function gcalRedirect(req) {
  return `${req.protocol}://${req.get('host')}/gcal/callback`;
}

async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || 'token request failed');
  return data;
}

async function gcalAccessToken() {
  const creds = gcalCreds();
  const tok = readJson(GCAL_TOKEN_FILE, null);
  if (!creds || !tok || !tok.refresh_token) return null;
  if (tok.access_token && tok.expires_at && tok.expires_at > Date.now() + 60000) return tok.access_token;
  const fresh = await googleToken({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token',
  });
  const next = { ...tok, access_token: fresh.access_token, expires_at: Date.now() + fresh.expires_in * 1000 };
  fs.writeFileSync(GCAL_TOKEN_FILE, JSON.stringify(next), 'utf8');
  return next.access_token;
}

// Browser redirects can't send the x-token header, so the start/callback
// routes sit before the auth middleware; the start route checks ?token= itself.
app.get('/gcal/start', (req, res) => {
  if (req.query.token !== TOKEN) return res.status(401).send('Unauthorized');
  const creds = gcalCreds();
  if (!creds) return res.status(400).send('Missing data/google-credentials.json (see server.js)');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: gcalRedirect(req),
    response_type: 'code',
    scope: GCAL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  }).toString();
  res.redirect(url.toString());
});

app.get('/gcal/callback', async (req, res) => {
  const creds = gcalCreds();
  if (!creds || !req.query.code) return res.status(400).send('Authorization failed');
  try {
    const t = await googleToken({
      code: req.query.code,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      redirect_uri: gcalRedirect(req),
      grant_type: 'authorization_code',
    });
    const prev = readJson(GCAL_TOKEN_FILE, {});
    fs.writeFileSync(GCAL_TOKEN_FILE, JSON.stringify({
      refresh_token: t.refresh_token || prev.refresh_token,
      access_token: t.access_token,
      expires_at: Date.now() + t.expires_in * 1000,
    }), 'utf8');
    res.send('Google Calendar connected. You can close this tab and hit Import again.');
  } catch (e) {
    res.status(500).send('Authorization failed: ' + e.message);
  }
});

// ============ AUTH ============
app.use((req, res, next) => {
  const token = req.headers['x-token'];
  if (token !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ============ CHECKLIST ROUTES ============
app.get('/lists', (req, res) => {
  const files = fs.readdirSync(LISTS_DIR).filter(f => f.endsWith('.md'));
  res.json(files.map(f => f.replace('.md', '')));
});

app.get('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.send(fs.readFileSync(file, 'utf8'));
});

app.put('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  fs.writeFileSync(file, req.body.content, 'utf8');
  res.json({ ok: true });
});

app.delete('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

// All meta files at once, keyed by list name — used to build the trends chart
// without one request per date.
app.get('/meta', (req, res) => {
  const files = fs.readdirSync(LISTS_DIR).filter(f => f.endsWith('.json'));
  const result = {};
  for (const f of files) {
    try { result[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(LISTS_DIR, f), 'utf8')); }
    catch { /* skip unreadable/corrupt meta file */ }
  }
  res.json(result);
});

app.get('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  if (!fs.existsSync(file)) return res.json({});
  try { res.json(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { res.json({}); }
});

app.put('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  fs.writeFileSync(file, JSON.stringify(req.body), 'utf8');
  res.json({ ok: true });
});

// ============ RECURRING ITEMS ============
// [{ id, label, days: [0..6] }] — days follow Date.getDay() (0 = Sunday).
const RECURRING_FILE = path.join(DATA_DIR, 'recurring.json');

app.get('/recurring', (req, res) => {
  res.json(readJson(RECURRING_FILE, []));
});

app.put('/recurring', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array' });
  fs.writeFileSync(RECURRING_FILE, JSON.stringify(req.body), 'utf8');
  res.json({ ok: true });
});

// ============ CALENDAR EVENTS ============
// GET /gcal/status, GET /gcal/events?timeMin=ISO&timeMax=ISO
app.get('/gcal/status', async (req, res) => {
  res.json({ configured: !!gcalCreds(), connected: !!readJson(GCAL_TOKEN_FILE, null)?.refresh_token });
});

app.get('/gcal/events', async (req, res) => {
  const { timeMin, timeMax } = req.query;
  if (!timeMin || !timeMax) return res.status(400).json({ error: 'timeMin and timeMax required' });
  try {
    const access = await gcalAccessToken();
    if (!access) return res.status(409).json({ error: 'not connected' });
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.search = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
    }).toString();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || 'Google API error' });
    res.json((data.items || [])
      .filter((e) => e.status !== 'cancelled')
      .map((e) => ({
        title: e.summary || '(no title)',
        start: e.start?.dateTime || null, // null => all-day
      })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
