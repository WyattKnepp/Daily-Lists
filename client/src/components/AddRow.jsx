export default function AddRow({ value, onChange, onSubmit, disabled }) {
  return (
    <div className="add-row">
      <input
        type="text"
        placeholder="Add an item…"
        maxLength={120}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
      />
      <button className="add-btn" disabled={disabled || !value.trim()} onClick={onSubmit}>
        +
      </button>
    </div>
  );
}
