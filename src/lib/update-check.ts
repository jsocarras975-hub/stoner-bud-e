// Stoner Bud-E — in-app update check (NATIVE ONLY).
//
// On launch the native app fetches public/version.json from the live site,
// compares its latestVersionCode to this build's own versionCode (from
// Capacitor App.getInfo), and reports an available update. The web app never
// checks — it always loads the latest code from Vercel.
//
// Fail-open by design: any error (no internet, bad JSON, getInfo fails)
// returns null, so a network hiccup never locks anyone out of the app.
// Dismissal is per-version: dismissing v1.1 hides the pop-up for v1.1, but a
// newer v1.2 still shows up.

import { App } from '@capacitor/app';
import { isNative } from './device-actions';

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  notes: string;
  forceUpdate: boolean;
}

interface VersionFile {
  latestVersionCode?: number;
  latestVersionName?: string;
  downloadUrl?: string;
  notes?: string;
  forceUpdate?: boolean;
}

const VERSION_URL = 'https://stoner-bud-e.vercel.app/version.json';
const DISMISSED_KEY = 'bude-update-dismissed-v1';

function dismissedVersion(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function markUpdateDismissed(versionCode: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode));
  } catch {
    // Dismissal is a nicety; a storage failure just means it may show again.
  }
}

/** Return the available update, or null when up to date / not native / any error. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNative()) return null;
  try {
    const [res, info] = await Promise.all([
      fetch(VERSION_URL, { cache: 'no-store' }),
      App.getInfo(),
    ]);
    if (!res.ok) return null;
    const data = (await res.json()) as VersionFile;
    const latest = Number(data.latestVersionCode ?? 0);
    const own = Number(info.build ?? 0);
    if (!latest || !own || latest <= own) return null;
    if (dismissedVersion() >= latest && !data.forceUpdate) return null;
    return {
      versionCode: latest,
      versionName: String(data.latestVersionName ?? `v${latest}`),
      downloadUrl: String(data.downloadUrl ?? ''),
      notes: String(data.notes ?? ''),
      forceUpdate: Boolean(data.forceUpdate),
    };
  } catch {
    return null;
  }
}
