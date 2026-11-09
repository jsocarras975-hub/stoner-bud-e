package com.n3xus.bude;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Fires a Bud-E reminder: the AlarmManager wakes this receiver at the time
 * the user asked for, and it posts a notification — even with the app
 * closed. Tapping the notification opens the Bud-E app. Reminders are
 * local only; nothing about them leaves the phone.
 */
public class BudEReminderReceiver extends BroadcastReceiver {
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_ID = "id";

    @Override
    public void onReceive(Context context, Intent intent) {
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        int id = intent != null ? intent.getIntExtra(EXTRA_ID, 0) : 0;
        if (text == null || text.trim().isEmpty()) return;

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    BudEActions.REMINDER_CHANNEL_ID,
                    "Bud-E reminders",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminders you asked Bud-E for.");
            nm.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(
                context, id, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, BudEActions.REMINDER_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Bud-E reminder")
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

        try {
            nm.notify(id, builder.build());
        } catch (Exception ignored) {
            // Notifications off or denied — nothing more to do here.
        }
    }
}
