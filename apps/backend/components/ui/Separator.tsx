'use client';

/** Hairline rule for cards, menus, and stacked sections. */
export function Separator() {
  return (
    <>
      <style>{`
        .spk-sep { border: none; border-top: 1px solid var(--spk-line, #26262c); margin: 4px 0; }
      `}</style>
      <hr className="spk-sep" />
    </>
  );
}
