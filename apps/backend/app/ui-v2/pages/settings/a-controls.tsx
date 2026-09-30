'use client';

/**
 * Small controls shared by the Appearance and Playback settings groups.
 */

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { Icon, type IconName } from '../../icons';
import { cn } from '../../primitives';
import s from './settings.module.css';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Custom leading glyph (takes precedence over `icon`). */
  glyph?: ReactNode;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Segmented single-choice control (a radio group styled like segmented tabs).
 * Selecting the current option is a no-op, matching a native select's change event.
 */
export function ChoiceGroup<T extends string>({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<ChoiceOption<T>>;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || options.length === 0) return;
    let nextIndex = -1;
    if (NEXT_KEYS.has(event.key)) nextIndex = (focusIndex + 1) % options.length;
    else if (PREVIOUS_KEYS.has(event.key)) nextIndex = (focusIndex - 1 + options.length) % options.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = options.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = options[nextIndex];
    if (next.value !== value) onValueChange(next.value);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(s.segmented, className)}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            className={s.segment}
            onClick={() => {
              if (!checked) onValueChange(option.value);
            }}
          >
            {option.glyph ?? (option.icon ? <Icon name={option.icon} size={14} /> : null)}
            <span className={s.segmentLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type StatusTone = 'muted' | 'error' | 'success';

/** One-line helper/status copy under a control; errors use the danger token. */
export function StatusText({
  children,
  tone = 'muted',
  live,
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  /** Announce changes politely (status messages that update after an action). */
  live?: boolean;
  className?: string;
}) {
  return (
    <p className={cn(s.status, className)} data-tone={tone} aria-live={live ? 'polite' : undefined}>
      {children}
    </p>
  );
}

/** Typed entries of a label map, for building options from the model's label records. */
export function labelOptions<T extends string>(labels: Record<T, string>): ChoiceOption<T>[] {
  return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
}
