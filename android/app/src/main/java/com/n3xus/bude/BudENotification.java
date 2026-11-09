package com.n3xus.bude;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Bud-E's persistent "Talk" notification: one tap to talk to Bud-E (the
 * app opens the voice session when Bud-E is the default assistant, and
 * the chat tab otherwise), tap the notification itself to open the app. Ongoing and low importance
 * so it sits quietly and never buzzes. The user can switch it off in
 * Settings; the choice lives here (device-only, never synced). Needs the
 * notification permission to show — if it is off, posting silently does
 * nothing.
 */
public final class BudENotification {
    public static final int NOTIFICATION_ID = 1001;
    private static final String CHANNEL_ID = "bud-e-talk";
    private static final String PREFS = "bude-talk-notification";
    private static final String ENABLED_KEY = "enabled";

    private BudENotification() {
    }

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(ENABLED_KEY, true);
    }

    public static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(ENABLED_KEY, enabled).apply();
        if (enabled) show(context);
        else cancel(context);
    }

    public static void showIfEnabled(Context context) {
        if (isEnabled(context)) show(context);
    }

    public static void show(Context context) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Bud-E talk", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("One tap to talk to Bud-E.");
            manager.createNotificationChannel(channel);
        }
        // Talk goes to the app, which opens the voice session when Bud-E
        // is the default assistant (a plain ACTION_ASSIST intent cannot
        // open the session — it just resolves to an app).
        PendingIntent talk = PendingIntent.getActivity(
                context, 0,
                new Intent(context, MainActivity.class)
                        .putExtra("bude_talk", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Tap the notification itself: open the app.
        PendingIntent open = PendingIntent.getActivity(
                context, 1,
                new Intent(context, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Bud-E is here")
                .setContentText("Tap Talk to ask Bud-E anything.")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(0, "Talk", talk)
                .build();
        manager.notify(NOTIFICATION_ID, notification);
    }

    public static void cancel(Context context) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }
}
