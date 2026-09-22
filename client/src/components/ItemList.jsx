function ItemRow({ item, index, onToggle, onDelete }) {
  return (
    <div
      className={`item${item.checked ? ' checked' : ''}`}
      style={{ animationDelay: `${index * 20}ms` }}
      onClick={() => onToggle(item.id)}
    >
      <div className="checkbox">
        <svg className="checkmark" width="12" height="10" viewBox="0 0 12 10" fill="none">
          <path d="M1 5l3.5 3.5L11 1" stroke="#00ff41" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
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

export default function ItemList({ status, items, onToggle, onDelete }) {
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
    <ItemRow key={item.id} item={item} index={idx} onToggle={onToggle} onDelete={onDelete} />
  ));
}
