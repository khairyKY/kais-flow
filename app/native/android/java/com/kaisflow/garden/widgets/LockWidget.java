package com.kaisflow.garden.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.List;
import org.json.JSONObject;

/**
 * A · Top 3 on the lock screen (lockscreen, 2026-10-26): its own small widget, the goal first, for
 * Good Lock › LockStar (Samsung's own lock-screen picker takes only Samsung's widgets). Categories
 * home_screen|keyguard (res/xml/kfl_top3.xml). Ticks without opening the app: a real CheckBox from
 * Android 12 (res/layout-v31/kfl_top3.xml), a tappable box before. Night colours (values-night/
 * kfl_colors.xml) keep it readable on the AOD. Redrawn by LockScreen.refresh.
 */
public class LockWidget extends AppWidgetProvider {
    private static final int[] ROWS = {R.id.kfl_row1, R.id.kfl_row2, R.id.kfl_row3};
    private static final int[] BOXES = {R.id.kfl_box1, R.id.kfl_box2, R.id.kfl_box3};
    private static final int[] TITLES = {R.id.kfl_title1, R.id.kfl_title2, R.id.kfl_title3};
    /** What a row says with names off (the widgets' own mask words). */
    private static final String[] HIDDEN = {"Your goal", "Pick 2", "Pick 3"};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        LockScreen.refresh(c); // draws this and sets the next-change alarm
    }

    static boolean placed(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, LockWidget.class)).length > 0;
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, LockWidget.class));
        if (ids.length == 0) return;
        m.updateAppWidget(ids, draw(c, Snap.load(c), System.currentTimeMillis(), LockScreen.names(c)));
    }

    static RemoteViews draw(Context c, Snap s, long now, boolean names) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.kfl_top3);
        v.setOnClickPendingIntent(R.id.kfl_root, KfWidget.open(c, "/today"));
        List<JSONObject> top = s == null || !s.signedIn() ? java.util.Collections.emptyList() : Render.top3(s, now);
        int done = 0;
        for (JSONObject o : top) if (o.optBoolean("done")) done++;
        v.setTextViewText(R.id.kfl_count, top.isEmpty() ? "" : done + "/" + top.size());
        String empty = s == null || !s.signedIn() ? "Open Kai's Flow" : "Nothing starred yet";
        v.setViewVisibility(R.id.kfl_empty, top.isEmpty() ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.kfl_empty, empty);
        boolean goalFirst = s != null && s.obj("goal") != null;
        for (int i = 0; i < ROWS.length; i++) {
            if (i >= top.size()) {
                v.setViewVisibility(ROWS[i], View.GONE);
                continue;
            }
            JSONObject o = top.get(i);
            boolean isDone = o.optBoolean("done");
            String id = o.optString("id");
            String title = names ? o.optString("title") : HIDDEN[i];
            v.setViewVisibility(ROWS[i], View.VISIBLE);
            v.setTextViewText(TITLES[i], Render.struck((i == 0 && goalFirst ? "✶ " : "") + title, isDone));
            if (Build.VERSION.SDK_INT >= 31) {
                v.setCompoundButtonChecked(BOXES[i], isDone);
                v.setBoolean(BOXES[i], "setEnabled", !isDone);
                if (!isDone) v.setOnCheckedChangeResponse(BOXES[i], RemoteViews.RemoteResponse.fromPendingIntent(LockScreen.tick(c, id)));
            } else {
                v.setImageViewResource(BOXES[i], isDone ? R.drawable.kfl_box_done : R.drawable.kfl_box);
                if (!isDone) v.setOnClickPendingIntent(BOXES[i], LockScreen.tick(c, id));
            }
            v.setContentDescription(BOXES[i], (isDone ? "Done: " : "Tick: ") + title);
        }
        return v;
    }
}
