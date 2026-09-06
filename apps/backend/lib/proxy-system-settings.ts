import { db } from '@/db';
import { systemSettings } from '@/db/schema';

export interface ProxySystemSettings {
  emergencyAusterity: boolean;
  austerityThrottleRate: number;
  disableSync: boolean;
  emergencyStop: boolean;
}

let cachedSettings: ProxySystemSettings | null = null;
let lastFetchTime = 0;
// Emergency controls still converge quickly while halving repeated reads
// from a warm instance compared with the previous 15-second window.
const CACHE_TTL_MS = 30000;

const DEFAULTS: ProxySystemSettings = {
  emergencyAusterity: false,
  austerityThrottleRate: 50,
  disableSync: false,
  emergencyStop: false,
};

export async function getProxySystemSettings(): Promise<ProxySystemSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - lastFetchTime <= CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    // Driver-aware shared client: Neon HTTP on Neon URLs, pooled
    // node-postgres everywhere else (self-host). Never the Neon-only
    // client here — it cannot speak to self-host Postgres.
    const rows = await db.select().from(systemSettings).limit(1);
    const row = rows[0];
    cachedSettings = row
      ? {
        emergencyAusterity: Boolean(row.emergencyAusterity),
        austerityThrottleRate: Number(row.austerityThrottleRate ?? 50),
        disableSync: Boolean(row.disableSync),
        emergencyStop: Boolean(row.emergencyStop),
      }
      : { ...DEFAULTS };
  } catch {
    // Fail open if the database is unreachable to avoid breaking the app.
    // (The proxy caller also fails open; this keeps behavior identical.)
    return null;
  }
  lastFetchTime = now;

  return cachedSettings;
}
