'use client';

/* eslint-disable @next/next/no-img-element -- avatars use arbitrary remote URLs. */

/**
 * SPICE UI v2 primitives — small, accessible, shadcn-style building blocks.
 * Every surface of the v2 interface composes these instead of ad-hoc styles.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon, type IconName } from './icons';
import s from './primitives.module.css';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/* ── Portal ─────────────────────────────────────────────────── */

/** The v2 root provides a portal node *inside* the themed tree so tokens apply. */
export const PortalContext = createContext<HTMLElement | null>(null);

export function Portal({ children }: { children: ReactNode }) {
  const node = useContext(PortalContext);
  if (!node) return <>{children}</>;
  return createPortal(children, node);
}

/* ── Hooks ──────────────────────────────────────────────────── */

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Phone-sized layout: bottom navigation, sheets instead of side panels. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement | null) {
  if (!root) return [] as HTMLElement[];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('data-focus-skip') && element.getClientRects().length > 0,
  );
}

/** Focus the first focusable child on mount, trap Tab, and restore focus on unmount. */
function useModalFocus(panelRef: RefObject<HTMLElement | null>, initialFocusRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = initialFocusRef?.current ?? focusableWithin(panel)[0] ?? panel;
    target?.focus({ preventScroll: true });
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function trapTabKey(event: ReactKeyboardEvent<HTMLElement>, panel: HTMLElement | null) {
  if (event.key !== 'Tab' || !panel) return;
  const items = focusableWithin(panel);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

/**
 * Positions a fixed floating element next to an anchor, flipping to the other
 * side when it would overflow, and keeps it attached while scrolling/resizing.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  open: boolean,
  { side = 'bottom', align = 'start', offset = 6, matchWidth = false }: { side?: Side; align?: Align; offset?: number; matchWidth?: boolean } = {},
) {
  const [style, setStyle] = useState<CSSProperties>({ top: -9999, left: -9999 });
  const [measured, setMeasured] = useState(false);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    let top = 0;
    let left = 0;
    const width = matchWidth ? a.width : f.width;

    if (side === 'bottom' || side === 'top') {
      const below = a.bottom + offset;
      const above = a.top - offset - f.height;
      const fitsBelow = below + f.height <= vh - pad;
      const fitsAbove = above >= pad;
      top = side === 'bottom' ? (fitsBelow || !fitsAbove ? below : above) : (fitsAbove || !fitsBelow ? above : below);
      if (align === 'start') left = a.left;
      else if (align === 'end') left = a.right - width;
      else left = a.left + a.width / 2 - width / 2;
    } else {
      const right = a.right + offset;
      const leftSide = a.left - offset - width;
      const fitsRight = right + width <= vw - pad;
      const fitsLeft = leftSide >= pad;
      left = side === 'right' ? (fitsRight || !fitsLeft ? right : leftSide) : (fitsLeft || !fitsRight ? leftSide : right);
      if (align === 'start') top = a.top;
      else if (align === 'end') top = a.bottom - f.height;
      else top = a.top + a.height / 2 - f.height / 2;
    }

    left = Math.max(pad, Math.min(left, vw - width - pad));
    top = Math.max(pad, Math.min(top, vh - f.height - pad));
    setStyle({ top, left, ...(matchWidth ? { width: a.width } : {}) });
    setMeasured(true);
  }, [align, anchorRef, floatingRef, matchWidth, offset, side]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (floatingRef.current) observer?.observe(floatingRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  }, [open, update, floatingRef]);

  return { style, measured };
}

/** Calls `onDismiss` for pointer presses outside every given element. */
export function useDismiss(
  open: boolean,
  refs: Array<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      dismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ── Button ─────────────────────────────────────────────────── */

export type ButtonVariant = 'default' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  /** Renders the accent color for toggled-on controls (e.g. shuffle). */
  active?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  active,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 16;
  return (
    <button
      type={type}
      className={cn(s.button, s[`button-${variant}`], size !== 'md' && s[`button-${size}`], block && s['button-block'], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-active={active ? 'true' : undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" size={iconSize} className={s.buttonSpinner} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'iconRight' | 'children' | 'size'> {
  icon: IconName;
  /** Required accessible name; also used as the tooltip. */
  label: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  filled?: boolean;
  iconSize?: number;
  /** Optional count bubble (notifications). */
  badge?: ReactNode;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  filled,
  iconSize,
  badge,
  active,
  className,
  loading,
  disabled,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  const resolvedIconSize = iconSize ?? (size === 'lg' ? 20 : size === 'xs' ? 14 : size === 'sm' ? 16 : 18);
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(s.button, s['button-icon'], s[`button-${variant}`], size !== 'md' && s[`button-${size}`], className)}
      data-active={active ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" size={resolvedIconSize} className={s.buttonSpinner} />
      ) : (
        <Icon name={icon} size={resolvedIconSize} filled={filled} />
      )}
      {badge !== undefined && badge !== null && badge !== false ? <span className={s.dotBadge}>{badge}</span> : null}
    </button>
  );
}

export function ButtonGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.buttonGroup, className)}>{children}</div>;
}

