package com.n3xus.bude;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * One-shot launch info for the web app: which tab a home-screen shortcut
 * or the widget asked for, text shared into Bud-E from another app, and
 * an app action the bubble or voice chat asked for (stash add/subtract,
 * log a session). MainActivity captures it from the launch intent
 * (onCreate and onNewIntent); the web app reads it once through the
 * BudEActions plugin and it is cleared on read so it never fires twice.
 */
public final class BudELaunchInfo {
    private static final String PREFS = "bude-launch";
    private static final String TAB_KEY = "tab";
    private static final String SHARED_TEXT_KEY = "shared_text";
    private static final String APP_ACTION_KEY = "app_action";

    /** Extra carrying the tab id a shortcut asked for. */
    public static final String EXTRA_TAB = "bude_tab";

    /** Extra carrying an app-action JSON block from the bubble/voice chat. */
    public static final String EXTRA_APP_ACTION = "bude_app_action";

    private BudELaunchInfo() {
    }

    /** Pull the tab / shared text / app action out of a launch intent, if it has any. */
    public static void capture(Context context, Intent intent) {
        if (context == null || intent == null) return;
        SharedPreferences.Editor editor =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        boolean changed = false;
        String tab = intent.getStringExtra(EXTRA_TAB);
        if (tab != null && !tab.isEmpty()) {
            editor.putString(TAB_KEY, tab);
            changed = true;
        }
        String appAction = intent.getStringExtra(EXTRA_APP_ACTION);
        if (appAction != null && !appAction.isEmpty()) {
            editor.putString(APP_ACTION_KEY, appAction);
            changed = true;
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (shared != null && !shared.isEmpty()) {
                editor.putString(SHARED_TEXT_KEY, shared);
                editor.putString(TAB_KEY, "chat");
                changed = true;
            }
        }
        // Talk fallback: the phone's assistant list opened the app itself
        // (Bud-E was not the default assistant) — land on the chat tab.
        if (Intent.ACTION_ASSIST.equals(intent.getAction())) {
            editor.putString(TAB_KEY, "chat");
            changed = true;
        }
        if (changed) editor.apply();
    }

    /** Read the stored launch info and clear it. Never null. */
    public static JSONObject readAndClear(Context context) {
        JSONObject out = new JSONObject();
        if (context == null) return out;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            out.put("tab", prefs.getString(TAB_KEY, ""));
            out.put("sharedText", prefs.getString(SHARED_TEXT_KEY, ""));
            out.put("appAction", prefs.getString(APP_ACTION_KEY, ""));
        } catch (Exception ignored) {
            // A broken store reads as empty.
        }
        prefs.edit().clear().apply();
        return out;
    }
}
