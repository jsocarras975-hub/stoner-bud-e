package com.n3xus.bude;

import android.Manifest;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

/**
 * Capacitor bridge for Bud-E's device actions (see BudEActions): the web
 * chat calls execute({action}) and the native helper does the work.
 * Some actions need a runtime permission — flashlight needs the camera,
 * calls/texts need contacts. When one is missing, the plugin asks the
 * phone once and retries after the answer instead of failing.
 */
@CapacitorPlugin(
        name = "BudEActions",
        permissions = {
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
                @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
        }
)
public class BudEActionsPlugin extends Plugin {
    private JSONObject pendingAction;

    @PluginMethod
    public void execute(PluginCall call) {
        JSObject action = call.getObject("action");
        if (action == null) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", "there was nothing to do"));
            return;
        }
        runAction(call, action);
    }

    private void runAction(PluginCall call, JSONObject action) {
        BudEActions.Result result = BudEActions.execute(getContext(), action);
        if (!result.ok && "camera-permission".equals(result.code)) {
            // Ask once, then retry in the permission callback below.
            pendingAction = action;
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        if (!result.ok && "contacts-permission".equals(result.code)) {
            // Ask once, then retry in the permission callback below.
            pendingAction = action;
            requestPermissionForAlias("contacts", call, "onContactsPermission");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }

    @PluginMethod
    public void getTalkNotification(PluginCall call) {
        call.resolve(new JSObject().put("enabled", BudENotification.isEnabled(getContext())));
    }

    @PluginMethod
    public void setTalkNotification(PluginCall call) {
        Boolean on = call.getBoolean("enabled");
        if (on == null) {
            call.reject("missing enabled");
            return;
        }
        BudENotification.setEnabled(getContext(), on);
        call.resolve(new JSObject().put("enabled", on));
    }

    /** One-shot launch info for the web app (shortcut tab, shared text). */
    @PluginMethod
    public void getLaunchInfo(PluginCall call) {
        JSONObject info = BudELaunchInfo.readAndClear(getContext());
        JSObject res = new JSObject();
        res.put("tab", info.optString("tab", ""));
        res.put("sharedText", info.optString("sharedText", ""));
        res.put("appAction", info.optString("appAction", ""));
        call.resolve(res);
    }

    /** Whether Bud-E is the phone's default digital assistant right now. */
    @PluginMethod
    public void getAssistantStatus(PluginCall call) {
        call.resolve(new JSObject().put("isAssistant", isAssistantHeld()));
    }

    /** Open the phone's Default apps settings page (the manual fallback). */
    @PluginMethod
    public void openDefaultAppsSettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("could not open settings: " + e.getMessage());
        }
    }

    /** Write the widget's stash line (totals + the first low jar, if any). */
    @PluginMethod
    public void publishWidgetStash(PluginCall call) {
        String stashLine = call.getString("stashLine", "");
        String lowLine = call.getString("lowLine", "");
        Context context = getContext();
        context.getSharedPreferences(BudEWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BudEWidgetProvider.KEY_STASH_LINE, stashLine)
                .putString(BudEWidgetProvider.KEY_LOW_LINE, lowLine)
                .apply();
        BudEWidgetProvider.updateAllWidgets(context);
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Publish the now-playing state for the music widget (title, artist,
     * whether it is playing, whether a track is loaded at all), so the
     * widget shows what is playing without opening the app. The music
     * widget re-renders from the same "bude-widget" preferences.
     */
    @PluginMethod
    public void publishMusicState(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        boolean playing = call.getBoolean("playing", false);
        boolean hasTrack = call.getBoolean("hasTrack", false);
        Context context = getContext();
        context.getSharedPreferences(BudEWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BudEMusicWidgetProvider.KEY_MUSIC_TITLE, title)
                .putString(BudEMusicWidgetProvider.KEY_MUSIC_ARTIST, artist)
                .putBoolean(BudEMusicWidgetProvider.KEY_MUSIC_PLAYING, playing)
                .putBoolean(BudEMusicWidgetProvider.KEY_MUSIC_HAS_TRACK, hasTrack)
                .apply();
        BudEMusicWidgetProvider.updateAllWidgets(context);
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Publish the local temperature for the main widget's time + weather
     * line (e.g. "72°F"). The widget re-renders from the same
     * "bude-widget" preferences. The app fetches the weather (Open-Meteo,
     * San Antonio) when it opens and every half hour while it is open.
     */
    @PluginMethod
    public void publishWeather(PluginCall call) {
        String temp = call.getString("temp", "—°F");
        Context context = getContext();
        context.getSharedPreferences(BudEWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BudEWidgetProvider.KEY_WEATHER, temp)
                .apply();
        BudEWidgetProvider.updateAllWidgets(context);
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Publish today's strain pick for the main widget ("⭐ Today's pick:
     * Blue Dream"). The app computes it (deterministic by day-of-year)
     * when it opens and publishes it; the widget shows the last published
     * pick in between, so it can go stale if the app is not opened for a
     * while. Tapping the line opens the app to the Strains tab.
     */
    @PluginMethod
    public void publishStrainOfTheDay(PluginCall call) {
        String line = call.getString("line", "⭐ Today's pick: —");
        Context context = getContext();
        context.getSharedPreferences(BudEWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BudEWidgetProvider.KEY_STRAIN, line)
                .apply();
        BudEWidgetProvider.updateAllWidgets(context);
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Publish the stash summary the bubble and voice chats send to the
     * server, so Bud-E knows what jars exist when the user asks it to
     * change the stash. The native chat clients read it from here.
     */
    @PluginMethod
    public void publishStashSummary(PluginCall call) {
        String summary = call.getString("summary", "");
        Context context = getContext();
        context.getSharedPreferences(BudEChatClient.STASH_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BudEChatClient.STASH_SUMMARY_KEY, summary)
                .apply();
        call.resolve(new JSObject().put("ok", true));
    }

    /** Floating bubble: is it switched on, and may Bud-E draw over other apps? */
    @PluginMethod
    public void getBubbleStatus(PluginCall call) {
        Context context = getContext();
        JSObject res = new JSObject();
        res.put("enabled", BudEBubbleService.isEnabled(context));
        res.put("canDrawOverlays", android.provider.Settings.canDrawOverlays(context));
        call.resolve(res);
    }

    /** Switch the floating chat bubble on or off. */
    @PluginMethod
    public void setBubbleEnabled(PluginCall call) {
        Boolean on = call.getBoolean("enabled");
        if (on == null) {
            call.reject("missing enabled");
            return;
        }
        Context context = getContext();
        if (on && !android.provider.Settings.canDrawOverlays(context)) {
            call.reject("needs the draw-over-other-apps permission first");
            return;
        }
        BudEBubbleService.setEnabled(context, on);
        if (on) {
            BudEBubbleService.start(context);
        } else {
            BudEBubbleService.stop(context);
        }
        call.resolve(new JSObject().put("enabled", on));
    }

    /** Open the page where the phone allows Bud-E to draw over other apps. */
    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("could not open settings: " + e.getMessage());
        }
    }

    private RoleManager roleManager() {
        Context context = getContext();
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null;
        return (RoleManager) context.getSystemService(Context.ROLE_SERVICE);
    }

    private boolean isAssistantHeld() {
        RoleManager roleManager = roleManager();
        return roleManager != null && roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT);
    }

    /** Retry the pending action after the user answers a permission prompt.
     *  When the denial is permanent (the phone will not ask again), open
     *  Bud-E's app settings directly instead of just saying no — the
     *  toggle the user needs is right there. */
    private void retryPending(PluginCall call, String alias, String permission,
                              String emptyMessage, String deniedMessage) {
        JSONObject action = pendingAction;
        pendingAction = null;
        if (action == null) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", emptyMessage));
            return;
        }
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            if (permission != null && getActivity() != null
                    && !getActivity().shouldShowRequestPermissionRationale(permission)) {
                try {
                    android.content.Intent settings =
                            new android.content.Intent(
                                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    settings.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                    call.resolve(new JSObject()
                            .put("ok", false)
                            .put("message", "Contacts access is off — I opened Bud-E's settings so you can switch it on, then ask again."));
                    return;
                } catch (Exception ignored) {
                    // Fall through to the plain message below.
                }
            }
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", deniedMessage));
            return;
        }
        BudEActions.Result result = BudEActions.execute(getContext(), action);
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }

    @PermissionCallback
    private void onCameraPermission(PluginCall call) {
        retryPending(call, "camera", null,
                "the flashlight is not available right now",
                "Camera access is off — allow it in the Bud-E app settings to use the flashlight.");
    }

    @PermissionCallback
    private void onContactsPermission(PluginCall call) {
        retryPending(call, "contacts", Manifest.permission.READ_CONTACTS,
                "I could not look them up right now",
                "Contacts access is off — allow it in the Bud-E app settings so I can find who to call or text.");
    }
}
