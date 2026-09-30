// Small helpers that read untrusted JSON the way org.json's opt* accessors do
// in the Kotlin client, so both clients accept the same server payloads.

export type Json = Record<string, unknown>;

export function asObject(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function obj(source: Json | null | undefined, key: string): Json | null {
  return source ? asObject(source[key]) : null;
}

export function arr(source: Json | null | undefined, key: string): unknown[] | null {
  return source ? asArray(source[key]) : null;
}

export function has(source: Json | null | undefined, key: string): boolean {
  return !!source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
}

export function str(source: Json | null | undefined, key: string, fallback = ''): string {
  if (!source) return fallback;
  const value = source[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function num(source: Json | null | undefined, key: string, fallback: number): number {
  if (!source) return fallback;
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function int(source: Json | null | undefined, key: string, fallback: number): number {
  const value = num(source, key, Number.NaN);
  return Number.isNaN(value) ? fallback : Math.trunc(value);
}

export function bool(source: Json | null | undefined, key: string, fallback: boolean): boolean {
  if (!source) return fallback;
  const value = source[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Kotlin-style `ifEmpty`/`ifBlank` chains read better with this helper. */
export function firstNonBlank(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value && value.trim() !== '') return value;
  }
  return '';
}
