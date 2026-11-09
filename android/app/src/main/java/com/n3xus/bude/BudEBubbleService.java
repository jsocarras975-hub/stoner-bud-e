package com.n3xus.bude;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

/**
 * Bud-E's floating chat bubble: a lime circle that floats over other
 * apps. Drag it anywhere; tap it to open Bud-E's chat; long-press it
 * to hide it (that also switches it off, so it stays gone until he
 * turns it back on in Settings → Phone).
 *
 * It runs as a foreground service so the bubble stays up when the app
 * is closed — the service shows a small ongoing notification while the
 * bubble is on. Needs "draw over other apps" allowed for Bud-E; the
 * Settings toggle opens that page when it isn't. A reboot brings the
 * bubble back (BudEBootReceiver), and the app re-asserts it on launch.
 */
public class BudEBubbleService extends Service {
    public static final String PREFS = "bude-bubble";
    public static final String KEY_ENABLED = "enabled";
    private static final int NOTIFICATION_ID = 1002;
    private static final String CHANNEL_ID = "bud-e-talk"; // same channel as the Talk notification

    private WindowManager windowManager;
    private TextView bubble;
    private WindowManager.LayoutParams params;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable longPressHide;
    private float downRawX;
    private float downRawY;
    private int downX;
    private int downY;
    private boolean moved;

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean on) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, on).apply();
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, BudEBubbleService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, BudEBubbleService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        bubble = new TextView(this);
        bubble.setText("\uD83D\uDCAC"); // speech balloon
        bubble.setTextSize(28);
        bubble.setGravity(Gravity.CENTER);
        bubble.setBackgroundResource(R.drawable.bud_e_bubble_bg);
        bubble.setElevation(8f);
        int size = dp(64);
        params = new WindowManager.LayoutParams(
                size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(16);
        params.y = dp(240);
        bubble.setOnTouchListener(this::onBubbleTouch);
        windowManager.addView(bubble, params);
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // If the system kills the service, bring the bubble back.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        cancelLongPress();
        if (bubble != null && windowManager != null) {
            try {
                windowManager.removeView(bubble);
            } catch (Exception ignored) {
                // Already gone — nothing to remove.
            }
            bubble = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean onBubbleTouch(View view, MotionEvent event) {
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downX = params.x;
                downY = params.y;
                moved = false;
                cancelLongPress();
                longPressHide = this::hideBubble;
                handler.postDelayed(longPressHide, 600);
                return true;
            case MotionEvent.ACTION_MOVE: {
                int dx = (int) (event.getRawX() - downRawX);
                int dy = (int) (event.getRawY() - downRawY);
                if (Math.abs(dx) > dp(10) || Math.abs(dy) > dp(10)) {
                    moved = true;
                    cancelLongPress();
                    params.x = downX + dx;
                    params.y = downY + dy;
                    windowManager.updateViewLayout(bubble, params);
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                cancelLongPress();
                if (!moved) {
                    openChat();
                }
                return true;
            case MotionEvent.ACTION_CANCEL:
                cancelLongPress();
                return true;
            default:
                return false;
        }
    }

    private void cancelLongPress() {
        if (longPressHide != null) {
            handler.removeCallbacks(longPressHide);
            longPressHide = null;
        }
    }

    /** Tap: open Bud-E straight to the chat tab. */
    private void openChat() {
        Intent intent = new Intent(this, MainActivity.class)
                .putExtra("bude_tab", "chat")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
    }

    /** Long-press: take the bubble down and switch it off for good. */
    private void hideBubble() {
        setEnabled(this, false);
        Toast.makeText(this, "Bubble hidden — turn it back on in Settings, under Phone.", Toast.LENGTH_LONG).show();
        stopSelf();
    }

    private Notification buildNotification() {
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Bud-E talk", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("One tap to talk to Bud-E.");
            manager.createNotificationChannel(channel);
        }
        PendingIntent open = PendingIntent.getActivity(
                this, 0,
                new Intent(this, MainActivity.class)
                        .putExtra("bude_tab", "chat")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Bud-E bubble is on")
                .setContentText("Tap the bubble to chat. Long-press it to hide it.")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
