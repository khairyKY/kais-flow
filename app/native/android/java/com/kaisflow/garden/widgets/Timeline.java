package com.kaisflow.garden.widgets;

import android.content.Context;
import android.os.Build;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import org.json.JSONObject;

/**
 * The calendar's own column (Android 12+, W14 Agenda and W15 Agenda + week): hour lines, the blocks placed by
 * their times, the now line. RemoteViews has no absolute layout, so each piece is a child of one FrameLayout lane,
 * placed by its top margin and sized by its height (setViewLayoutMargin / Height, API 31). Below 12 the callers
 * draw the blocks as rows instead (ok()). The Day bar draws across the day as a bitmap (DayBar).
 */
final class Timeline {
    private Timeline() {}

    private static final int DIP = TypedValue.COMPLEX_UNIT_DIP;

    static boolean ok() {
        return Build.VERSION.SDK_INT >= 31;
    }

    private static int min(long day0, long t) {
        return (int) ((t - day0) / 60_000L);
    }

    /**
     * A calendar column into `lane` from `fromMin` (minutes after midnight) at `dpH` per hour, down to midnight
     * (the lane clips what doesn't fit). `gutter`: the hour labels' width, the blocks start after it.
     */
    static void column(Context c, RemoteViews v, int lane, Snap s, long now, int fromMin, float dpH, int gutter) {
        if (!ok()) return;
        long day0 = s.midnight(now);
        String pkg = c.getPackageName();
        for (int h = (fromMin + 59) / 60; h <= 24; h++) {
            RemoteViews r = new RemoteViews(pkg, R.layout.kfw_tl_hour);
            r.setTextViewText(R.id.tl_label, h < 24 ? s.hourLabel(day0 + h * 3_600_000L) : "");
            r.setViewLayoutWidth(R.id.tl_label, gutter, DIP);
            r.setViewLayoutMargin(R.id.tl, RemoteViews.MARGIN_TOP, (h * 60 - fromMin) * dpH / 60f - 7, DIP);
            v.addView(lane, r);
        }
        for (JSONObject b : Render.blocks(s, now)) {
            int a = Math.max(fromMin, min(day0, b.optLong("start")));
            int e = Math.min(24 * 60, min(day0, b.optLong("end")));
            if (e <= a) continue;
            float top = (a - fromMin) * dpH / 60f + 1;
            float hgt = Math.max(18, (e - a) * dpH / 60f - 3);
            RemoteViews r = new RemoteViews(pkg, R.layout.kfw_tl_block);
            String sw = Render.paint(c, r, R.id.tl, b);
            r.setTextViewText(R.id.blk_title, Render.struck(b.optString("title"), b.optBoolean("done")));
            r.setInt(R.id.blk_title, "setMaxLines", hgt >= 44 ? 2 : 1);
            if (hgt >= 32) {
                r.setTextViewText(R.id.blk_time, s.range(b.optLong("start"), b.optLong("end")));
                Render.textColor(c, r, R.id.blk_time, Render.blkInk(c, sw));
            } else {
                r.setViewVisibility(R.id.blk_time, View.GONE);
            }
            r.setViewLayoutMargin(R.id.tl, RemoteViews.MARGIN_START, gutter + 4, DIP);
            r.setViewLayoutMargin(R.id.tl, RemoteViews.MARGIN_TOP, top, DIP);
            r.setViewLayoutHeight(R.id.tl, hgt, DIP);
            if (b.optLong("end") <= now) r.setFloat(R.id.tl, "setAlpha", 0.62f);
            r.setOnClickPendingIntent(R.id.tl, Render.openBlock(c, s, b));
            v.addView(lane, r);
        }
        int n = min(day0, now);
        if (n > fromMin && n < 24 * 60) {
            RemoteViews r = new RemoteViews(pkg, R.layout.kfw_tl_now);
            r.setViewLayoutMargin(R.id.tl, RemoteViews.MARGIN_START, gutter - 5, DIP);
            r.setViewLayoutMargin(R.id.tl, RemoteViews.MARGIN_TOP, (n - fromMin) * dpH / 60f - 5, DIP);
            v.addView(lane, r); // it moves with the 30-minute update and the pushes, no faster
        }
    }

    /** Where a column starts: half an hour before now, on the half hour (the calendar's own window). */
    static int from(Snap s, long now) {
        return Math.max(0, (s.minutes(now) - 30) / 30 * 30);
    }
}
