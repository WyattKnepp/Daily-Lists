import { useEffect, useRef, useState } from 'react';

const ICONS = {
  calendar: (
    <>
      <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 5.5h12M4 1v2.5M10 1v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  graph: (
    <>
      <path d="M1 11 4.5 6.5 7.3 9 13 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 2H13v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  recurring: (
    <path d="M2 6V5a2 2 0 0 1 2-2h7M9 1l2 2-2 2M12 8v1a2 2 0 0 1-2 2H3m2 2-2-2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  ),
  import: (
    <>
      <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 5.5v5M4.8 8.5 7 10.7l2.2-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  move: (
    <path d="M1 7h10.5M8 3.5 11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  trash: (
    <path
      d="M1 3.5h12M5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M11.5 3.5l-.8 8.5a1 1 0 0 1-1 .9H4.3a1 1 0 0 1-1-.9L2.5 3.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

function Icon({ name }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {ICONS[name]}
    </svg>
  );
}

export default function Header({
  activeList,
  dateLabel,
  hasActiveList,
  countsOpen,
  recurringOpen,
  onPrevDay,
  onNextDay,
  onGoToday,
  onImportCalendar,
  onToggleRecurring,
  onRefresh,
  onToggleCounts,
  onToggleCalendar,
  onOpenGraph,
  moveMode,
  onToggleMoveMode,
  onDeleteList,
  gcalFailures = [],
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  function pick(fn) {
    return () => {
      setMenuOpen(false);
      fn();
    };
  }

  return (
    <header>
      <div className="header-top">
        <div className="eyebrow">Daily Lists</div>
        <h1>{activeList ?? '—'}</h1>
        {dateLabel && (
          <div className="subtitle date-nav">
            <span>{dateLabel}</span>
            <button className="chevron-btn" aria-label="Previous day" onClick={onPrevDay}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 2 3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="chevron-btn" aria-label="Next day" onClick={onNextDay}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 2 8.5 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="header-actions">
        <button className="icon-btn" title="Refresh" onClick={onRefresh}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 7a6 6 0 1 0 1.1-3.5M1 2v2.5h2.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button className="icon-btn today-btn" title="Go to today's list" onClick={onGoToday}>
          Today
        </button>
        {hasActiveList && (
          <button
            className={`icon-btn${countsOpen ? ' active' : ''}`}
            title="Counts"
            onClick={onToggleCounts}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        )}

        <div className="menu-wrap" ref={menuRef}>
          <button
            className={`icon-btn${menuOpen ? ' active' : ''}`}
            title="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {gcalFailures.length > 0 && <span className="menu-alert-dot" aria-label="Calendar warnings" />}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.3" />
              <circle cx="7" cy="7" r="1.3" />
              <circle cx="7" cy="11.5" r="1.3" />
            </svg>
          </button>
          {menuOpen && (
            <div className="menu-dropdown" role="menu">
              {gcalFailures.length > 0 && (
                <div className="menu-warning">
                  <div className="menu-warning-title">Calendars not imported</div>
                  {gcalFailures.map((f) => (
                    <div key={f.id} className="menu-warning-item">
                      <span className="menu-warning-id">{f.id}</span>
                      <span>{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <button role="menuitem" onClick={pick(onToggleCalendar)}>
                <Icon name="calendar" /> Calendar
              </button>
              <button role="menuitem" onClick={pick(onOpenGraph)}>
                <Icon name="graph" /> Graph
              </button>
              <button role="menuitem" className={recurringOpen ? 'active' : ''} onClick={pick(onToggleRecurring)}>
                <Icon name="recurring" /> Recurring items
              </button>
              {hasActiveList && (
                <button role="menuitem" className={moveMode ? 'active' : ''} onClick={pick(onToggleMoveMode)}>
                  <Icon name="move" /> {moveMode ? 'End move mode' : 'Move to next day'}
                </button>
              )}
              {hasActiveList && (
                <button role="menuitem" onClick={pick(onImportCalendar)}>
                  <Icon name="import" /> Import Google Calendar
                </button>
              )}
              {hasActiveList && (
                <button role="menuitem" className="danger" onClick={pick(onDeleteList)}>
                  <Icon name="trash" /> Delete list
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