/* ── Form controls ──────────────────────────────────────────── */

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  icon?: IconName;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  wrapperClassName?: string;
}

export function Input({ icon, trailing, size = 'md', invalid, className, wrapperClassName, ...rest }: InputProps) {
  return (
    <div className={cn(s.inputWrap, wrapperClassName)}>
      {icon ? <Icon name={icon} size={16} className={s.inputIcon} /> : null}
      <input
        className={cn(
          s.input,
          size !== 'md' && s[`input-${size}`],
          icon && s.inputWithIcon,
          trailing ? s.inputWithTrailing : null,
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {trailing ? <div className={s.inputTrailing}>{trailing}</div> : null}
    </div>
  );
}

export function Textarea({ className, invalid, ...rest }: ComponentPropsWithRef<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(s.textarea, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Label({ className, ...rest }: ComponentPropsWithRef<'label'>) {
  return <label className={cn(s.label, className)} {...rest} />;
}

export function Field({
  label,
  htmlFor,
  description,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(s.field, className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {description && !error ? <div className={s.fieldDescription}>{description}</div> : null}
      {error ? (
        <div className={s.fieldError} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  size = 'md',
  disabled,
  className,
  wrapperClassName,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  /** Accessible name when no visible <Label htmlFor> exists. */
  label?: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={cn(s.inputWrap, wrapperClassName)}>
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(s.select, size !== 'md' && s[`input-${size}`], className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} className={s.selectChevron} />
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name when the switch has no associated visible label. */
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn(s.switch, className)}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className={s.switchThumb} />
    </button>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className={s.checkLabel}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        className={s.checkbox}
        onClick={() => onCheckedChange(!checked)}
      >
        {checked ? <Icon name="check" size={12} strokeWidth={3} /> : null}
      </button>
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

export interface SliderProps extends Omit<ComponentPropsWithRef<'input'>, 'onChange' | 'value' | 'type' | 'size'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Fires when the user releases the thumb (pointer or key). */
  onValueCommit?: (value: number) => void;
  label: string;
  valueText?: string;
  /** Always tint the filled part with the accent (default tints on hover). */
  accent?: boolean;
  /** Always show the thumb (default shows on hover/focus). */
  showThumb?: boolean;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  onValueCommit,
  label,
  valueText,
  accent,
  showThumb,
  className,
  style,
  ...rest
}: SliderProps) {
  const span = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const commit = (event: { currentTarget: HTMLInputElement }) => onValueCommit?.(Number(event.currentTarget.value));
  return (
    <input
      type="range"
      className={cn(s.slider, accent && s['slider-accent'], showThumb && s['slider-thumb'], className)}
      style={{ ...style, ['--sx-slider-pct' as string]: `${pct}%` } as CSSProperties}
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : min}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(event) => onValueChange(Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      {...rest}
    />
  );
}

/* ── Tabs ───────────────────────────────────────────────────── */

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  count?: number | string;
  disabled?: boolean;
}

export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  variant = 'segmented',
  size = 'md',
  fullWidth,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<TabItem<T>>;
  variant?: 'segmented' | 'underline' | 'pills';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const enabled = items.filter((item) => !item.disabled);
    const currentIndex = enabled.findIndex((item) => item.value === value);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabled.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = enabled.length - 1;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    const button = listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`);
    button?.focus();
  };
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(s.tabs, s[`tabs-${variant}`], size === 'sm' && s['tabs-sm'], fullWidth && s['tabs-full'], className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-value={item.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={s.tab}
            onClick={() => onValueChange(item.value)}
          >
            {item.icon ? <Icon name={item.icon} size={14} /> : null}
            {item.label}
            {item.count !== undefined ? <span className={s.tabCount}>{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────────── */

/** Vertical rhythm helper. Pages use gap 40 between sections, cards 16. */
export function Stack({
  gap = 16,
  children,
  className,
  as: Component = 'div',
}: {
  gap?: number;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'ul' | 'ol';
}) {
  return (
    <Component className={cn(s.stack, className)} style={{ gap }}>
      {children}
    </Component>
  );
}

/** Horizontal cluster that wraps (toolbars, chip rows). */
export function Inline({
  gap = 8,
  children,
  className,
  justify,
  wrap = true,
}: {
  gap?: number;
  children: ReactNode;
  className?: string;
  justify?: CSSProperties['justifyContent'];
  wrap?: boolean;
}) {
  return (
    <div className={cn(s.row, className)} style={{ gap, justifyContent: justify, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      {children}
    </div>
  );
}

/* ── Display ────────────────────────────────────────────────── */

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  variant = 'secondary',
  icon,
  children,
  className,
  title,
}: {
  variant?: BadgeVariant;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn(s.badge, s[`badge-${variant}`], className)} title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  flat,
  interactive,
  onClick,
  id,
  style,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      id={id}
      style={style}
      className={cn(s.card, flat && s['card-flat'], interactive && s['card-interactive'], className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(s.cardHeader, className)}>
      <div className={s.cardHeaderText}>
        <h3 className={s.cardTitle}>{title}</h3>
        {description ? <p className={s.cardDescription}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.cardContent, className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.cardFooter, className)}>{children}</div>;
}

export function Separator({ vertical, className }: { vertical?: boolean; className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn(s.separator, vertical ? s['separator-v'] : s['separator-h'], className)}
    />
  );
}

export function Avatar({
  src,
  name,
  gradient,
  size = 32,
  square,
  className,
}: {
  src?: string | null;
  name: string;
  /** Profile gradient used behind the initial when there is no image. */
  gradient?: string;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(src) && !failed;
  return (
    <span
      className={cn(s.avatar, square && s['avatar-square'], className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)), background: showImage ? undefined : gradient }}
      aria-hidden="true"
    >
      {showImage ? <img src={src ?? undefined} alt="" onError={() => setFailed(true)} draggable={false} /> : initial}
    </span>
  );
}

export function Skeleton({ width, height = 16, radius, className }: { width?: number | string; height?: number | string; radius?: number | string; className?: string }) {
  return <div className={cn(s.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function Spinner({ size = 16, label = 'Loading', className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn(s.row, className)}>
      <Icon name="loader" size={size} className={s.spinner} />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={s.srOnly}>{children}</span>;
}

export function EmptyState({
  icon = 'music',
  title,
  description,
  action,
  plain,
  className,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  plain?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(s.emptyState, plain && s['emptyState-plain'], className)}>
      <div className={s.emptyIcon}>
        <Icon name={icon} size={20} />
      </div>
      <p className={s.emptyTitle}>{title}</p>
      {description ? <p className={s.emptyDescription}>{description}</p> : null}
      {action ? <div className={s.emptyAction}>{action}</div> : null}
    </div>
  );
}

export type AlertVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const ALERT_ICONS: Record<AlertVariant, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'checkCircle',
  warning: 'alertTriangle',
  danger: 'alertCircle',
  accent: 'sparkles',
};

export function Alert({
  variant = 'neutral',
  title,
  children,
  icon,
  action,
  className,
}: {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cn(s.alert, s[`alert-${variant}`], className)}>
      <Icon name={icon ?? ALERT_ICONS[variant]} size={16} className={s.alertIcon} />
      <div className={s.alertBody}>
        {title ? <p className={s.alertTitle}>{title}</p> : null}
        {children ? <div className={s.alertText}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, max = 100, label, className }: { value: number; max?: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={cn(s.progress, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={s.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn(s.stat, className)}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {hint ? <span className={s.statHint}>{hint}</span> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn(s.pageHeader, className)}>
      <div className={s.pageHeaderText}>
        {eyebrow ? <span className={s.pageEyebrow}>{eyebrow}</span> : null}
        <h1 className={s.pageTitle}>{title}</h1>
        {description ? <p className={s.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={s.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn(s.sectionHeader, className)}>
      <div className={s.sectionHeaderText}>
        <h2 id={id} className={s.sectionTitle}>
          {title}
        </h2>
        {description ? <p className={s.sectionDescription}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ── Settings layout ────────────────────────────────────────── */

export function SettingsSection({
  id,
  title,
  description,
  icon,
  action,
  footer,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn(s.settingsSection, className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className={s.settingsSectionHeader}>
        <div>
          <h2 id={id ? `${id}-title` : undefined} className={s.settingsSectionTitle}>
            {icon ? <Icon name={icon} size={16} /> : null}
            {title}
          </h2>
          {description ? <p className={s.settingsSectionDescription}>{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={s.settingsSectionBody}>{children}</div>
      {footer ? <div className={s.settingsSectionFooter}>{footer}</div> : null}
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  stacked,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
  /** Put the control under the text (wide controls such as pickers). */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(s.settingsRow, stacked && s['settingsRow-stacked'], className)}>
      <div className={s.settingsRowText}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className={s.settingsRowLabel}>
            {label}
          </label>
        ) : (
          <span className={s.settingsRowLabel}>{label}</span>
        )}
        {description ? <span className={s.settingsRowDescription}>{description}</span> : null}
      </div>
      {children ? <div className={s.settingsRowControl}>{children}</div> : null}
    </div>
  );
}

/** Free-form padded block inside a SettingsSection (lists, editors, logs). */
export function SettingsBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.settingsBlock, className)}>{children}</div>;
}

/* ── Dialog & Sheet ─────────────────────────────────────────── */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  hideClose,
  initialFocusRef,
  className,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name when the dialog has no visible title (e.g. a command menu). */
  label?: string;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When false, Escape and outside clicks do not close it (e.g. blocking states). */
  dismissible?: boolean;
  hideClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  if (!open) return null;
  return (
    <Portal>
      <DialogPanel
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        footer={footer}
        size={size}
        dismissible={dismissible}
        hideClose={hideClose}
        initialFocusRef={initialFocusRef}
        className={className}
        label={label}
      >
        {children}
      </DialogPanel>
    </Portal>
  );
}

function DialogPanel({
  onOpenChange,
  title,
  description,
  children,
  footer,
  size,
  dismissible,
  hideClose,
  initialFocusRef,
  className,
  label,
}: {
  label?: string;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size: 'sm' | 'md' | 'lg' | 'xl';
  dismissible: boolean;
  hideClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(panelRef, initialFocusRef);
  return (
    <div
      className={s.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(s.dialog, size !== 'md' && s[`dialog-${size}`], className)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && dismissible) {
            event.stopPropagation();
            onOpenChange(false);
            return;
          }
          trapTabKey(event, panelRef.current);
        }}
      >
        {title || description ? (
          <div className={s.dialogHeader}>
            {title ? (
              <h2 id={titleId} className={s.dialogTitle}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className={s.dialogDescription}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        {children ? <div className={s.dialogBody}>{children}</div> : null}
        {footer ? <div className={s.dialogFooter}>{footer}</div> : null}
        {!hideClose && dismissible ? (
          <IconButton icon="x" label="Close" size="sm" className={s.dialogClose} onClick={() => onOpenChange(false)} data-focus-skip />
        ) : null}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onOpenChange,
  side = 'right',
  title,
  description,
  headerActions,
  children,
  footer,
  width,
  modal = true,
  className,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'right' | 'left' | 'bottom';
  title?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  /** Non-modal sheets keep the page interactive (no dimming, no focus trap). */
  modal?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  if (!open) return null;
  return (
    <Portal>
      <SheetPanel
        onOpenChange={onOpenChange}
        side={side}
        title={title}
        description={description}
        headerActions={headerActions}
        footer={footer}
        width={width}
        modal={modal}
        className={className}
        bodyClassName={bodyClassName}
      >
        {children}
      </SheetPanel>
    </Portal>
  );
}

function SheetPanel({
  onOpenChange,
  side,
  title,
  description,
  headerActions,
  children,
  footer,
  width,
  modal,
  className,
  bodyClassName,
}: {
  onOpenChange: (open: boolean) => void;
  side: 'right' | 'left' | 'bottom';
  title?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  modal: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(panelRef);
  useEffect(() => {
    if (modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, onOpenChange]);
  return (
    <>
      {modal ? <div className={s.sheetOverlay} onMouseDown={() => onOpenChange(false)} /> : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(s.sheet, s[`sheet-${side}`], className)}
        style={width !== undefined && side !== 'bottom' ? { width } : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && modal) {
            event.stopPropagation();
            onOpenChange(false);
            return;
          }
          if (modal) trapTabKey(event, panelRef.current);
        }}
      >
        {title || headerActions ? (
          <div className={s.sheetHeader}>
            <div className={s.sheetHeaderText}>
              {title ? (
                <h2 id={titleId} className={s.sheetTitle}>
                  {title}
                </h2>
              ) : null}
              {description ? <p className={s.sheetDescription}>{description}</p> : null}
            </div>
            <div className={s.row} style={{ gap: 4 }}>
              {headerActions}
              <IconButton icon="x" label="Close" size="sm" onClick={() => onOpenChange(false)} />
            </div>
          </div>
        ) : null}
        <div className={cn(s.sheetBody, bodyClassName)}>{children}</div>
        {footer ? <div className={s.sheetFooter}>{footer}</div> : null}
      </div>
    </>
  );
}

/* ── Popover & DropdownMenu ─────────────────────────────────── */

export interface TriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls'?: string;
}

/**
 * Anchored floating panel. Pass `trigger` as a render prop that spreads the
 * provided props onto a Button/IconButton. Works controlled or uncontrolled.
 */
export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  width,
  label,
  className,
  role = 'dialog',
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: Side;
  align?: Align;
  width?: number | string;
  label?: string;
  className?: string;
  role?: 'dialog' | 'menu';
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const anchorRef = useRef<HTMLButtonElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, [anchorRef, floatingRef], close);
  const { style, measured } = useAnchoredPosition(anchorRef, floatingRef, open, { side, align });

  return (
    <>
      {trigger({
        ref: anchorRef,
        onClick: () => setOpen(!open),
        'aria-expanded': open,
        'aria-haspopup': role === 'menu' ? 'menu' : 'dialog',
        'aria-controls': open ? panelId : undefined,
      })}
      {open ? (
        <Portal>
          <div
            ref={floatingRef}
            id={panelId}
            role={role}
            aria-label={label}
            data-measuring={measured ? undefined : 'true'}
            className={cn(s.popover, className)}
            style={{ ...style, width }}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        </Portal>
      ) : null}
    </>
  );
}

export type MenuEntry =
  | {
      type?: 'item';
      label: ReactNode;
      icon?: IconName;
      description?: ReactNode;
      shortcut?: string;
      onSelect: () => void;
      destructive?: boolean;
      disabled?: boolean;
      /** Shows a check mark column (for single-choice menus). */
      checked?: boolean;
      key?: string;
    }
  | { type: 'separator'; key?: string }
  | { type: 'label'; label: ReactNode; key?: string };

export function DropdownMenu({
  trigger,
  items,
  side = 'bottom',
  align = 'end',
  width,
  label,
  open,
  onOpenChange,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  items: ReadonlyArray<MenuEntry | false | null | undefined>;
  side?: Side;
  align?: Align;
  width?: number | string;
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const entries = items.filter(Boolean) as MenuEntry[];
  const hasChecks = entries.some((entry) => (entry.type === undefined || entry.type === 'item') && entry.checked !== undefined);
  return (
    <Popover trigger={trigger} side={side} align={align} width={width} label={label} role="menu" open={open} onOpenChange={onOpenChange}>
      {(close) => <MenuList entries={entries} hasChecks={hasChecks} close={close} />}
    </Popover>
  );
}

function MenuList({ entries, hasChecks, close }: { entries: MenuEntry[]; hasChecks: boolean; close: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      close();
    }
  };
  return (
    <div ref={listRef} className={s.menu} onKeyDown={onKeyDown}>
      {entries.map((entry, index) => {
        const key = entry.key ?? `entry-${index}`;
        if (entry.type === 'separator') return <div key={key} className={s.menuSeparator} role="separator" />;
        if (entry.type === 'label') {
          return (
            <div key={key} className={s.menuLabel}>
              {entry.label}
            </div>
          );
        }
        return (
          <button
            key={key}
            type="button"
            role={entry.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={entry.checked !== undefined ? entry.checked : undefined}
            disabled={entry.disabled}
            className={cn(s.menuItem, entry.destructive && s['menuItem-destructive'])}
            onClick={() => {
              close();
              entry.onSelect();
            }}
          >
            {hasChecks ? (
              <span className={s.menuCheck}>{entry.checked ? <Icon name="check" size={14} /> : null}</span>
            ) : entry.icon ? (
              <Icon name={entry.icon} size={16} />
            ) : null}
            <span className={s.menuItemText}>
              <span className={s.menuItemLabel}>{entry.label}</span>
              {entry.description ? <span className={s.menuItemDescription}>{entry.description}</span> : null}
            </span>
            {entry.shortcut ? <span className={s.menuItemTrailing}>{entry.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export { s as primitiveStyles };
