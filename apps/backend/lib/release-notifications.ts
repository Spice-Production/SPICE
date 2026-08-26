export const SPICE_MEDIA_CORE_VERSION = '1.0.172';
export const RELEASE_NOTIFICATION_STORAGE_KEY = 'spice_read_release_notifications';

export interface ReleaseNotification {
  id: string;
  version: string;
  title: string;
  summary: string;
  body: string[];
}
