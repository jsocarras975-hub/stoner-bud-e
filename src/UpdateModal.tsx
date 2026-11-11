// Stoner Bud-E — "new version available" pop-up.
//
// Shows what's new in the update, a Download button, and (unless the update
// is forced) a Dismiss button. Download opens the APK link in the system
// browser so Android downloads and installs it over the current build
// (same package + same signature). Dismiss hides it for this version only.

import type { UpdateInfo } from './lib/update-check';
import { markUpdateDismissed } from './lib/update-check';

interface Props {
  update: UpdateInfo;
  onClose: () => void;
}

export default function UpdateModal({ update, onClose }: Props) {
  function handleDownload(): void {
    if (update.downloadUrl) {
      window.open(update.downloadUrl, '_blank');
    }
  }

  function handleDismiss(): void {
    markUpdateDismissed(update.versionCode);
    onClose();
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-label="New version available">
      <div className="sheet-card update-card">
        <div className="update-eyebrow">🍃 NEW VERSION AVAILABLE</div>
        <h2 className="update-title">Bud-E {update.versionName} is here</h2>
        {update.notes ? <p className="update-notes">{update.notes}</p> : null}
        <button type="button" className="btn btn-block update-download" onClick={handleDownload}>
          ⬇ Download {update.versionName}
        </button>
        {update.forceUpdate ? (
          <p className="update-force-note">
            This update is required — the app needs it to keep working.
          </p>
        ) : (
          <button type="button" className="btn ghost btn-block update-dismiss" onClick={handleDismiss}>
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
