import { useCallback, useRef, useSyncExternalStore } from 'react';

/** Minimal external store: one immutable snapshot plus change listeners. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  set = (patch: Partial<T> | ((state: T) => Partial<T>)): void => {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    let changed = false;
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (!Object.is(this.state[key], next[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Subscribes a component to a slice of the store; re-renders only when the slice changes. */
export function useStoreSelector<T extends object, S>(
  store: Store<T>,
  selector: (state: T) => S,
  equality: (a: S, b: S) => boolean = shallowEqual,
): S {
  const cache = useRef<{ state: T; value: S } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.get();
    const cached = cache.current;
    if (cached && cached.state === state) return cached.value;
    const value = selector(state);
    if (cached && equality(cached.value, value)) {
      cache.current = { state, value: cached.value };
      return cached.value;
    }
    cache.current = { state, value };
    return value;
  }, [store, selector, equality]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Serializes async critical sections, like Kotlin's Mutex.withLock. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  withLock<R>(task: () => Promise<R>): Promise<R> {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
