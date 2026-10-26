const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, ROOT } = require('./helpers/server');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

describe('api: startup', () => {
  test('creates the lists and data folders on start', () => {
    assert.ok(fs.statSync(srv.dirs.listsDir).isDirectory());
    assert.ok(fs.statSync(srv.dirs.dataDir).isDirectory());
  });

  test('serves the built React app at / without a token', {
    skip: fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))
      ? false
      : 'client/dist is not built (run npm run build)',
  }, async () => {
    const res = await fetch(srv.base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /<div id="root">/);
  });
});

describe('api: auth', () => {
  test('rejects a request with no token', async () => {
    const res = await fetch(srv.base + '/lists');
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Unauthorized' });
  });

  test('rejects a request with the wrong token', async () => {
    const res = await fetch(srv.base + '/recurring', { headers: { 'x-token': 'nope' } });
    assert.equal(res.status, 401);
  });
});

describe('api: lists', () => {
  test('saves a list and reads back the same markdown', async () => {
    const md = '- [ ] buy milk\n- [x] walk dog\n- [>] call mom';
    const put = await srv.api('PUT', '/list/1-2-26', { content: md });
    assert.equal(put.status, 200);
    assert.deepEqual(await put.json(), { ok: true });
    const get = await srv.api('GET', '/list/1-2-26');
    assert.equal(get.status, 200);
    assert.equal(await get.text(), md);
    assert.equal(fs.readFileSync(path.join(srv.dirs.listsDir, '1-2-26.md'), 'utf8'), md);
  });

  test('lists saved list names without the .md extension or meta files', async () => {
    await srv.api('PUT', '/list/3-4-26', { content: '- [ ] a' });
    await srv.api('PUT', '/meta/3-4-26', { MM: 1 });
    const names = await (await srv.api('GET', '/lists')).json();
    assert.ok(names.includes('3-4-26'));
    assert.equal(names.filter((n) => n === '3-4-26').length, 1);
    assert.ok(names.every((n) => !n.endsWith('.md') && !n.endsWith('.json')));
  });

  test('overwrites an existing list on a second save', async () => {
    await srv.api('PUT', '/list/5-6-26', { content: '- [ ] first' });
    await srv.api('PUT', '/list/5-6-26', { content: '- [x] second' });
    assert.equal(await (await srv.api('GET', '/list/5-6-26')).text(), '- [x] second');
  });

  test('returns 404 for a list that does not exist', async () => {
    const res = await srv.api('GET', '/list/12-31-99');
    assert.equal(res.status, 404);
  });

  test('deletes a list, after which it is gone', async () => {
    await srv.api('PUT', '/list/7-8-26', { content: '- [ ] x' });
    const del = await srv.api('DELETE', '/list/7-8-26');
    assert.equal(del.status, 200);
    assert.equal((await srv.api('GET', '/list/7-8-26')).status, 404);
    assert.ok(!(await (await srv.api('GET', '/lists')).json()).includes('7-8-26'));
  });

  test('returns 404 when deleting a list that does not exist', async () => {
    assert.equal((await srv.api('DELETE', '/list/9-9-99')).status, 404);
  });

  test('rejects a save with no content field', {
    todo: 'BUG: PUT /list/:name with no "content" throws inside writeFileSync and returns a 500 HTML stack trace instead of a 400',
  }, async () => {
    const res = await srv.api('PUT', '/list/10-10-26', {});
    assert.equal(res.status, 400);
  });

  test('does not write files outside the lists folder', {
    todo: 'BUG: list names are not validated, so PUT /list/..%2Fescape writes escape.md outside lists/ (path traversal)',
  }, async () => {
    await srv.api('PUT', '/list/..%2Fescape', { content: 'oops' });
    assert.ok(!fs.existsSync(path.join(srv.dirs.root, 'escape.md')));
  });
});

describe('api: meta counters', () => {
  test('returns an empty object for a list with no counters yet', async () => {
    const res = await srv.api('GET', '/meta/2-2-22');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {});
  });

  test('saves counters and reads them back', async () => {
    const counts = { MM: 2, DO: 0, AL: 5, WD: 1, PA: 3 };
    assert.equal((await srv.api('PUT', '/meta/4-4-26', counts)).status, 200);
    assert.deepEqual(await (await srv.api('GET', '/meta/4-4-26')).json(), counts);
  });

  test('returns every list\'s counters keyed by list name', async () => {
    await srv.api('PUT', '/meta/6-1-26', { MM: 1 });
    await srv.api('PUT', '/meta/6-2-26', { DO: 7 });
    const all = await (await srv.api('GET', '/meta')).json();
    assert.deepEqual(all['6-1-26'], { MM: 1 });
    assert.deepEqual(all['6-2-26'], { DO: 7 });
  });

  test('skips a corrupt meta file instead of failing', async () => {
    fs.writeFileSync(path.join(srv.dirs.listsDir, '6-3-26.json'), '{not json');
    const all = await srv.api('GET', '/meta');
    assert.equal(all.status, 200);
    assert.ok(!('6-3-26' in (await all.json())));
    assert.deepEqual(await (await srv.api('GET', '/meta/6-3-26')).json(), {});
  });
});

describe('api: recurring items', () => {
  test('starts with no recurring items', async () => {
    assert.deepEqual(await (await srv.api('GET', '/recurring')).json(), []);
  });

  test('saves recurring items and reads them back', async () => {
    const items = [
      { id: 1, label: 'Gym', days: [1, 3, 5] },
      { id: 2, label: 'Laundry', days: [0] },
    ];
    assert.equal((await srv.api('PUT', '/recurring', items)).status, 200);
    assert.deepEqual(await (await srv.api('GET', '/recurring')).json(), items);
  });

  test('rejects recurring items that are not an array', async () => {
    const res = await srv.api('PUT', '/recurring', { label: 'Gym' });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Expected an array' });
  });
});

describe('api: google calendar (offline)', () => {
  test('reports not configured when the service account key is missing', async () => {
    const res = await srv.api('GET', '/gcal/status');
    assert.deepEqual(await res.json(), { configured: false, connected: false, failures: [] });
  });

  test('requires timeMin and timeMax for events', async () => {
    const res = await srv.api('GET', '/gcal/events?timeMin=2026-01-01T00:00:00Z');
    assert.equal(res.status, 400);
  });

  test('returns 409 for events when no service account is configured', async () => {
    const res = await srv.api('GET', '/gcal/events?timeMin=2026-01-01T00:00:00Z&timeMax=2026-01-02T00:00:00Z');
    assert.equal(res.status, 409);
  });

  test('warns in status when calendars.json is invalid, and clears once fixed', async () => {
    const file = path.join(srv.dirs.dataDir, 'calendars.json');
    try {
      fs.writeFileSync(file, '{"calendars": "not-an-array"}');
      let { failures } = await (await srv.api('GET', '/gcal/status')).json();
      assert.equal(failures.length, 1);
      assert.equal(failures[0].id, 'calendars.json');
      assert.match(failures[0].reason, /^calendars\.json is invalid: /);

      fs.writeFileSync(file, '["a@group.calendar.google.com", 42]');
      ({ failures } = await (await srv.api('GET', '/gcal/status')).json());
      assert.match(failures[0].reason, /every entry must be a string/);

      fs.writeFileSync(file, '["a@group.calendar.google.com"]');
      ({ failures } = await (await srv.api('GET', '/gcal/status')).json());
      assert.deepEqual(failures, []);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  test('fetching real calendar events', { skip: 'needs the Google service account key and network' }, () => {});
});
