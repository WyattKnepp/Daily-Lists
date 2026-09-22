const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const TOKEN = 'password';
const LISTS_DIR = path.join(__dirname, 'lists');
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

fs.mkdirSync(LISTS_DIR, { recursive: true });

app.use(express.json());

// ============ STATIC — serve built React app ============
app.use(express.static(CLIENT_DIST));

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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
