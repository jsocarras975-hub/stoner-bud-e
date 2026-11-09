package com.n3xus.bude;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Bud-E's home-screen widget: one tap to talk (the app opens the voice
 * session when Bud-E is the default assistant, and the chat tab
 * otherwise), one tap to open the app. The widget never talks by itself;
 * it only opens things.
 */
public class BudEWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.bud_e_widget);
            // Talk goes to the app, which opens the voice session when
            // Bud-E is the default assistant (a plain ACTION_ASSIST intent
            // cannot open the session — it just resolves to an app).
            PendingIntent talk = PendingIntent.getActivity(
                    context, 0,
                    new Intent(context, MainActivity.class)
                            .putExtra("bude_talk", true)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
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
