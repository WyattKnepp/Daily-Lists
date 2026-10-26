const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT } = require('./helpers/server');

function setup(files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daily-lists-')), 'lists');
  fs.mkdirSync(dir);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

function migrate(dir, ...args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'migrate-counts.js'), ...args], {
    env: { ...process.env, LISTS_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

describe('cli: migrate-counts', () => {
  test('renames old single-letter count keys to the new names', () => {
    const dir = setup({ '1-1-26.json': '{"MM":1,"D":2,"A":3,"W":4,"P":5}' });
    const out = migrate(dir);
    assert.deepEqual(read(dir, '1-1-26.json'), { MM: 1, DO: 2, AL: 3, WD: 4, PA: 5 });
    assert.match(out, /Updated 1 of 1 meta file/);
  });

  test('dry run reports changes but writes nothing', () => {
    const body = '{"D":2}';
    const dir = setup({ '1-1-26.json': body });
    const out = migrate(dir, '--dry-run');
    assert.equal(fs.readFileSync(path.join(dir, '1-1-26.json'), 'utf8'), body);
    assert.match(out, /\[dry-run\] 1-1-26\.json/);
    assert.match(out, /Would update 1 of 1/);
  });

  test('is safe to run twice', () => {
    const dir = setup({ '1-1-26.json': '{"D":2}' });
    migrate(dir);
    const out = migrate(dir);
    assert.deepEqual(read(dir, '1-1-26.json'), { DO: 2 });
    assert.match(out, /Updated 0 of 1/);
  });

  test('keeps the new value when a file has both the old and new key', () => {
    const dir = setup({ '1-1-26.json': '{"D":2,"DO":9}' });
    migrate(dir);
    assert.deepEqual(read(dir, '1-1-26.json'), { DO: 9 });
  });

  test('skips invalid JSON files and leaves markdown lists alone', () => {
    const dir = setup({ 'bad.json': '{nope', '1-1-26.md': '- [ ] D' });
    const out = migrate(dir);
    assert.equal(fs.readFileSync(path.join(dir, 'bad.json'), 'utf8'), '{nope');
    assert.equal(fs.readFileSync(path.join(dir, '1-1-26.md'), 'utf8'), '- [ ] D');
    assert.match(out, /1 skipped as invalid JSON/);
  });

  test('exits cleanly when there is no lists folder', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daily-lists-')), 'missing');
    assert.match(migrate(dir), /nothing to migrate/);
  });
});
