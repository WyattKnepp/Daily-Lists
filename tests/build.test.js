const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT } = require('./helpers/server');

const CLIENT = path.join(ROOT, 'client');
const VITE = path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js');

describe('build: client', () => {
  test('the React app builds with vite', {
    skip: fs.existsSync(VITE) ? false : 'client/node_modules not installed (run npm run build once)',
    timeout: 60_000,
  }, () => {
    // Build into a temp dir so the real client/dist is left alone.
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-lists-dist-'));
    const r = spawnSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: CLIENT,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    assert.match(html, /<script type="module"[^>]+src="\/assets\/[^"]+\.js"/);
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
