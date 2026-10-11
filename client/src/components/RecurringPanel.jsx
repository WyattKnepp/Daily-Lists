import { useState } from 'react';
import { DAY_LABELS } from '../utils';

export default function RecurringPanel({ open, items, onChange, onClose }) {
  const [draft, setDraft] = useState('');

  function add() {
    const label = draft.trim();
    if (!label) return;
    const id = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
    onChange([...items, { id, label, days: [] }]);
    setDraft('');
  }

  function toggleDay(id, day) {
    onChange(
      items.map((i) =>
        i.id === id
          ? { ...i, days: i.days.includes(day) ? i.days.filter((d) => d !== day) : [...i.days, day].sort() }
          : i,
      ),
    );
  }

  return (
    <>
      <div className={`sheet-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`bottom-sheet recurring-sheet${open ? ' open' : ''}`}>
        <div className="counts-sheet-handle" />
        <div className="counts-sheet-header">
          <span className="counts-sheet-title">Recurring</span>
          <button className="counts-sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="counts-sheet-body">
          {items.length === 0 && <div className="state-msg">No recurring items yet</div>}
          {items.map((item) => (
            <div className="recurring-row" key={item.id}>
              <div className="recurring-top">
                <span className="recurring-label">{item.label}</span>
                <button
                  className="del-btn"
                  aria-label="Remove"
                  onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                >
                  ×
                </button>
              </div>
              <div className="day-buttons">
                {DAY_LABELS.map((d, idx) => (
                  <button
                    key={d}
                    className={`day-btn${item.days.includes(idx) ? ' active' : ''}`}
                    onClick={() => toggleDay(item.id, idx)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="recurring-add">
          <input
            type="text"
            placeholder="New recurring item…"
            maxLength={120}
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="add-btn" disabled={!draft.trim()} onClick={add}>
            +
          </button>
        </div>
      </div>
    </>
  );
}
