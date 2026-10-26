// Starts the real server.js as a child process on a free port, pointed at a
// fresh temp dir so it never touches the real lists/ or data/.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TOKEN = 'password';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-lists-'));
  return {
    root,
    listsDir: path.join(root, 'lists'),
    dataDir: path.join(root, 'data'),
  };
}

// opts.dirs: reuse an existing temp root (for restart tests).
// opts.env: extra env vars.
async function startServer(opts = {}) {
  const dirs = opts.dirs || makeTempRoot();
  const port = await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    LISTS_DIR: dirs.listsDir,
    DATA_DIR: dirs.dataDir,
    // Never reach Google: point the key file at something that doesn't exist.
    GOOGLE_SA_KEYFILE: path.join(dirs.root, 'no-such-key.json'),
    GOOGLE_CALENDAR_ID: 'primary-test@example.com',
    ...opts.env,
  };
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      await fetch(base + '/lists');
      break;
    } catch {
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`server did not start within 10s:\n${output}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  function api(method, urlPath, body, headers = {}) {
    const init = { method, headers: { 'x-token': TOKEN, ...headers } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return fetch(base + urlPath, init);
  }

  async function stop() {
    if (child.exitCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    child.kill();
    await exited;
  }

  return { base, port, dirs, child, api, stop, output: () => output };
}

module.exports = { ROOT, TOKEN, startServer, makeTempRoot, freePort };
