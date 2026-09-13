'use client';

import type { InputHTMLAttributes } from 'react';

export interface SpkTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Labelled field with a whisper-quiet border and a hint/error line. */
export function TextField({ label, hint, error, id, ...rest }: SpkTextFieldProps) {
  const fieldId = id ?? `spk-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <>
      <style>{`
        .spk-field { display: grid; gap: 6px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-field-label { font-size: 0.78rem; font-weight: 600; color: var(--spk-text-2, #a1a1aa); }
        .spk-field-input { background: var(--spk-bg, #09090b); border: 1px solid var(--spk-line, #26262c);
          border-radius: var(--spk-radius-sm, 6px); color: var(--spk-text, #fafafa);
          font-size: 0.875rem; height: 38px; padding: 0 12px; width: 100%; box-sizing: border-box; }
        .spk-field-input::placeholder { color: var(--spk-text-3, #71717a); }
        .spk-field-input:focus { outline: none; border-color: var(--spk-accent, #fafafa); box-shadow: var(--spk-ring); }
        .spk-field-input[aria-invalid="true"] { border-color: #e0655f; }
        .spk-field-note { font-size: 0.75rem; color: var(--spk-text-3, #71717a); }
        .spk-field-note[data-error="true"] { color: #e89893; }
      `}</style>
      <label className="spk-field" htmlFor={fieldId}>
        <span className="spk-field-label">{label}</span>
        <input id={fieldId} className="spk-field-input" aria-invalid={error ? true : undefined} {...rest} />
        {(error ?? hint) && (
          <span className="spk-field-note" data-error={error ? 'true' : undefined}>
            {error ?? hint}
          </span>
        )}
      </label>
    </>
  );
}
