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

// ============ GOOGLE CALENDAR (service account) ============
const { google } = require('googleapis');
const GCAL_SA_FILE = process.env.GOOGLE_SA_KEYFILE ||
  '/home/openclaw/.openclaw/workspace/.credentials/google-service-account.json';
const GCAL_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'wyattjoeknepp@gmail.com';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function gcalClient() {
  try {
    const credentials = JSON.parse(fs.readFileSync(GCAL_SA_FILE, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    return google.calendar({ version: 'v3', auth });
  } catch { return null; }
}

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
app.get('/gcal/status', (req, res) => {
  const configured = !!gcalClient();
  res.json({ configured, connected: configured });
});

app.get('/gcal/events', async (req, res) => {
  const { timeMin, timeMax } = req.query;
  if (!timeMin || !timeMax) return res.status(400).json({ error: 'timeMin and timeMax required' });
  try {
    const cal = gcalClient();
    if (!cal) return res.status(409).json({ error: 'not connected' });
    const result = await cal.events.list({
      calendarId: GCAL_CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    res.json((result.data.items || [])
      .filter((e) => e.status !== 'cancelled')
      .map((e) => ({
        title: e.summary || '(no title)',
        start: e.start?.dateTime || null, // null => all-day
      })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '127.0.0.1', () => console.log(`Server running on port ${PORT}`));
