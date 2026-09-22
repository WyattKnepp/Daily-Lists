import { COUNT_CATEGORIES } from '../utils';

export default function CountsPanel({ open, counts, onAdjust, onClose }) {
  return (
    <>
      <div className={`sheet-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`bottom-sheet counts-sheet${open ? ' open' : ''}`}>
        <div className="counts-sheet-handle" />
        <div className="counts-sheet-header">
          <span className="counts-sheet-title">Counts</span>
          <button className="counts-sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="counts-sheet-body">
          {COUNT_CATEGORIES.map((cat) => (
            <div className="count-row" key={cat}>
              <span className="count-row-label">{cat}</span>
              <div className="count-controls">
                <button className="count-adj dec" onClick={() => onAdjust(cat, -1)}>
                  −
                </button>
                <span className={`count-val${counts[cat] > 0 ? ' nonzero' : ''}`}>{counts[cat]}</span>
                <button className="count-adj inc" onClick={() => onAdjust(cat, 1)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
