package com.n3xus.bude;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.provider.AlarmClock;
import android.provider.CalendarContract;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bud-E's device actions — the one shared place that turns a JSON action
 * (decided by the chat brain, see api/chat.ts ACTIONS_GUIDE) into something
 * the phone actually does. Used by both entry points: the Capacitor plugin
 * (web chat) and the voice session (BudESession). Only the five v1 actions
 * exist here; anything else is refused.
 *
 * - Alarms / timers / calendar: system intents that open the clock or
 *   calendar app with the details filled in — the user taps save there.
 *   No permission needed.
 * - Reminders: scheduled natively with AlarmManager + a broadcast receiver
 *   that posts a notification, so they buzz even with the app closed.
 *   Local only, no server involved.
 * - Flashlight: CameraManager torch. Needs the CAMERA permission; the
 *   caller is told plainly when it is missing instead of failing silently.
 */
public final class BudEActions {
    /** Channel for reminder notifications. */
    public static final String REMINDER_CHANNEL_ID = "bud-e-reminders";

    private static final Pattern ACTION_BLOCK =
            Pattern.compile("```action\\s*(\\{[\\s\\S]*?\\})\\s*```");
    private static final String PREFS = "bude-actions";
    private static final String REMINDER_SEQ_KEY = "reminder_seq";

    private BudEActions() {
    }

    /** How an action is launched. The voice session passes one that calls
     *  VoiceInteractionSession.startAssistantActivity; everyone else can
     *  pass null and the plain Context start is used. */
    public interface ActivityLauncher {
        void launch(Intent intent) throws Exception;
    }

    public static final class Result {
        public final boolean ok;
        /** Machine-readable reason: "ok", "camera-permission", "notifications-off", "no-app", "failed". */
        public final String code;
        /** Plain words for the user. */
        public final String message;

        public Result(boolean ok, String code, String message) {
            this.ok = ok;
            this.code = code;
            this.message = message;
        }
    }

    public static final class Outcome {
        /** The reply with the action block removed. */
        public final String cleanText;
        public final boolean attempted;
        public final boolean ok;
        public final String message;

        public Outcome(String cleanText, boolean attempted, boolean ok, String message) {
            this.cleanText = cleanText;
            this.attempted = attempted;
            this.ok = ok;
            this.message = message;
        }
    }

    private static Result ok(String message) {
        return new Result(true, "ok", message);
    }

    private static Result fail(String code, String message) {
        return new Result(false, code, message);
    }

    // ------------------------------------------------------------ Parsing

    /** Pull the action JSON out of a chat reply, or null when there is none
     *  or it does not parse. */
    public static JSONObject extractAction(String reply) {
        if (reply == null) return null;
        try {
            Matcher m = ACTION_BLOCK.matcher(reply);
            if (!m.find()) return null;
            return new JSONObject(m.group(1));
        } catch (Exception e) {
            return null;
        }
    }

    /** The reply with the action block removed, so JSON is never shown or spoken. */
    public static String stripActionBlock(String reply) {
        if (reply == null) return "";
        return ACTION_BLOCK.matcher(reply).replaceAll("").replaceAll(" {2,}", " ").trim();
    }

    /**
     * Handle a full chat reply: extract any action, run it, and return the
     * text to show/speak plus what happened. When there is no action the
     * text comes back untouched.
     */
    public static Outcome handleReply(Context context, String reply, ActivityLauncher launcher) {
        JSONObject action = extractAction(reply);
        String clean = stripActionBlock(reply);
        if (action == null) {
            return new Outcome(clean, false, true, "");
        }
        Result result = execute(context, action, launcher);
        return new Outcome(clean, true, result.ok, result.message);
    }

    public static Outcome handleReply(Context context, String reply) {
        return handleReply(context, reply, null);
    }

    // ------------------------------------------------------------ Dispatch

    public static Result execute(Context context, JSONObject action) {
        return execute(context, action, null);
    }

    public static Result execute(Context context, JSONObject action, ActivityLauncher launcher) {
        if (context == null || action == null) {
            return fail("failed", "there was nothing to do");
        }
        String kind = action.optString("action", "");
        switch (kind) {
            case "set_alarm":
                return setAlarm(context, action, launcher);
            case "set_timer":
                return setTimer(context, action, launcher);
            case "set_reminder":
                return scheduleReminder(context, action);
            case "add_event":
                return addEvent(context, action, launcher);
            case "flashlight":
                return setFlashlight(context, action);
            default:
                return fail("failed", "that is not something I can do on this phone");
        }
    }

    // ------------------------------------------------------------ Intents

