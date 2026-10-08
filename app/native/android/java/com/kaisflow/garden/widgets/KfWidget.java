package com.kaisflow.garden.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;

/**
 * Kai's Flow home-screen widgets (design-export/Phone Widgets.dc.html). Each picker entry is one of
 * the classes below: a kind (what it shows) and a default size. A widget picks its face from its
 * family by the size it is given (Top 3 2×2 → Today 4×2 → Today 4×4 as it is resized), and Render
 * draws it from the snapshot (Snap). Freshness without a background process: the app's pushes,
 * Android's own 30-minute update (res/xml/kfw_*.xml), and one inexact alarm at the next moment
 * something drawn changes (a block starts or ends, a focus round runs out, midnight).
 */
public abstract class KfWidget extends AppWidgetProvider {
    private static final String TAG = "KfWidget";

    /** What it shows (Render.build). */
    abstract String kind();
    /** Its default size in cells, for the first draw before the launcher reports one. */
    abstract int cols();
    abstract int rows();

    // ── the picker entries (labels: res/values/kfw_strings.xml; sizes: res/xml/kfw_wNN.xml) ──
    // Today
    public static class W01 extends KfWidget { String kind() { return "goal"; } int cols() { return 4; } int rows() { return 1; } }
    public static class W02 extends KfWidget { String kind() { return "goal"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W03 extends KfWidget { String kind() { return "top"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W04 extends KfWidget { String kind() { return "top"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W05 extends KfWidget { String kind() { return "top"; } int cols() { return 4; } int rows() { return 4; } }
    public static class W06 extends KfWidget { String kind() { return "now"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W07 extends KfWidget { String kind() { return "next"; } int cols() { return 2; } int rows() { return 1; } }
    public static class W08 extends KfWidget { String kind() { return "progress"; } int cols() { return 4; } int rows() { return 1; } }
    // Capture
    public static class W09 extends KfWidget { String kind() { return "capture"; } int cols() { return 1; } int rows() { return 1; } }
    public static class W10 extends KfWidget { String kind() { return "capture"; } int cols() { return 2; } int rows() { return 1; } }
    public static class W11 extends KfWidget { String kind() { return "capture"; } int cols() { return 4; } int rows() { return 1; } }
    public static class W12 extends KfWidget { String kind() { return "paper"; } int cols() { return 1; } int rows() { return 1; } }
    public static class W13 extends KfWidget { String kind() { return "ask"; } int cols() { return 4; } int rows() { return 1; } }
    // Calendar
    public static class W14 extends KfWidget { String kind() { return "agenda"; } int cols() { return 4; } int rows() { return 3; } }
    public static class W15 extends KfWidget { String kind() { return "agenda"; } int cols() { return 4; } int rows() { return 4; } }
    public static class W16 extends KfWidget { String kind() { return "week"; } int cols() { return 4; } int rows() { return 1; } }
    public static class W17 extends KfWidget { String kind() { return "countdown"; } int cols() { return 2; } int rows() { return 1; } }
    // Focus: W18 is the timer while a round runs and W19 (idle) when none does — one widget.
    public static class W18 extends KfWidget { String kind() { return "focus"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W20 extends KfWidget { String kind() { return "focus"; } int cols() { return 2; } int rows() { return 1; } }
    // Routines & streaks
    public static class W21 extends KfWidget { String kind() { return "routines"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W22 extends KfWidget { String kind() { return "routines"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W23 extends KfWidget { String kind() { return "streak"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W24 extends KfWidget { String kind() { return "streak"; } int cols() { return 1; } int rows() { return 1; } }
    // Triage
    public static class W25 extends KfWidget { String kind() { return "inbox"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W26 extends KfWidget { String kind() { return "inbox"; } int cols() { return 1; } int rows() { return 1; } }
    public static class W27 extends KfWidget { String kind() { return "overdue"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W28 extends KfWidget { String kind() { return "slipping"; } int cols() { return 2; } int rows() { return 2; } }
    // Rituals & reflection: W29 is Plan my day in the morning and Shut down (W30) from 17:00 — one widget.
    public static class W29 extends KfWidget { String kind() { return "ritual"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W31 extends KfWidget { String kind() { return "journal"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W32 extends KfWidget { String kind() { return "memory"; } int cols() { return 4; } int rows() { return 2; } }
    public static class W33 extends KfWidget { String kind() { return "pressed"; } int cols() { return 2; } int rows() { return 2; } }
    public static class W34 extends KfWidget { String kind() { return "season"; } int cols() { return 2; } int rows() { return 1; } }

