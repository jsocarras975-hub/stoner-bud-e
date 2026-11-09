package com.n3xus.bude;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;

/**
 * After a reboot, bring the floating chat bubble back if it was left
 * on (and the phone still allows Bud-E to draw over other apps). The
 * start is best-effort: newer Android can refuse a foreground service
 * straight after boot, in which case the app re-asserts the bubble
 * the next time it opens.
 */
public class BudEBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!BudEBubbleService.isEnabled(context)) return;
        if (!Settings.canDrawOverlays(context)) return;
        try {
            BudEBubbleService.start(context);
        } catch (Exception ignored) {
            // Refused after boot — the app starts it again on next launch.
        }
    }
}
