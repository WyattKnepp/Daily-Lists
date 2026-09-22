import { useMemo, useState } from 'react';
import { formatListName, parseListDate, todayKey } from '../utils';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarPanel({ lists, activeList, onSelectDate, onCreateCustom }) {
  const startDate = parseListDate(activeList || '') || new Date();
  const [viewYear, setViewYear] = useState(startDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(startDate.getMonth());

  const listSet = useMemo(() => new Set(lists), [lists]);
  const otherLists = useMemo(() => lists.filter((n) => !parseListDate(n)), [lists]);

  const todayName = todayKey();

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array(daysInMonth).keys()].map((v) =>
    v === null ? null : v + 1,
  );

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <div className="calendar-panel">
      <div className="calendar-nav">
        <button className="cal-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
        <span className="cal-month-label">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="cal-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} className="cal-cell empty" />;
          const name = formatListName(new Date(viewYear, viewMonth, day));
          const classes = ['cal-cell'];
          if (listSet.has(name)) classes.push('has-list');
          if (name === activeList) classes.push('active');
          if (name === todayName) classes.push('today');
          return (
            <button key={i} className={classes.join(' ')} onClick={() => onSelectDate(name)}>
              {day}
            </button>
          );
        })}
      </div>

      {otherLists.length > 0 && (
        <div className="calendar-other">
          <div className="calendar-other-label">Other lists</div>
          <div className="calendar-other-chips">
            {otherLists.map((name) => (
              <button
                key={name}
                className={`tab${name === activeList ? ' active' : ''}`}
                onClick={() => onSelectDate(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="tab-new calendar-custom-btn" onClick={onCreateCustom}>
        + custom name
      </button>
    </div>
  );
}
