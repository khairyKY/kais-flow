package com.kaisflow.garden.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The Focus widget's bar (Focus D3, design-export/Focus redesign.html): the session's segments side by side, focus
 * rounds in the block's colour, breaks in sage; a kept one filled, the one under way filled to how far through it is,
 * the rest pale. Like the Day bar (DayBar) it is a bitmap, one per theme (layout{,-night}/kfw_focusbar.xml shows the
 * right one), redrawn with the widget on the minute tick, so the fill can be up to a minute behind (the countdown
 * above it is a Chronometer and stays live). No flowers: those are the desktop Focus page's.
 */
final class FocusBar {
    private FocusBar() {}

    static final int KEPT = 0;
    static final int NOW = 1;
    static final int TODO = 2;

    /** One segment: a round (focus) or a break, its minutes, and KEPT / NOW / TODO. */
    static final class Seg {
        final boolean focus;
        final int min;
        final int state;

        Seg(boolean focus, int min, int state) {
            this.focus = focus;
            this.min = min;
            this.state = state;
        }
    }

    /** The snapshot's segments; none (an older snapshot) is the one round or break under way, `min` long. */
    static List<Seg> parse(JSONArray a, boolean onBreak, int min) {
        List<Seg> out = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject g = a.optJSONObject(i);
            if (g == null) continue;
            String st = g.optString("state");
            out.add(new Seg(!"break".equals(g.optString("kind")), Math.max(1, g.optInt("min", 1)), "kept".equals(st) ? KEPT : "now".equals(st) ? NOW : TODO));
        }
        if (out.isEmpty()) out.add(new Seg(!onBreak, Math.max(1, min), NOW));
        return out;
    }

    /** Each segment's left and right edge ([x0, x1, x0, x1 …]): widths follow the minutes, `gap` between. */
    static float[] spans(int[] mins, float width, float gap) {
        int n = mins.length;
        float[] out = new float[2 * n];
        float total = 0;
        for (int m : mins) total += Math.max(1, m);
        float room = Math.max(0, width - gap * (n - 1));
        float x = 0;
        for (int i = 0; i < n; i++) {
            float w = room * Math.max(1, mins[i]) / total;
            out[2 * i] = x;
            out[2 * i + 1] = x + w;
            x += w + gap;
        }
        return out;
    }

    /** How far through a segment of `min` minutes, with `leftMs` still to go (0..1). */
    static float frac(long leftMs, int min) {
        return Math.min(1f, Math.max(0f, 1f - leftMs / (Math.max(1, min) * 60_000f)));
    }

    /** The bar into the layout's two images (kfw_focusbar.xml); `sw` is the block's swatch, `leftMs` what the "now" segment has left. */
    static void draw(Context c, RemoteViews v, List<Seg> segs, String sw, long leftMs, float widthDp, float heightDp) {
        v.setImageViewBitmap(R.id.fbar_day, bitmap(DayBar.theme(c, false), segs, sw, leftMs, widthDp, heightDp));
        v.setImageViewBitmap(R.id.fbar_night, bitmap(DayBar.theme(c, true), segs, sw, leftMs, widthDp, heightDp));
    }

    private static Bitmap bitmap(Context c, List<Seg> segs, String sw, long leftMs, float widthDp, float heightDp) {
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.max(1, Math.round(widthDp * d));
        int h = Math.max(1, Math.round(heightDp * d));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int[] mins = new int[segs.size()];
        for (int i = 0; i < mins.length; i++) mins[i] = segs.get(i).min;
        float[] x = spans(mins, w, 2 * d);
        int accent = c.getColor(Render.blkAccent(c, sw));
        int sage = c.getColor(R.color.kfw_sage);
        float r = Math.min(4 * d, h / 2f);
        for (int i = 0; i < mins.length; i++) {
            Seg g = segs.get(i);
            int tone = g.focus ? accent : sage;
            RectF box = new RectF(x[2 * i], 0, x[2 * i + 1], h);
            // CSS FocusTimeline: a focus round full / 28%, a break 75% / 22%.
            p.setColor(tone);
            p.setAlpha(g.focus ? 71 : 56);
            cv.drawRoundRect(box, r, r, p);
            if (g.state == TODO) continue;
            p.setColor(tone);
            p.setAlpha(g.focus ? 255 : 191);
            cv.save();
            if (g.state == NOW) cv.clipRect(box.left, 0, box.left + (box.right - box.left) * frac(leftMs, g.min), h);
            cv.drawRoundRect(box, r, r, p);
            cv.restore();
        }
        return bmp;
    }
}
