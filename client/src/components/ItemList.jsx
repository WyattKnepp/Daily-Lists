function ItemRow({ item, index, moveMode, onToggle, onMove, onDelete }) {
  // Moved items always show the arrow; in move mode unchecked ones do too.
  // Checked items stay inert in move mode.
  const showArrow = item.moved || (moveMode && !item.checked);
  function handleClick() {
    if (moveMode) {
      if (!item.checked) onMove(item.id);
    } else {
      onToggle(item.id);
    }
  }

  return (
    <div
      className={`item${item.checked ? ' checked' : ''}${item.moved ? ' moved' : ''}${moveMode && !item.checked ? ' movable' : ''}`}
      style={{ animationDelay: `${index * 20}ms` }}
      onClick={handleClick}
    >
      {showArrow ? (
        <div className="checkbox move-arrow" aria-label={item.moved ? 'Moved to next day' : 'Move to next day'}>
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5h9.5M7 1.5 10.5 5 7 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <div className="checkbox">
          <svg className="checkmark" width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5l3.5 3.5L11 1" stroke="#00ff41" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <span className="item-label">{item.label}</span>
      <button
        className="del-btn"
        aria-label="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function ItemList({ status, items, moveMode, onToggle, onMove, onDelete }) {
  if (status === 'loading') return <div className="state-msg">Loading…</div>;
  if (status === 'error') return <div className="state-msg">⚠️ Failed to load list</div>;
  if (status === 'no-api') return <div className="state-msg">⚠️ Could not reach API</div>;
  if (status === 'no-lists') {
    return (
      <div className="empty">
        <div className="empty-icon">📋</div>
        No lists yet.
        <br />
        Tap "+ new list" to create one.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">✓</div>
        Empty list.
        <br />
        Add something below.
      </div>
    );
  }

  return items.map((item, idx) => (
    <ItemRow
      key={item.id}
      item={item}
      index={idx}
      moveMode={moveMode}
      onToggle={onToggle}
      onMove={onMove}
      onDelete={onDelete}
    />
  ));
}
