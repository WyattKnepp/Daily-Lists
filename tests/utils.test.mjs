import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_CATEGORIES, COUNT_COLORS, emptyCounts, parseMd, toMd, formatListName,
  todayKey, parseListDate, addDays, dateRangeArray, pickDefault, recurringItems, eventLabel,
  missingLabels,
} from '../client/src/utils.js';

describe('logic: markdown lists', () => {
  test('parses done, todo and moved items with sequential ids', () => {
    const items = parseMd('- [x] done\n- [ ] todo\n- [>] moved');
    assert.deepEqual(items, [
      { id: 1, checked: true, moved: false, label: 'done' },
      { id: 2, checked: false, moved: false, label: 'todo' },
      { id: 3, checked: false, moved: true, label: 'moved' },
    ]);
  });

  test('ignores headings, blank lines and malformed checkboxes', () => {
    const items = parseMd('# Monday\n\n- [x] real\n-[ ] no space\n- [?] odd\n  - [ ] indented\nplain text');
    assert.deepEqual(items.map((i) => i.label), ['real']);
  });

  test('keeps brackets and extra spaces inside labels', () => {
    const [item] = parseMd('- [ ] 9:00 AM [work]  standup');
    assert.equal(item.label, '9:00 AM [work]  standup');
  });

  test('round-trips items through toMd and parseMd unchanged', () => {
    const md = '- [ ] a\n- [x] b\n- [>] c';
    assert.equal(toMd(parseMd(md)), md);
  });

  test('writes a checked item as done even if it is also marked moved', () => {
    assert.equal(toMd([{ label: 'x', checked: true, moved: true }]), '- [x] x');
  });

  test('parses an empty file as an empty list', () => {
    assert.deepEqual(parseMd(''), []);
    assert.equal(toMd([]), '');
  });
});

describe('logic: list dates', () => {
  test('names a list M-D-YY without zero padding', () => {
    assert.equal(formatListName(new Date(2026, 0, 5)), '1-5-26');
    assert.equal(formatListName(new Date(2026, 11, 31)), '12-31-26');
  });

  test('todayKey matches today\'s date', () => {
    assert.equal(todayKey(), formatListName(new Date()));
  });

  test('parses a list name back to the same local date', () => {
    const d = parseListDate('9-22-26');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 8);
    assert.equal(d.getDate(), 22);
    assert.equal(formatListName(d), '9-22-26');
  });

  test('returns null for names that are not dates', () => {
    for (const n of ['groceries', '2026-09-22', '9-22-2026', '9-22-26.md', '']) {
      assert.equal(parseListDate(n), null, n);
    }
  });

  test('adds days across month and year boundaries without mutating the input', () => {
    const d = new Date(2026, 11, 31);
    assert.equal(formatListName(addDays(d, 1)), '1-1-27');
    assert.equal(formatListName(addDays(new Date(2026, 2, 1), -1)), '2-28-26');
    assert.equal(formatListName(d), '12-31-26');
  });

  test('adds a day across a daylight-saving change and lands on the next calendar day', () => {
    // US DST starts 2026-03-08; one calendar day, not 24 hours.
    assert.equal(formatListName(addDays(new Date(2026, 2, 7), 1)), '3-8-26');
    assert.equal(formatListName(addDays(new Date(2026, 2, 8), 1)), '3-9-26');
  });

  test('builds an inclusive day range, ignoring time of day', () => {
    const days = dateRangeArray(new Date(2026, 1, 27, 18), new Date(2026, 2, 2, 6));
    assert.deepEqual(days.map(formatListName), ['2-27-26', '2-28-26', '3-1-26', '3-2-26']);
    assert.ok(days.every((d) => d.getHours() === 0));
  });

  test('returns an empty range when the end is before the start', () => {
    assert.deepEqual(dateRangeArray(new Date(2026, 1, 2), new Date(2026, 1, 1)), []);
  });
});

describe('logic: picking the default list', () => {
  const today = new Date();
  const key = (n) => formatListName(addDays(today, n));

  test('picks today\'s list when it exists', () => {
    assert.equal(pickDefault([key(-3), key(0), key(2)]), key(0));
  });

  test('otherwise picks the most recent past list', () => {
    assert.equal(pickDefault([key(-10), key(-2), key(-5), key(3)]), key(-2));
  });

  test('picks the soonest future list when there are no past ones', () => {
    assert.equal(pickDefault([key(9), key(4), key(6)]), key(4));
  });

  test('falls back to the first name when none are dates', () => {
    assert.equal(pickDefault(['groceries', 'packing']), 'groceries');
    assert.equal(pickDefault([]), undefined);
  });
});

