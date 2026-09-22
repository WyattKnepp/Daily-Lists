export default function Header({
  activeList,
  dateLabel,
  hasActiveList,
  countsOpen,
  calendarOpen,
  trendsOpen,
  onRefresh,
  onToggleCounts,
  onToggleCalendar,
  onToggleTrends,
  onDeleteList,
}) {
  return (
    <header>
      <div className="header-top">
        <div className="eyebrow">Daily Lists</div>
        <h1>{activeList ?? '—'}</h1>
        {dateLabel && <div className="subtitle">{dateLabel}</div>}
      </div>

      <div className="header-actions">
        <button
          className={`icon-btn${calendarOpen ? ' active' : ''}`}
          title="Pick a date"
          onClick={onToggleCalendar}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 5.5h12M4 1v2.5M10 1v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={`icon-btn${trendsOpen ? ' active' : ''}`}
          title="Trends"
          onClick={onToggleTrends}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 11 4.5 6.5 7.3 9 13 2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M9.5 2H13v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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
        {hasActiveList && (
          <button className="icon-btn danger" title="Delete list" onClick={onDeleteList}>
            <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
              <path
                d="M1 3.5h12M5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M11.5 3.5l-.8 8.5a1 1 0 0 1-1 .9H4.3a1 1 0 0 1-1-.9L2.5 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
