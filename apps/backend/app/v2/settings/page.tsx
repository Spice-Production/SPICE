'use client';

import { Card, PageHeader } from '@/components/ui';
import { PlaybackView } from '../music/playback';
import { usePlayer } from '../shell';
import { ThemeView, useThemeAccent } from '../music/themes';
import { DiagnosticsCard } from '../music/extras';

/**
 * /v2/settings — playback, theme, and diagnostics. The same islands the
 * music page hosted, gathered where settings belong.
 */
export default function V2SettingsPage() {
  const { playback } = usePlayer();
  const theme = useThemeAccent();

  return (
    <>
      <PageHeader kicker="SPICE" title="Settings" lede="How SPICE sounds and looks on this device." />
      <Card title="Playback">
        <PlaybackView hook={playback} />
      </Card>
      <Card title="Theme">
        <ThemeView hook={theme} />
      </Card>
      <DiagnosticsCard />
    </>
  );
}
