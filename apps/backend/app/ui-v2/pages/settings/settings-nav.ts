import type { IconName } from '../../icons';
import type { SpiceUiModel } from '../../model';

/**
 * Settings information architecture for UI v2. Groups render as separate
 * pages (one group visible at a time); items are the sections inside a group
 * and keep the classic section ids so deep links and scroll targets match.
 */
export type SettingsGroupId = 'personalize' | 'playback' | 'connect' | 'desktop' | 'support';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: IconName;
  visible?: (m: SpiceUiModel) => boolean;
}

export interface SettingsNavGroup {
  id: SettingsGroupId;
  label: string;
  description: string;
  icon: IconName;
  items: SettingsNavItem[];
}

export const SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    id: 'personalize',
    label: 'Appearance',
    description: 'Interface, theme, layout, and profile privacy.',
    icon: 'palette',
    items: [
      { id: 'interface-preview', label: 'Interface', icon: 'sparkles' },
      { id: 'theme-accent', label: 'Theme', icon: 'palette' },
      { id: 'visual-customization', label: 'Layout', icon: 'monitor' },
      { id: 'profile-privacy', label: 'Profile privacy', icon: 'shield' },
      { id: 'sidebar-controls', label: 'Sidebar', icon: 'panelLeft' },
    ],
  },
  {
    id: 'playback',
    label: 'Playback',
    description: 'Search sources, audio quality, sync, player, and smart behavior.',
    icon: 'headphones',
    items: [
      { id: 'search-sources', label: 'Search sources', icon: 'search' },
      { id: 'audio-streaming', label: 'Audio & quality', icon: 'volume' },
      { id: 'profile-sync', label: 'Listening sync', icon: 'database' },
      { id: 'player-layout', label: 'Player', icon: 'play' },
      { id: 'playback-profiles', label: 'Smart behavior', icon: 'sliders' },
    ],
  },
  {
    id: 'connect',
    label: 'Spice Connect',
    description: 'Control playback on your other devices.',
    icon: 'cast',
    items: [{ id: 'spice-connect', label: 'Spice Connect', icon: 'cast' }],
  },
  {
    id: 'desktop',
    label: 'Desktop',
    description: 'Desktop app updates, native shell, runtime, and Discord.',
    icon: 'laptop',
    items: [
      { id: 'desktop-updates', label: 'Desktop app', icon: 'download', visible: (m) => m.desktopUpdaterAvailable },
      { id: 'native-shell', label: 'Native desktop', icon: 'monitor', visible: (m) => m.nativeShellAvailable },
      { id: 'music-runtime', label: 'Music runtime', icon: 'globe', visible: (m) => m.nativeShellAvailable },
      { id: 'discord-activity', label: 'Discord activity', icon: 'activity', visible: (m) => m.nativeShellAvailable },
    ],
  },
  {
    id: 'support',
    label: 'Data & support',
    description: 'Downloads, offline runtime, feedback, backups, and diagnostics.',
    icon: 'shield',
    items: [
      { id: 'offline-library', label: 'Downloads folder', icon: 'folder' },
      { id: 'offline-runtime', label: 'Offline runtime', icon: 'hardDrive' },
      { id: 'feedback-support', label: 'Feedback', icon: 'messageSquare' },
      { id: 'storage-safety', label: 'Storage & safety', icon: 'shield' },
      { id: 'system-diagnostics', label: 'Diagnostics', icon: 'terminal' },
    ],
  },
];

export function visibleSettingsGroups(m: SpiceUiModel): SettingsNavGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.visible || item.visible(m)),
  })).filter((group) => group.items.length > 0);
}

export function settingsGroupForSection(sectionId: string): SettingsGroupId | null {
  return SETTINGS_GROUPS.find((group) => group.items.some((item) => item.id === sectionId))?.id ?? null;
}
