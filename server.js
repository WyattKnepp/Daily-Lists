const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const TOKEN = 'password';
const LISTS_DIR = path.join(__dirname, 'lists');

app.use(cors());
app.use(express.json());

// ============ ROOT — serve checklist UI ============
app.get('/', (req, res) => {
  const overridePath = path.join(__dirname, 'index_main.html');
  const indexPath = fs.existsSync(overridePath) ? overridePath : path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Inject refresh button before delete button
  html = html.replace(
    '<button class="icon-btn danger" id="delete-list-btn" title="Delete list" style="display:none">',
    `<button class="icon-btn" id="refresh-btn" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7a6 6 0 1 0 1.1-3.5M1 2v2.5h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn danger" id="delete-list-btn" title="Delete list" style="display:none">`
  );

  // Wire up refresh button
  html = html.replace(
    'init();\n  </script>',
    `document.getElementById('refresh-btn').addEventListener('click', async () => {
      if (activeList) { await switchList(activeList); } else { await init(); }
    });
    init();
  </script>`
  );

  res.send(html);
});

app.use(express.static('public'));

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

app.get('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  if (!fs.existsSync(file)) return res.json({ D: 0, A: 0, W: 0, P: 0 });
  try { res.json(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { res.json({ D: 0, A: 0, W: 0, P: 0 }); }
});

app.put('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  const { D = 0, A = 0, W = 0, P = 0 } = req.body;
  fs.writeFileSync(file, JSON.stringify({ D, A, W, P }), 'utf8');
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
