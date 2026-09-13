'use client';

export interface SpkPickerOption {
  value: string;
  label: string;
}

export interface SpkPickerProps {
  label?: string;
  options: SpkPickerOption[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Button-based option picker. Native <select> popups ignore the dark
 * theme (OS-rendered white list), so options render as themed buttons
 * in a segmented row instead. Never regress to <select>.
 */
export function Picker({ label, options, value, onChange }: SpkPickerProps) {
  return (
    <>
      <style>{`
        .spk-picker { display: grid; gap: 6px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-picker-label { font-size: 0.78rem; font-weight: 600; color: var(--spk-text-2, #a1a1aa); }
        .spk-picker-row { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; width: fit-content;
          max-width: 100%; background: var(--spk-surface-2, #18181d);
          border: 1px solid var(--spk-line, #26262c); border-radius: var(--spk-radius-sm, 6px); }
        .spk-picker-opt { font-size: 0.8rem; font-weight: 600; padding: 0 12px; height: 30px;
          border-radius: 4px; cursor: pointer; background: transparent; border: none;
          color: var(--spk-text-2, #a1a1aa);
          transition: background 120ms ease, color 120ms ease; }
        .spk-picker-opt:hover { color: var(--spk-text, #fafafa); }
        .spk-picker-opt[data-on="true"] { background: var(--spk-surface, #111114);
          color: var(--spk-text, #fafafa); box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
        .spk-picker-opt:focus-visible { outline: none; box-shadow: var(--spk-ring); }
      `}</style>
      <div className="spk-picker">
        {label && <span className="spk-picker-label">{label}</span>}
        <div className="spk-picker-row" role="radiogroup" aria-label={label}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={opt.value === value}
              data-on={opt.value === value ? 'true' : 'false'}
              className="spk-picker-opt"
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
