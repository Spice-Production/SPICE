'use client';

import { useEffect, useState } from 'react';

import { Button, EmptyState, ErrorNote, Picker, TextField } from '@/components/ui';

export interface MusicProfile {
  id: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
}

const ACTIVE_KEY = 'spice_cloud_profile_id';

/**
 * Account profiles: list, switch, create. Same endpoints and replacement
 * contract as the original (GET with Bearer, POST the full array). The
 * active profile id lives under the same localStorage key the account
 * helpers read, so switching here repaints the avatar/name everywhere.
 */
export function useMusicProfiles(token: string | null) {
  const [profiles, setProfiles] = useState<MusicProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenToken, setSeenToken] = useState(token);

  // Derived state: signing out drops the profile list.
  if (token !== seenToken) {
    setSeenToken(token);
    setProfiles([]);
    setLoaded(false);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sync/profiles', { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json().catch(() => ({}))) as { profiles?: MusicProfile[]; message?: string };
        if (!res.ok) throw new Error(data.message || `Profiles failed (${res.status}).`);
        if (cancelled) return;
        const list = Array.isArray(data.profiles) ? data.profiles : [];
        setProfiles(list);
        setActiveId((prev) => {
          const stored = (() => {
            try {
              return window.localStorage.getItem(ACTIVE_KEY);
            } catch {
              return null;
            }
          })();
          if (prev && list.some((p) => p.id === prev)) return prev;
          const fallback = (stored && list.some((p) => p.id === stored) ? stored : list[0]?.id) ?? null;
          return fallback;
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Profiles failed.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const select = (id: string) => {
    setActiveId(id);
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* private mode: selection lasts the visit */
    }
  };

  const create = async (displayName: string) => {
    if (!token) return;
    const name = displayName.trim();
    if (!name) return;
    const fresh = {
      id: `profile_${Date.now()}`,
      displayName: name,
      gradient: 'linear-gradient(135deg, #8b93f8, #6d6df2)',
      joinedAt: new Date().toISOString(),
    };
    const next = [...profiles, fresh];
    setProfiles(next);
    try {
      const res = await fetch('/api/sync/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profiles: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || `Create failed (${res.status}).`);
      select(fresh.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile.');
    }
  };

  return { profiles, activeId, loaded, error, select, create };
}

export function ProfilesView({ token }: { token: string | null }) {
  const { profiles, activeId, loaded, error, select, create } = useMusicProfiles(token);
  const [name, setName] = useState('');

  if (!token) return <EmptyState message="Sign in above to use profiles." />;
  if (!loaded) return <EmptyState message="Loading profiles…" />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {profiles.length > 0 && (
        <Picker
          label="Active profile"
          options={profiles.map((p) => ({ value: p.id, label: p.displayName }))}
          value={activeId ?? profiles[0].id}
          onChange={select}
        />
      )}
      {error && <ErrorNote message={error} />}
      <form
        onSubmit={(e) => { e.preventDefault(); void create(name); setName(''); }}
        style={{ display: 'flex', gap: 10, alignItems: 'end' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField label="New profile" placeholder="Name it…" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" disabled={!name.trim()}>Create</Button>
      </form>
    </div>
  );
}
