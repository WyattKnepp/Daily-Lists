#!/usr/bin/env node
// One-time migration: renames the old single-letter count keys to the new
// two-letter ones in every lists/*.json meta file. Safe to re-run — files
// already on the new names are left untouched.
//
// Usage:
//   node migrate-counts.js            apply the rename
//   node migrate-counts.js --dry-run  show what would change, write nothing

const fs = require('fs');
const path = require('path');

const LISTS_DIR = path.join(__dirname, 'lists');
const RENAME_MAP = { D: 'DO', A: 'AL', W: 'WD', P: 'PA' };
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(LISTS_DIR)) {
  console.log('No lists/ directory found — nothing to migrate.');
  process.exit(0);
}

const files = fs.readdirSync(LISTS_DIR).filter((f) => f.endsWith('.json'));
let changed = 0;
let skippedInvalid = 0;

for (const file of files) {
  const filePath = path.join(LISTS_DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`Skipping ${file}: invalid JSON (${e.message})`);
    skippedInvalid++;
    continue;
  }

  const oldKeys = Object.keys(RENAME_MAP).filter((k) => k in data);
  if (oldKeys.length === 0) continue;

  const next = { ...data };
  for (const oldKey of oldKeys) {
    const newKey = RENAME_MAP[oldKey];
    if (!(newKey in next)) next[newKey] = next[oldKey];
    delete next[oldKey];
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}${file}: ${JSON.stringify(data)} -> ${JSON.stringify(next)}`);
  if (!dryRun) fs.writeFileSync(filePath, JSON.stringify(next), 'utf8');
  changed++;
}

console.log(
  `\n${dryRun ? 'Would update' : 'Updated'} ${changed} of ${files.length} meta file(s)` +
    (skippedInvalid ? ` (${skippedInvalid} skipped as invalid JSON)` : '') +
    '.',
);