describe('logic: recurring items and events', () => {
  const recurring = [
    { id: 1, label: 'Gym', days: [1, 3, 5] },
    { id: 2, label: 'Laundry', days: [0] },
    { id: 3, label: 'Read', days: [0, 1, 2, 3, 4, 5, 6] },
  ];

  test('returns the labels due on a date\'s weekday, in saved order', () => {
    assert.deepEqual(recurringItems(recurring, new Date(2026, 9, 26)), ['Gym', 'Read']); // Monday
    assert.deepEqual(recurringItems(recurring, new Date(2026, 9, 25)), ['Laundry', 'Read']); // Sunday
    assert.deepEqual(recurringItems(recurring, new Date(2026, 9, 31)), ['Read']); // Saturday
  });

  test('labels an all-day event with just its title', () => {
    assert.equal(eventLabel({ title: 'Birthday', start: null }), 'Birthday');
  });

  test('prefixes a timed event with its local start time', () => {
    const start = new Date(2026, 9, 26, 9, 5).toISOString();
    assert.equal(eventLabel({ title: 'Dentist', start }).replace(/\s/g, ' '), '9:05 AM Dentist');
  });
});

describe('logic: count categories', () => {
  test('starts every category at zero', () => {
    assert.deepEqual(emptyCounts(), { MM: 0, DO: 0, AL: 0, WD: 0, PA: 0 });
  });

  test('has a color for every category', () => {
    assert.deepEqual(Object.keys(COUNT_COLORS).sort(), [...COUNT_CATEGORIES].sort());
  });
});

describe('logic: refresh merge', () => {
  // 10-27-26 is a Tuesday (2); 11-1-26 is the following Sunday (0).
  const tue = parseListDate('10-27-26');
  const gym = { id: 1, label: 'Gym', days: [2] };

  test('adds a recurring item created after the list existed when its weekday matches', () => {
    const list = parseMd('- [ ] existing');
    assert.deepEqual(missingLabels(list, [gym], [], tue), ['Gym']);
  });

  test('skips recurring items for other weekdays', () => {
    const recurring = [{ id: 1, label: 'Laundry', days: [0, 6] }, { id: 2, label: 'Read', days: [1, 3] }];
    assert.deepEqual(missingLabels([], recurring, [], tue), []);
  });

  test('does not duplicate a recurring item already on the list as todo, done or moved', () => {
    for (const mark of [' ', 'x', '>']) {
      assert.deepEqual(missingLabels(parseMd(`- [${mark}] Gym`), [gym], [], tue), [], `state [${mark}]`);
    }
  });

  test('requires an exact label match to count as already present', () => {
    assert.deepEqual(missingLabels(parseMd('- [ ] Gym class\n- [ ] gym'), [gym], [], tue), ['Gym']);
  });

  test('adds missing calendar events and skips ones already on the list in any state', () => {
    const list = parseMd('- [ ] 9:00 AM Dentist\n- [x] Birthday\n- [>] 2:00 PM Call');
    const events = ['9:00 AM Dentist', 'Birthday', '2:00 PM Call', '5:00 PM Dinner'];
    assert.deepEqual(missingLabels(list, [], events, tue), ['5:00 PM Dinner']);
  });

  test('adds an event that arrives from two calendars only once', () => {
    assert.deepEqual(missingLabels([], [], ['Standup', 'Standup'], tue), ['Standup']);
  });

  test('puts recurring items before events and adds a label shared by both once', () => {
    const recurring = [gym, { id: 2, label: 'Read', days: [2] }];
    assert.deepEqual(missingLabels([], recurring, ['Standup', 'Gym'], tue), ['Gym', 'Read', 'Standup']);
  });

  test('takes the weekday from the list name, not today, across a week boundary', () => {
    const sun = { id: 2, label: 'Plan week', days: [0] };
    const sat = { id: 3, label: 'Clean', days: [6] };
    assert.deepEqual(missingLabels([], [gym, sun, sat], [], parseListDate('11-1-26')), ['Plan week']);
    assert.deepEqual(missingLabels([], [gym, sun, sat], [], parseListDate('10-31-26')), ['Clean']);
    assert.deepEqual(missingLabels([], [gym, sun, sat], [], parseListDate('11-3-26')), ['Gym']);
  });

  test('adds only events to an undated list', () => {
    assert.deepEqual(missingLabels([], [{ id: 1, label: 'Gym', days: [0, 1, 2, 3, 4, 5, 6] }], ['Standup'], null), ['Standup']);
  });
});
