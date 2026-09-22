export const COUNT_CATEGORIES = ['MM', 'DO', 'AL', 'WD', 'PA'];

// Categorical palette, validated against this app's dark surface (#050f05)
// with scripts/validate_palette.js from the dataviz skill — fixed hue order,
// never reassigned or cycled.
export const COUNT_COLORS = {
  MM: '#3987e5', // blue
  DO: '#d95926', // orange
  AL: '#199e70', // aqua
  WD: '#c98500', // yellow
  PA: '#d55181', // magenta
};

export function emptyCounts() {
  return Object.fromEntries(COUNT_CATEGORIES.map((c) => [c, 0]));
}

export function parseMd(md) {
  let id = 0;
  return md
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => ({ id: ++id, checked: l[3] === 'x', label: l.slice(6) }));
}

export function toMd(items) {
  return items.map((i) => `- [${i.checked ? 'x' : ' '}] ${i.label}`).join('\n');
}

export function formatListName(date) {
  return `${date.getMonth() + 1}-${date.getDate()}-${String(date.getFullYear()).slice(2)}`;
}

export function todayKey() {
  return formatListName(new Date());
}

export function parseListDate(name) {
  const m = name.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (!m) return null;
  return new Date(2000 + parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Inclusive array of Date, one per calendar day, from start to end.
export function dateRangeArray(start, end) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function pickDefault(names) {
  const key = todayKey();
  if (names.includes(key)) return key;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dated = names
    .map((n) => ({ n, d: parseListDate(n) }))
    .filter((x) => x.d)
    .sort((a, b) => b.d - a.d);

  const past = dated.filter((x) => x.d <= today);
  if (past.length) return past[0].n;
  if (dated.length) return dated[dated.length - 1].n;
  return names[0];
}
