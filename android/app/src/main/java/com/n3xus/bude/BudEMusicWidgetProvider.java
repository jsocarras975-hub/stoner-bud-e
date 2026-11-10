package com.n3xus.bude;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Bud-E's music widget (4 wide, 1 tall): a slim now-playing bar with the
 * track title + artist and previous / play-pause / next. The app publishes
 * the now-playing state (title, artist, playing, hasTrack) into
 * SharedPreferences ("bude-widget") whenever the music changes, and this
 * provider re-renders from it.
 *
 * The buttons do not play anything by themselves — the player lives in
 * the app's WebView, so they open the app with a music action
 * (BudELaunchInfo.EXTRA_MUSIC_ACTION) and the app applies it (play/pause,
 * next, previous). Tapping the track opens the Music tab. When nothing
 * has ever played, play opens the Music tab so a song can be picked.
 */
public class BudEMusicWidgetProvider extends AppWidgetProvider {
    public static final String KEY_MUSIC_TITLE = "musicTitle";
    public static final String KEY_MUSIC_ARTIST = "musicArtist";
    public static final String KEY_MUSIC_PLAYING = "musicPlaying";
    public static final String KEY_MUSIC_HAS_TRACK = "musicHasTrack";

    /** Re-render every Bud-E music widget now (called after the music state is published). */
    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudEMusicWidgetProvider.class));
        if (ids.length > 0) {
            new BudEMusicWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(BudEWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean hasTrack = prefs.getBoolean(KEY_MUSIC_HAS_TRACK, false);
        boolean playing = prefs.getBoolean(KEY_MUSIC_PLAYING, false);
        String title = prefs.getString(KEY_MUSIC_TITLE, "");
        String artist = prefs.getString(KEY_MUSIC_ARTIST, "");
        if (!hasTrack) {
            title = "Nothing playing";
            artist = "Tap to pick a song";
        }

        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.bud_e_music_widget);
            views.setTextViewText(R.id.music_title, title);
            views.setTextViewText(R.id.music_artist, artist);
            views.setTextViewText(R.id.music_play, playing ? "⏸" : "▶");
            views.setOnClickPendingIntent(R.id.music_prev, musicIntent(context, 10, "prev"));
            views.setOnClickPendingIntent(R.id.music_play, musicIntent(context, 11, "toggle"));
            views.setOnClickPendingIntent(R.id.music_next, musicIntent(context, 12, "next"));
            views.setOnClickPendingIntent(R.id.music_open, tabIntent(context, 13, "music"));
            manager.updateAppWidget(id, views);
        }
    }

    /** One PendingIntent per button (distinct request codes, or they collide). */
    private PendingIntent musicIntent(Context context, int code, String action) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(BudELaunchInfo.EXTRA_MUSIC_ACTION, action);
        return PendingIntent.getActivity(
                context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent tabIntent(Context context, int code, String tab) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("bude_tab", tab);
        return PendingIntent.getActivity(
                context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
