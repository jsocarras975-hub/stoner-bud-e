// Export my data — downloads the journal, chats, and personalization as
// JSON. The old button used a hidden <a> click on a blob URL, which does
// nothing inside the Android WebView (Capacitor does not handle anchor
// downloads), so the button looked dead. On the phone we now write the file
// with Capacitor Filesystem and hand it to the system share sheet, so the
// user can save it to Files, email it to themself, or send it anywhere.
// On the web the anchor download still works, so it stays the fallback.

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportDataJson(payload: unknown): Promise<void> {
  const text = JSON.stringify(payload, null, 2);
  const fileName = 'bude-export.json';
  if (Capacitor.isNativePlatform()) {
    const saved = await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Cache,
    });
    await Share.share({
      title: 'Bud-E data export',
      text: 'My Bud-E data (journal, chats, settings).',
      url: saved.uri,
      dialogTitle: 'Save or send your Bud-E data',
    });
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
