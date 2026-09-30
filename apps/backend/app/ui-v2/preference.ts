/**
 * Preview toggle for the UI v2 redesign. The classic interface stays the
 * default; testers opt in from Settings, or with `?ui=v2` / `?ui=classic`
 * links that persist the choice for the next visit.
 *
 * The choice is stored twice: in localStorage (this origin) and in a
 * `spice_ui` cookie scoped to the parent domain, so it follows the tester
 * between music.* and movie.* and server-rendered pages can read it.
 * Precedence: query parameter > cookie > localStorage > classic.
 */
export const SPICE_UI_V2_STORAGE_KEY = 'spice_ui_v2_enabled';
export const SPICE_UI_V2_COOKIE = 'spice_ui';
export const SPICE_UI_V2_QUERY_PARAM = 'ui';
/** Set on <html> before hydration so classic shells never flash for v2 testers. */
export const SPICE_UI_V2_DOCUMENT_ATTRIBUTE = 'data-spice-ui';

const ENABLE_QUERY_VALUES = ['v2', 'new', 'next', 'preview'];
const DISABLE_QUERY_VALUES = ['classic', 'v1', 'legacy', 'old'];
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface SpiceUiV2PreferenceResolution {
  enabled: boolean;
  /** True when a query parameter changed the stored choice and it must be saved. */
  persist: boolean;
}

export function parseStoredSpiceUiV2Preference(stored: string | null | undefined): boolean {
  return stored === 'true';
}

/** 'v2' / 'classic' from the cookie value, or null when unset/unknown. */
export function parseSpiceUiV2Cookie(value: string | null | undefined): boolean | null {
  if (value === 'v2') return true;
  if (value === 'classic') return false;
  return null;
}

/** Reads the `spice_ui` cookie out of a `document.cookie` / Cookie header string. */
export function readSpiceUiV2CookieValue(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SPICE_UI_V2_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function queryPreference(queryValue: string | null | undefined): boolean | null {
  const requested = typeof queryValue === 'string' ? queryValue.trim().toLowerCase() : '';
  if (ENABLE_QUERY_VALUES.includes(requested)) return true;
  if (DISABLE_QUERY_VALUES.includes(requested)) return false;
  return null;
}

export function resolveSpiceUiV2Preference(
  stored: string | null | undefined,
  queryValue: string | null | undefined,
  cookieValue: string | null | undefined = null,
): SpiceUiV2PreferenceResolution {
  const fromQuery = queryPreference(queryValue);
  const fromCookie = parseSpiceUiV2Cookie(cookieValue);
  if (fromQuery !== null) {
    const unchanged = stored === serializeSpiceUiV2Preference(fromQuery) && fromCookie === fromQuery;
    return { enabled: fromQuery, persist: !unchanged };
  }
  if (fromCookie !== null) {
    // Keep this origin's localStorage in step with the domain-wide cookie.
    return { enabled: fromCookie, persist: stored !== serializeSpiceUiV2Preference(fromCookie) };
  }
  const enabled = parseStoredSpiceUiV2Preference(stored);
  // Testers who opted in before the cookie existed get it written once.
  return { enabled, persist: enabled };
}

/** Server-side resolution for pages that render one interface directly. */
export function resolveSpiceUiV2ForRequest(cookieValue: string | null | undefined, queryValue: string | string[] | null | undefined): boolean {
  const query = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  const fromQuery = queryPreference(query);
  if (fromQuery !== null) return fromQuery;
  return parseSpiceUiV2Cookie(cookieValue) ?? false;
}

export function serializeSpiceUiV2Preference(enabled: boolean): string {
  return enabled ? 'true' : 'false';
}

/**
 * Cookie domain shared by the SPICE subdomains (music.x.y / movie.x.y → x.y).
 * Hosts without a registrable domain (localhost, IPs) get a host-only cookie.
 */
export function spiceUiV2CookieDomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  return labels.slice(-2).join('.');
}

export function serializeSpiceUiV2Cookie(enabled: boolean, hostname: string, secure: boolean): string {
  const domain = spiceUiV2CookieDomain(hostname);
  return [
    `${SPICE_UI_V2_COOKIE}=${enabled ? 'v2' : 'classic'}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    domain ? `Domain=${domain}` : null,
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Inline <head> script: marks <html> before React hydrates so CSS can hide
 * the statically rendered classic shells for testers who opted into UI v2.
 */
export const SPICE_UI_V2_BOOT_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get(${JSON.stringify(SPICE_UI_V2_QUERY_PARAM)});var v=q?q.toLowerCase():'';var on;if(${JSON.stringify(ENABLE_QUERY_VALUES)}.indexOf(v)>=0){on=true}else if(${JSON.stringify(DISABLE_QUERY_VALUES)}.indexOf(v)>=0){on=false}else{var m=document.cookie.match(/(?:^|;\\s*)${SPICE_UI_V2_COOKIE}=([^;]*)/);var c=m?m[1]:'';if(c==='v2'){on=true}else if(c==='classic'){on=false}else{on=localStorage.getItem(${JSON.stringify(SPICE_UI_V2_STORAGE_KEY)})==='true'}}if(on)document.documentElement.setAttribute(${JSON.stringify(SPICE_UI_V2_DOCUMENT_ATTRIBUTE)},'v2');}catch(e){}})();`;