    private static Result launch(Context context, Intent intent, ActivityLauncher launcher,
                                 String okMessage) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (intent.resolveActivity(context.getPackageManager()) == null) {
                return fail("no-app", "there is no app on this phone that can do that");
            }
        } catch (Exception e) {
            android.util.Log.e("BudEActions", "resolveActivity failed", e);
            return fail("failed",
                    "the phone could not open that (" + e.getClass().getSimpleName() + ")");
        }
        // The assistant launcher (startAssistantActivity) can refuse in some
        // states even when an app can handle the intent, so fall back to a
        // plain start before giving up — same pattern as opening the app
        // from the voice session.
        if (launcher != null) {
            try {
                launcher.launch(intent);
                return ok(okMessage);
            } catch (Exception e) {
                android.util.Log.e("BudEActions",
                        "assistant launch failed, trying plain start", e);
            }
        }
        try {
            context.startActivity(intent);
            return ok(okMessage);
        } catch (Exception e) {
            android.util.Log.e("BudEActions", "startActivity failed", e);
            return fail("failed",
                    "the phone could not open that (" + e.getClass().getSimpleName() + ")");
        }
    }

    private static Result setAlarm(Context context, JSONObject action, ActivityLauncher launcher) {
        int hour = action.optInt("hour", -1);
        int minute = action.optInt("minute", -1);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return fail("failed", "that alarm time does not look right");
        }
        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
        intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
        intent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        intent.putExtra(AlarmClock.EXTRA_VIBRATE, true);
        String label = action.optString("label", "").trim();
        if (!label.isEmpty()) {
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        }
        return launch(context, intent, launcher, "Opening your clock to set the alarm.");
    }

    private static Result setTimer(Context context, JSONObject action, ActivityLauncher launcher) {
        int seconds = action.optInt("seconds", -1);
        if (seconds <= 0 || seconds > 86400) {
            return fail("failed", "that timer length does not look right");
        }
        Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
        intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
        String label = action.optString("label", "").trim();
        if (!label.isEmpty()) {
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        }
        return launch(context, intent, launcher, "Starting the timer.");
    }

    private static Result addEvent(Context context, JSONObject action, ActivityLauncher launcher) {
        String title = action.optString("title", "").trim();
        long start = action.optLong("startMillis", -1);
        long end = action.optLong("endMillis", -1);
        if (title.isEmpty() || start <= 0 || end <= start) {
            return fail("failed", "that event is missing a title or a time");
        }
        Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI);
        intent.putExtra(CalendarContract.Events.TITLE, title);
        intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start);
        intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end);
        String description = action.optString("description", "").trim();
        if (!description.isEmpty()) {
            intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
        }
        return launch(context, intent, launcher, "Adding it to your calendar.");
    }

    // ------------------------------------------------------------ Flashlight

    private static Result setFlashlight(Context context, JSONObject action) {
        boolean on = action.optBoolean("on", false);
        if (context.checkSelfPermission(Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            return fail("camera-permission",
                    "To use the flashlight, open the Bud-E app once and allow camera access, then ask again.");
        }
        try {
            CameraManager manager =
                    (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) {
                return fail("failed", "this phone has no camera service");
            }
            String backId = null;
            String anyFlashId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (!Boolean.TRUE.equals(hasFlash)) continue;
                if (anyFlashId == null) anyFlashId = id;
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    backId = id;
                    break;
                }
            }
            String id = backId != null ? backId : anyFlashId;
            if (id == null) {
                return fail("failed", "this phone has no flash");
            }
            manager.setTorchMode(id, on);
            return ok(on ? "Flashlight on." : "Flashlight off.");
        } catch (CameraAccessException e) {
            return fail("failed", "the flashlight is not available right now");
        } catch (Exception e) {
            return fail("failed", "the flashlight is not available right now");
        }
    }

    // ------------------------------------------------------------ Reminders

    private static int nextReminderId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int next = prefs.getInt(REMINDER_SEQ_KEY, 100) + 1;
        prefs.edit().putInt(REMINDER_SEQ_KEY, next).apply();
        return next;
    }

    private static Result scheduleReminder(Context context, JSONObject action) {
        int minutes = action.optInt("minutes", -1);
        String text = action.optString("text", "").trim();
        if (minutes <= 0 || minutes > 60 * 24 * 7 || text.isEmpty()) {
            return fail("failed", "that reminder is missing a time or something to remind you about");
        }
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                && !nm.areNotificationsEnabled()) {
            return fail("notifications-off",
                    "notifications are off for Bud-E — turn them on in Settings and ask again");
        }
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return fail("failed", "this phone cannot set reminders");
        }
        int id = nextReminderId(context);
        Intent intent = new Intent(context, BudEReminderReceiver.class);
        intent.putExtra(BudEReminderReceiver.EXTRA_TEXT, text);
        intent.putExtra(BudEReminderReceiver.EXTRA_ID, id);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, id, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        long at = System.currentTimeMillis() + (long) minutes * 60_000L;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Exact alarms not allowed — inexact still buzzes, just
                // possibly a few minutes late.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, pending);
            }
        } catch (SecurityException e) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            } catch (Exception e2) {
                return fail("failed", "the phone would not set that reminder");
            }
        } catch (Exception e) {
            return fail("failed", "the phone would not set that reminder");
        }
        String when = minutes == 1 ? "1 minute" : minutes + " minutes";
        return ok("I'll remind you in " + when + ".");
    }
}
