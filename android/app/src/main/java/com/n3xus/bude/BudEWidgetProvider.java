package com.n3xus.bude;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Bud-E's home-screen widget: one tap to talk (opens the default digital
 * assistant — Bud-E when it is set as the assistant), one tap to open the
 * app. The widget never talks by itself; it only opens things.
 */
public class BudEWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.bud_e_widget);
            PendingIntent talk = PendingIntent.getActivity(
                    context, 0,
                    new Intent(Intent.ACTION_ASSIST),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_talk, talk);
            PendingIntent open = PendingIntent.getActivity(
                    context, 1,
                    new Intent(context, MainActivity.class)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_open, open);
            manager.updateAppWidget(id, views);
        }
    }
}
