// Same-origin requests: relative paths work whether this is served by
// `vite dev` (proxied to the Express server, see vite.config.js) or by
// Express itself in production. No environment-specific config needed.
const TOKEN = 'password';
const AUTH = { 'x-token': TOKEN, 'Content-Type': 'application/json' };

function enc(s) {
  return encodeURIComponent(s);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...AUTH, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
}

export const api = {
  lists: () => apiFetch('/lists').then((r) => r.json()),
  get: (name) => apiFetch(`/list/${enc(name)}`).then((r) => r.text()),
  put: (name, content) =>
    apiFetch(`/list/${enc(name)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  delete: (name) => apiFetch(`/list/${enc(name)}`, { method: 'DELETE' }),
  getMeta: (name) =>
    apiFetch(`/meta/${enc(name)}`)
      .then((r) => r.json())
      .catch(() => ({})),
  putMeta: (name, data) => apiFetch(`/meta/${enc(name)}`, { method: 'PUT', body: JSON.stringify(data) }),
  // All lists' meta at once, keyed by list name — for the trends chart.
  getAllMeta: () => apiFetch('/meta').then((r) => r.json()),
};
