export default function ProgressBar({ done, total }) {
  if (total === 0) return null;
  const pct = total ? (done / total) * 100 : 0;

  return (
    <div className="progress-wrap">
      <div className="progress-row">
        <span className="progress-label">PROGRESS</span>
        <span className="progress-count">
          {done} / {total}
        </span>
      </div>
      <div className="bar-bg">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
