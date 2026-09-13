'use client';

export interface SpkSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

/** Labeled toggle switch. */
export function Switch({ checked, onChange, label }: SpkSwitchProps) {
  return (
    <>
      <style>{`
        .spk-switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-switch-track { width: 38px; height: 22px; border-radius: var(--spk-radius-full, 9999px);
          background: var(--spk-surface-2, #18181d); border: 1px solid var(--spk-line, #26262c);
          position: relative; transition: background 150ms ease, border-color 150ms ease; flex: none; }
        .spk-switch-track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
          border-radius: var(--spk-radius-full, 9999px); background: var(--spk-text-2, #a1a1aa);
          transition: transform 150ms ease, background 150ms ease; }
        .spk-switch[data-on="true"] .spk-switch-track { background: var(--spk-accent, #8b93f8); border-color: transparent; }
        .spk-switch[data-on="true"] .spk-switch-track::after { transform: translateX(16px); background: var(--spk-accent-ink, #0b0c12); }
        .spk-switch-label { font-size: 0.85rem; font-weight: 600; color: var(--spk-text, #fafafa); }
        .spk-switch:focus-visible { outline: none; }
        .spk-switch:focus-visible .spk-switch-track { box-shadow: var(--spk-ring); }
      `}</style>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-on={checked ? 'true' : 'false'}
        className="spk-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="spk-switch-track" aria-hidden="true" />
        <span className="spk-switch-label">{label}</span>
      </button>
    </>
  );
}
