package com.kaisflow.garden.widgets;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.List;
import org.json.JSONObject;

/**
 * Family C, the Day bar (Kai's pick, 2026-10-26: design-export/Day strip options.html, direction 4's widget, in
 * the family style): W39 small (2×2) the bar and Next; W40 medium (4×2) as the spec draws it — the date and
 * progress, the bar, Next with its countdown, the goal strip on one line; W41 large (4×4) adds the goal's stamp,
 * the Top 3 to tick and the capture bar. The bar itself is DayBar; its look lives there and in layout/kfw_day_*.xml.
 */
final class DayBarWidgets {
    private DayBarWidgets() {}

    static RemoteViews build(Context c, int cols, int rows, int w, int h, Snap s, long now) {
        boolean small = cols <= 2;
        boolean large = !small && rows >= 3;
        int layout = small ? R.layout.kfw_day_s : large ? R.layout.kfw_day_l : R.layout.kfw_day_m;
        RemoteViews v = large ? Render.views(c, layout, R.id.slot, R.id.rows) : Render.views(c, layout, R.id.slot);
        Render.head(v, 0, s.fmt("EEE d", now), Render.progressText(s, now));
        if (!small) Render.headAdd(c, v);
        DayBar.draw(c, v, s, now, w - 26, false); // less the body's padding

        JSONObject run = Render.running(s, now);
        List<JSONObject> up = Render.upcoming(s, now);
        JSONObject next = run != null ? run : up.isEmpty() ? null : up.get(0);
        int used = 24 + 26 + 52;
        if (next != null) {
            v.addView(R.id.slot, Render.blockRow(c, s, next, run != null ? "Now" : "Next", false, run == null && !small, now));
            used += 35;
            // The small one has room for what comes after.
            if (small) for (JSONObject t : Render.after(s, now, next, Render.fit(h, used, 35))) v.addView(R.id.slot, Render.blockRow(c, s, t, "Then", false, now));
        }
        if (!small) {
            JSONObject g = Render.goalOf(s, now);
            Render.goalStrip(c, v, s, g, large ? 2 : 1, true);
            if (!large) v.setViewVisibility(R.id.goal_tag, View.GONE);
            if (large) {
                if (g != null) used += 82;
                List<JSONObject> top = Render.top3(s, now);
                int room = Render.fit(h, used + 44, 34);
                List<RemoteViews> r = new java.util.ArrayList<>();
                for (int i = g != null ? 1 : 0; i < top.size() && r.size() < room; i++) r.add(Render.taskRow(c, top.get(i), Render.len(top.get(i))));
                Render.rows(c, v, R.id.rows, r);
                Render.capbar(c, v);
            }
        }
        Render.stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar?date=" + s.day(now)));
        return v;
    }
}
