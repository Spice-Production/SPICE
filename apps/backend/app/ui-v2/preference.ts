/**
 * Preview toggle for the UI v2 redesign. The classic interface stays the
 * default; testers opt in from Settings, or with `?ui=v2` / `?ui=classic`
 * links that persist the choice for the next visit.
 */
export const SPICE_UI_V2_STORAGE_KEY = 'spice_ui_v2_enabled';
export const SPICE_UI_V2_QUERY_PARAM = 'ui';
/** Set on <html> before hydration so the classic shell never flashes for v2 testers. */
export const SPICE_UI_V2_DOCUMENT_ATTRIBUTE = 'data-spice-ui';

const ENABLE_QUERY_VALUES = new Set(['v2', 'new', 'next', 'preview']);
const DISABLE_QUERY_VALUES = new Set(['classic', 'v1', 'legacy', 'old']);

export interface SpiceUiV2PreferenceResolution {
  enabled: boolean;
  /** True when a query parameter changed the stored choice and it must be saved. */
  persist: boolean;
}

export function parseStoredSpiceUiV2Preference(stored: string | null | undefined): boolean {
  return stored === 'true';
}

export function resolveSpiceUiV2Preference(
  stored: string | null | undefined,
  queryValue: string | null | undefined,
): SpiceUiV2PreferenceResolution {
  const storedEnabled = parseStoredSpiceUiV2Preference(stored);
  const requested = typeof queryValue === 'string' ? queryValue.trim().toLowerCase() : '';
  if (ENABLE_QUERY_VALUES.has(requested)) return { enabled: true, persist: stored !== 'true' };
  if (DISABLE_QUERY_VALUES.has(requested)) return { enabled: false, persist: stored !== 'false' };
  return { enabled: storedEnabled, persist: false };
}

export function serializeSpiceUiV2Preference(enabled: boolean): string {
  return enabled ? 'true' : 'false';
}

/**
 * Inline <head> script: marks <html> before React hydrates so CSS can hide the
 * statically rendered classic shell for testers who opted into UI v2.
 */
export const SPICE_UI_V2_BOOT_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get(${JSON.stringify(SPICE_UI_V2_QUERY_PARAM)});var v=q?q.toLowerCase():'';var on=${JSON.stringify([...ENABLE_QUERY_VALUES])}.indexOf(v)>=0||(${JSON.stringify([...DISABLE_QUERY_VALUES])}.indexOf(v)<0&&localStorage.getItem(${JSON.stringify(SPICE_UI_V2_STORAGE_KEY)})==='true');if(on)document.documentElement.setAttribute(${JSON.stringify(SPICE_UI_V2_DOCUMENT_ATTRIBUTE)},'v2');}catch(e){}})();`;
