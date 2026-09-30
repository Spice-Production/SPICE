'use client';

import { useState } from 'react';

import { SpiceUiContext } from './context';
import type { SpiceUiModel } from './model';
import { PortalContext } from './primitives';
import { AppShell } from './shell/app-shell';
import theme from './theme.module.css';

/**
 * Class SpiceApp puts on its root element while UI v2 is active. It carries
 * the design tokens, so the shared <audio>/YouTube elements SpiceApp keeps
 * mounted across interface switches are themed too.
 */
export const SPICE_UI_V2_HOST_CLASS = theme.host;

/** Root of the UI v2 preview. Purely presentational: every value comes from the model. */
export default function SpiceUiV2({ model }: { model: SpiceUiModel }) {
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null);
  return (
    <SpiceUiContext.Provider value={model}>
      <PortalContext.Provider value={portalNode}>
        <div className={theme.root} data-surface={model.visualSurface} data-motion={model.motionLevel}>
          <AppShell />
          <div ref={setPortalNode} className={theme.portal} />
        </div>
      </PortalContext.Provider>
    </SpiceUiContext.Provider>
  );
}
