import { createContext, useContext, type ReactNode } from 'react';

import type { SpiceController } from '../state/controller';
import { useStoreSelector } from '../state/store';
import type { UiState } from '../state/types';

const ControllerContext = createContext<SpiceController | null>(null);

export function ControllerProvider({ controller, children }: { controller: SpiceController; children: ReactNode }) {
  return <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>;
}

export function useController(): SpiceController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('useController must be used inside ControllerProvider');
  return controller;
}

/** Reads a slice of app state; the component re-renders only when that slice changes. */
export function useSpice<S>(selector: (state: UiState) => S): S {
  return useStoreSelector(useController().store, selector);
}
