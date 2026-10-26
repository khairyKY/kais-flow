package com.kaisflow.garden.widgets;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.List;
import org.json.JSONObject;

/**
 * The Day bar (design-export/Day strip options.html, direction 4, Kai's pick for family C): the whole day, 7 AM to
 * 11 PM, in one bar — blocks as pills in palette C, an overlapping block on a thin second lane, the goal's gold
 * underline, the rituals as a sun and a moon, a lavender tick for now, the hours under it. RemoteViews can't place
 * views by time, so the bar is a bitmap (one per theme: layout{,-night}/kfw_daybar.xml shows the right one, so the
 * system dark mode needs no redraw). It is redrawn with the widget: when a block starts or ends, on the app's
 * pushes, and every 30 minutes — so the now tick can be up to 30 minutes behind between them.
 * `slim`: Day progress's 10dp strip (one lane, no marks or hours).
 */
final class DayBar {
    private DayBar() {}

    private static final int FROM = 7;
    private static final int TO = 23;
    /** ponytail: the morning ritual has no clock time in the app; the sun sits at 7:30 as the design draws it. */
    private static final int SUN_MIN = 7 * 60 + 30;
    /** Shut down opens at 5 PM (features/today/dayPhase SHUTDOWN_FROM). */
    private static final int MOON_MIN = 17 * 60;

    static void draw(Context c, RemoteViews v, Snap s, long now, float widthDp, boolean slim) {
        v.setImageViewBitmap(R.id.bar_day, bitmap(theme(c, false), s, now, widthDp, slim));
        v.setImageViewBitmap(R.id.bar_night, bitmap(theme(c, true), s, now, widthDp, slim));
        v.setOnClickPendingIntent(R.id.bar, KfWidget.open(c, "/calendar?date=" + s.day(now)));
    }

    private static Context theme(Context c, boolean night) {
        Configuration conf = new Configuration(c.getResources().getConfiguration());
        conf.uiMode = (conf.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (night ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        return c.createConfigurationContext(conf);
    }

    /** a at t, b at 1 − t (the CSS's color-mix(a t, b)). */
    private static int mix(int a, int b, float t) {
        return Color.rgb(
            Math.round(Color.red(a) * t + Color.red(b) * (1 - t)),
            Math.round(Color.green(a) * t + Color.green(b) * (1 - t)),
            Math.round(Color.blue(a) * t + Color.blue(b) * (1 - t)));
    }

    private static Bitmap bitmap(Context c, Snap s, long now, float widthDp, boolean slim) {
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.max(1, Math.round(widthDp * d));
        int h = Math.round((slim ? 10 : 44) * d);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float per = w / ((TO - FROM) * 60f);
        long day0 = s.midnight(now);
        float railTop = slim ? 0 : 12 * d;
        float railH = slim ? h : 12 * d;

        p.setColor(c.getColor(R.color.kfw_track));
        cv.drawRoundRect(new RectF(0, railTop, w, railTop + railH), railH / 2, railH / 2, p);

        int paper = c.getColor(R.color.kfw_parchment);
        long lane0End = 0;
        List<JSONObject> blocks = Render.blocks(s, now);
        for (JSONObject b : blocks) {
            long a = b.optLong("start");
            long e = b.optLong("end");
            float x0 = Math.max(0, ((a - day0) / 60_000f - FROM * 60) * per);
            float x1 = Math.min(w, ((e - day0) / 60_000f - FROM * 60) * per);
            if (x1 - x0 < 1) continue;
            boolean second = !slim && a < lane0End;
            if (!second) lane0End = Math.max(lane0End, e);
            String sw = Render.swatch(b);
            int accent = c.getColor(Render.blkAccent(c, sw));
            float top = second ? 26 * d : railTop;
            float hh = second ? 7 * d : railH;
            float r = (second ? 3 : slim ? 3 : 4) * d;
            RectF box = new RectF(x0 + d, top, x1 - d, top + hh);
            p.setStyle(Paint.Style.FILL);
            p.setColor(slim ? c.getColor(Render.res(c, "color", "kfw_blk_" + sw + "_fill")) : mix(accent, paper, 0.75f));
            p.setAlpha(e <= now ? (slim ? 153 : 128) : 255);
            cv.drawRoundRect(box, r, r, p);
            if (slim) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(d);
                p.setColor(c.getColor(Render.res(c, "color", "kfw_blk_" + sw + "_edge")));
                cv.drawRoundRect(box, r, r, p);
                p.setStyle(Paint.Style.FILL);
            }
            if (Render.goalBlock(b) && !second) {
                p.setColor(c.getColor(R.color.kfw_gold_warm));
                cv.save();
                cv.clipRect(box.left, box.bottom - 3 * d, box.right, box.bottom);
                cv.drawRoundRect(box, r, r, p);
                cv.restore();
            }
            p.setAlpha(255);
        }

        float nx = ((now - day0) / 60_000f - FROM * 60) * per;
        if (nx > 0 && nx < w) {
            p.setColor(c.getColor(R.color.kfw_lavender));
            float t0 = slim ? 0 : 8 * d;
            float t1 = slim ? h : 36 * d;
            cv.drawRoundRect(new RectF(nx - d, t0, nx + d, t1), d, d, p);
        }
        if (slim) return bmp;

        p.setTextAlign(Paint.Align.CENTER);
        p.setTextSize(10 * d);
        p.setColor(c.getColor(R.color.kfw_gold));
        cv.drawText("☀", (SUN_MIN - FROM * 60) * per, 10 * d, p);
        p.setColor(c.getColor(R.color.kfw_lavender_text));
        cv.drawText("☾", (MOON_MIN - FROM * 60) * per, 10 * d, p);

        p.setTypeface(Typeface.DEFAULT);
        p.setColor(c.getColor(R.color.kfw_ink_faint));
        for (int hr = 8; hr <= 20; hr += 4) {
            String label = s.j.optBoolean("hour24") ? String.valueOf(hr) : (hr % 12 == 0 ? 12 : hr % 12) + (hr < 12 ? "am" : "pm");
            cv.drawText(label, (hr - FROM) * 60 * per, h - 1 * d, p);
        }
        return bmp;
    }
}
