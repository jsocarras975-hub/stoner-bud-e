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
 * Bud-E's home-screen widget (4 wide, 2 tall): the stash line on top,
 * Talk / Open Bud-E, then Log / Stash / Tonight. Talk opens the bubble
 * chat panel (MainActivity starts the bubble service and asks it to
 * expand); the other buttons open the app straight to that tab. The
 * widget never talks by itself; it only opens things.
 *
 * The stash line comes from SharedPreferences ("bude-widget"), written
 * by the app whenever the stash changes — a low jar wins the line, so
 * the warning is what he sees without opening the app.
 */
public class BudEWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "bude-widget";
    public static final String KEY_STASH_LINE = "stashLine";
    public static final String KEY_LOW_LINE = "lowLine";

    /** Re-render every Bud-E widget now (called after the stash is published). */
    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudEWidgetProvider.class));
        if (ids.length > 0) {
            new BudEWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String stashLine = prefs.getString(KEY_STASH_LINE, "Stash: —");
        String lowLine = prefs.getString(KEY_LOW_LINE, "");
        // A jar running low is the line that matters — show it in amber.
        boolean showingLow = lowLine != null && !lowLine.isEmpty();
        String line = showingLow ? lowLine : stashLine;
        int color = showingLow ? 0xFFFFB020 : 0xFFF2F0EB;

        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.bud_e_widget);
            views.setTextViewText(R.id.widget_stash, line);
            views.setTextColor(R.id.widget_stash, color);
            // Talk: the app starts the bubble service and opens the chat
            // panel (the voice session is only for the notification now).
            views.setOnClickPendingIntent(R.id.widget_talk, tabIntent(context, 0, true, null));
            views.setOnClickPendingIntent(R.id.widget_open, tabIntent(context, 1, false, null));
            views.setOnClickPendingIntent(R.id.widget_log, tabIntent(context, 2, false, "journal"));
            views.setOnClickPendingIntent(R.id.widget_stash_btn, tabIntent(context, 3, false, "stash"));
            views.setOnClickPendingIntent(R.id.widget_tonight, tabIntent(context, 4, false, "tonight"));
            manager.updateAppWidget(id, views);
        }
    }

    /** One PendingIntent per button (distinct request codes, or they collide). */
    private PendingIntent tabIntent(Context context, int code, boolean talk, String tab) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (talk) {
            intent.putExtra("bude_bubble_chat", true);
        } else if (tab != null) {
            intent.putExtra("bude_tab", tab);
        }
        return PendingIntent.getActivity(
                context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
