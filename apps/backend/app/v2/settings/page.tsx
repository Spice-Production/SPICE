'use client';

import { AppShell, Card, PageHeader } from '@/components/ui';
import { V2_NAV } from '../nav';
import { PlaybackView, usePlaybackProfiles } from '../music/playback';
import { ThemeView, useThemeAccent } from '../music/themes';
import { DiagnosticsCard } from '../music/extras';

/**
 * /v2/settings — playback, theme, and diagnostics. The same islands the
 * music page hosted, gathered where settings belong.
 */
export default function V2SettingsPage() {
  const playback = usePlaybackProfiles();
  const theme = useThemeAccent();

  return (
    <AppShell items={V2_NAV} active="settings">
      <PageHeader kicker="SPICE" title="Settings" lede="How SPICE sounds and looks on this device." />
      <Card title="Playback">
        <PlaybackView hook={playback} />
      </Card>
      <Card title="Theme">
        <ThemeView hook={theme} />
      </Card>
      <DiagnosticsCard />
    </AppShell>
  );
}
