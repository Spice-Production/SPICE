'use client';

import { createContext, useContext, type RefObject } from 'react';

import type { SpiceUiModel } from './model';

export const SpiceUiContext = createContext<SpiceUiModel | null>(null);

/** The SpiceApp view-model: all state, derived values, and handlers. */
export function useSpiceUi(): SpiceUiModel {
  const model = useContext(SpiceUiContext);
  if (!model) throw new Error('useSpiceUi must be used inside <SpiceUiV2>.');
  return model;
}

/**
 * The element that scrolls the current view (the main content column, or a
 * sheet body). Long track lists virtualize against it so pages scroll
 * naturally instead of nesting scroll boxes.
 */
export const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}