    static final Class<?>[] ALL = {
        W01.class, W02.class, W03.class, W04.class, W05.class, W06.class, W07.class, W08.class,
        W09.class, W10.class, W11.class, W12.class, W13.class,
        W14.class, W15.class, W16.class, W17.class,
        W18.class, W20.class,
        W21.class, W22.class, W23.class, W24.class,
        W25.class, W26.class, W27.class, W28.class,
        W29.class, W31.class, W32.class, W33.class, W34.class,
    };

    // ── AppWidgetProvider ──

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        updateAll(c); // one pass draws every widget and sets the one alarm
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        Snap s = Snap.load(c);
        long now = System.currentTimeMillis();
        m.updateAppWidget(id, draw(c, m, id, s, now));
    }

    // ── drawing ──

    /** Cells from the size the launcher gives (portrait width × portrait height, dp); 0 = unknown. */
    static int colsFor(int dp) {
        return dp <= 0 ? 0 : dp < 130 ? 1 : dp < 240 ? 2 : dp < 330 ? 3 : 4;
    }

    static int rowsFor(int dp) {
        return dp <= 0 ? 0 : dp < 160 ? 1 : dp < 270 ? 2 : dp < 380 ? 3 : 4;
    }

    private RemoteViews draw(Context c, AppWidgetManager m, int id, Snap s, long now) {
        Bundle o = m.getAppWidgetOptions(id);
        int cols = colsFor(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
        int rows = rowsFor(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT));
        try {
            return Render.build(c, kind(), cols > 0 ? cols : cols(), rows > 0 ? rows : rows(), s, now);
        } catch (RuntimeException e) {
            Log.w(TAG, "draw " + kind(), e); // a bad snapshot never leaves a broken widget: first paint
            return new RemoteViews(c.getPackageName(), R.layout.kfw_loading);
        }
    }

    /** Redraws every widget on the home screen and sets the next-change alarm. */
    public static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        Snap s = Snap.load(c);
        long now = System.currentTimeMillis();
        for (Class<?> k : ALL) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids.length == 0) continue;
            KfWidget w;
            try {
                w = (KfWidget) k.getDeclaredConstructor().newInstance();
            } catch (ReflectiveOperationException e) {
                continue;
            }
            for (int id : ids) m.updateAppWidget(id, w.draw(c, m, id, s, now));
        }
        if (s != null) {
            s.at(s.nextMidnight(now), now);
            AlarmManager alarms = c.getSystemService(AlarmManager.class);
            if (alarms != null) alarms.set(AlarmManager.RTC, s.boundary, refresh(c)); // inexact, never wakes the phone
        }
    }

    // ── taps ──

    /** Opens the app at a route (MainActivity.onNewIntent → the page's __kfWidgetOpen). */
    static PendingIntent open(Context c, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("kfwidget://open" + path))
            .setClassName(c, "com.kaisflow.garden.MainActivity")
            .putExtra(WidgetActions.EXTRA_PATH, path)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** A tick on the home screen (WidgetActions): drawn at once, applied by the app later. */
    static PendingIntent tick(Context c, String type, String id) {
        Intent i = new Intent(WidgetActions.TICK, Uri.parse("kfwidget://tick/" + type + "/" + Uri.encode(id)), c, WidgetActions.class)
            .putExtra("t", type)
            .putExtra("id", id);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent refresh(Context c) {
        Intent i = new Intent(WidgetActions.REFRESH, null, c, WidgetActions.class);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
