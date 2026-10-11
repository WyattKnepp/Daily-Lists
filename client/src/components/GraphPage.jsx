import { useMemo, useState } from 'react';
import { COUNT_CATEGORIES, COUNT_COLORS, addDays, dateRangeArray, formatListName, parseListDate } from '../utils';

const PRESETS = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
];

const CHART_W = 600;
const CHART_H = 220;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export default function GraphPage({ lists, metaByName, onBack }) {
  const [enabled, setEnabled] = useState(() => new Set(COUNT_CATEGORIES));
  const [preset, setPreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [hoverIndex, setHoverIndex] = useState(null);

  const datedLists = useMemo(
    () => lists.map((n) => ({ n, d: parseListDate(n) })).filter((x) => x.d),
    [lists],
  );

  const { start, end } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (preset === 'custom') {
      if (customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd) };
      return { start: addDays(today, -29), end: today };
    }
    if (preset === 'all') {
      if (datedLists.length === 0) return { start: addDays(today, -29), end: today };
      const times = datedLists.map((x) => x.d.getTime());
      return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) };
    }
    const found = PRESETS.find((p) => p.key === preset) || PRESETS[1];
    return { start: addDays(today, -(found.days - 1)), end: today };
  }, [preset, customStart, customEnd, datedLists]);

  const days = useMemo(() => dateRangeArray(start, end), [start, end]);

  const series = useMemo(() => {
    if (!metaByName) return null;
    return COUNT_CATEGORIES.filter((cat) => enabled.has(cat)).map((cat) => ({
      key: cat,
      color: COUNT_COLORS[cat],
      values: days.map((d) => {
        const meta = metaByName[formatListName(d)];
        return (meta && meta[cat]) || 0;
      }),
    }));
  }, [metaByName, days, enabled]);

  const maxVal = useMemo(() => {
    if (!series) return 1;
    return Math.max(1, ...series.flatMap((s) => s.values));
  }, [series]);

  function xAt(i) {
    return days.length <= 1 ? PAD_L : PAD_L + (i / (days.length - 1)) * PLOT_W;
  }
  function yAt(v) {
    return PAD_T + PLOT_H - (v / maxVal) * PLOT_H;
  }
  function pathFor(values) {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ');
  }

  function handlePointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || days.length === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    if (days.length === 1) { setHoverIndex(0); return; }
    const ratio = Math.min(1, Math.max(0, (px - PAD_L) / PLOT_W));
    setHoverIndex(Math.round(ratio * (days.length - 1)));
  }

  const yTicks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, arr) => arr.indexOf(v) === i);
  const tooltipLeftPct = hoverIndex === null ? 0 : Math.min(88, Math.max(12, (xAt(hoverIndex) / CHART_W) * 100));

  return (
    <div className="graph-page">
      <header className="graph-header">
        <button className="icon-btn" aria-label="Back" onClick={onBack}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2 3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1>Graph</h1>
      </header>

        <div className="trends-range-row">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`range-chip${preset === p.key ? ' active' : ''}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
          <button className={`range-chip${preset === 'all' ? ' active' : ''}`} onClick={() => setPreset('all')}>
            All
          </button>
          <button
            className={`range-chip${preset === 'custom' ? ' active' : ''}`}
            onClick={() => setPreset('custom')}
          >
            Custom
          </button>
        </div>

        {preset === 'custom' && (
          <div className="trends-custom-row">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span>to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        )}

        <div className="trends-chart-wrap">
          {!series ? (
            <div className="state-msg">Loading…</div>
          ) : (
            <>
              <svg
                className="trends-svg"
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverIndex(null)}
              >
                {yTicks.map((t) => (
                  <g key={t}>
                    <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yAt(t)} y2={yAt(t)} className="chart-grid" />
                    <text x={PAD_L - 6} y={yAt(t)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                      {t}
                    </text>
                  </g>
                ))}

                {hoverIndex !== null && (
                  <line
                    x1={xAt(hoverIndex)}
                    x2={xAt(hoverIndex)}
                    y1={PAD_T}
                    y2={CHART_H - PAD_B}
                    className="chart-crosshair"
                  />
                )}

                {series.map((s) => (
                  <path key={s.key} d={pathFor(s.values)} className="chart-line" stroke={s.color} fill="none" />
                ))}

                {series.map((s) => {
                  const lastIdx = s.values.length - 1;
                  return (
                    <circle
                      key={s.key}
                      cx={xAt(lastIdx)}
                      cy={yAt(s.values[lastIdx])}
                      r="4"
                      className="chart-end-dot"
                      fill={s.color}
                    />
                  );
                })}

                {hoverIndex !== null &&
                  series.map((s) => (
                    <circle
                      key={s.key}
                      cx={xAt(hoverIndex)}
                      cy={yAt(s.values[hoverIndex])}
                      r="4"
                      className="chart-hover-dot"
                      fill={s.color}
                    />
                  ))}
              </svg>

              {hoverIndex !== null && (
                <div className="trends-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
                  <div className="trends-tooltip-date">
                    {days[hoverIndex].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {series.map((s) => (
                    <div className="trends-tooltip-row" key={s.key}>
                      <span className="trends-tooltip-key" style={{ background: s.color }} />
                      <span className="trends-tooltip-val">{s.values[hoverIndex]}</span>
                      <span className="trends-tooltip-cat">{s.key}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="trends-legend">
          {COUNT_CATEGORIES.map((cat) => (
            <button
              className={`trends-legend-item legend-toggle${enabled.has(cat) ? ' on' : ''}`}
              key={cat}
              aria-pressed={enabled.has(cat)}
              onClick={() =>
                setEnabled((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  return next;
                })
              }
            >
              <span className="trends-legend-swatch" style={{ background: COUNT_COLORS[cat] }} />
              <span className="trends-legend-label">{cat}</span>
            </button>
          ))}
        </div>
    </div>
  );
}
