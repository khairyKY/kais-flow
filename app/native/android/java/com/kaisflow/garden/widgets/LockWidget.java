package com.kaisflow.garden.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;

/**
 * A · Top 3 on the lock screen (lockscreen, 2026-10-26): the home-screen Top 3 face (Render "top": the goal
 * first, real CheckBoxes from Android 12, night colours from values-night so it reads on the AOD) in its own
 * picker entry with widgetCategory home_screen|keyguard (res/xml/kfl_top3.xml), for Good Lock › LockStar —
 * Samsung's own lock-screen picker takes only Samsung's widgets. A tick is the home widgets' tick
 * (KfWidget.tick → WidgetActions → KfWidget.updateAll, which redraws this through LockScreen.refresh).
 * Names follow "Show task names on the lock screen" (LockScreen.masked).
 */
public class LockWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        LockScreen.refresh(c); // draws this and sets the next-change alarm
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        updateAll(c);
    }

    static boolean placed(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, LockWidget.class)).length > 0;
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, LockWidget.class));
        if (ids.length == 0) return;
        Snap s = LockScreen.masked(c, Snap.load(c));
        long now = System.currentTimeMillis();
        for (int id : ids) {
            Bundle o = m.getAppWidgetOptions(id);
            int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            int cols = KfWidget.colsFor(w) > 0 ? KfWidget.colsFor(w) : 4;
            int rows = KfWidget.rowsFor(h) > 0 ? KfWidget.rowsFor(h) : 2;
            RemoteViews v;
            try {
                v = Render.build(c, "top", cols, rows, w > 0 ? w : 76 * cols + 16 * (cols - 1), h > 0 ? h : 96 * rows - 8, s, now);
            } catch (RuntimeException e) {
                Log.w("KfLock", "draw", e); // a bad snapshot never leaves a broken widget: first paint
                v = new RemoteViews(c.getPackageName(), R.layout.kfw_loading);
            }
            m.updateAppWidget(id, v);
        }
    }
}
