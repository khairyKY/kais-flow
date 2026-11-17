package com.kaisflow.garden.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * W42 Her day (4×2; Partner sharing P2, design-export/Partner sharing P2 flows.html flow 6): the person you share with, her
 * now and next, and at Details her goal and Top 3 count. One size, one look (the Now card family, her blocks with a dashed edge, in
 * the colour the viewer gave her: `partner.color`, a palette C swatch, Heather until picked), no editing: a tap opens the app. It draws only the snapshot's `partner` slice, which the app builds from the
 * server's masked day (src/features/widgets/partnerSnapshot.ts), so it can never show more than the level you both allow.
 *
 *   no `partner`   nobody connected, or the connection ended / was stopped: the widget says so and keeps nothing (the app
 *                  writes `partner: null` on its next refresh, which replaces the whole snapshot)
 *   paused         her name and when it ends, no blocks
 *   out of date    the app has not read her day for 24 hours (HerDayPlan.STALE_MS): greyed, every title "Busy", no goal
 */
final class HerDay {
    private HerDay() {}

    static RemoteViews build(Context c, int h, Snap s, long now) {
        JSONObject p = s.obj("partner");
        PendingIntent today = KfWidget.open(c, "/today");
        if (p == null) {
            return Render.state(c, "Her day", 0, R.drawable.kfw_art_clover_seedling, 56, null, "Share your day with someone", null, "Open Sharing", KfWidget.open(c, "/settings/sharing"));
        }
        String name = p.optString("name", "");
        if (p.optBoolean("paused")) {
            long until = p.optLong("pausedUntil");
            String line = name + " paused sharing" + (until > now ? ". Back " + (s.day(until).equals(s.day(now)) ? "" : "tomorrow ") + "at " + s.hm(until) : "");
            if (until > now) s.at(until, now);
            return Render.state(c, "Her day", 0, R.drawable.kfw_art_clover_seedling, 56, null, line, null, null, today);
        }
        long at = p.optLong("at");
        boolean stale = HerDayPlan.stale(at, now);
        List<HerDayPlan.Blk> blocks = new ArrayList<>();
        JSONArray a = p.optJSONArray("blocks");
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject b = a.optJSONObject(i);
            if (b != null) blocks.add(new HerDayPlan.Blk(b.optLong("start"), b.optLong("end"), b.isNull("title") ? null : b.optString("title")));
        }
        long change = HerDayPlan.nextChange(blocks, now, at);
        if (change > 0) s.at(change, now);

        RemoteViews v = Render.views(c, R.layout.kfw_herday, R.id.rows);
        String level = p.optString("level");
        String sw = swatch(p);
        v.setInt(R.id.her_av, "setBackgroundResource", Render.res(c, "drawable", "kfw_circle_her_" + sw));
        Render.textColor(c, v, R.id.her_av, Render.blkInk(c, sw));
        v.setTextViewText(R.id.her_av, name.isEmpty() ? "?" : name.substring(0, name.offsetByCodePoints(0, 1)).toUpperCase());
        v.setTextViewText(R.id.head, name);
        v.setTextViewText(R.id.head_q, "· " + (level.equals("busy") ? "Busy only" : level.equals("titles") ? "Titles" : "Details"));
        JSONObject top = p.optJSONObject("top");
        if (!stale && top != null && top.optInt("total") > 0) {
            v.setViewVisibility(R.id.head_r, View.VISIBLE);
            v.setTextViewText(R.id.head_r, "Top 3 · " + top.optInt("done") + "/" + top.optInt("total"));
        }

        HerDayPlan.Blk running = HerDayPlan.running(blocks, now);
        // The rows that fit under the header (and the goal row, when there is one): her block now, then what is next.
        JSONObject goal = p.optJSONObject("goal");
        boolean showGoal = !stale && goal != null;
        int room = Math.max(1, Math.min(2, Render.fit(h, 24 + 26 + (showGoal ? 26 : 0), 35)));
        List<HerDayPlan.Blk> next = HerDayPlan.next(blocks, now, running != null ? room - 1 : room);
        if (running != null) v.addView(R.id.rows, row(c, s, running, "Now", stale, now, true, sw));
        for (int i = 0; i < next.size(); i++) v.addView(R.id.rows, row(c, s, next.get(i), running == null && i == 0 ? "Next" : null, stale, now, false, sw));
        if (running == null && next.isEmpty()) {
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, "Nothing else today");
        }
        if (showGoal) {
            v.setViewVisibility(R.id.goal_row, View.VISIBLE);
            String t = goal.isNull("title") ? "Her goal of the day" : goal.optString("title");
            v.setTextViewText(R.id.goal_t, Render.struck(t, goal.optBoolean("done")));
        }
        if (stale) {
            v.setViewVisibility(R.id.stale, View.VISIBLE);
            v.setTextViewText(R.id.stale_at, "Out of date · " + s.hm(at));
            v.setFloat(R.id.body, "setAlpha", 0.55f);
        }
        v.setOnClickPendingIntent(R.id.root, today);
        return v;
    }

    /** Her colour: the snapshot's swatch name when it is one of palette C's 16, else Heather (a snapshot from before the colour was pickable). */
    static String swatch(JSONObject p) {
        String sw = p.optString("color").toLowerCase(java.util.Locale.ROOT);
        return Render.SWATCHES.contains(sw) ? sw : "heather";
    }

    /** A block of hers as a row in her colour, dashed: `label` (Now, Next) first, its start, its title ("Busy" without one). */
    private static RemoteViews row(Context c, Snap s, HerDayPlan.Blk b, String label, boolean stale, long now, boolean running, String sw) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.kfw_row_blk);
        r.setInt(R.id.blk, "setBackgroundResource", Render.res(c, "drawable", "kfw_blk_her_" + sw));
        if (label != null) {
            r.setViewVisibility(R.id.blk_label, View.VISIBLE);
            r.setTextViewText(R.id.blk_label, label);
        }
        r.setTextViewText(R.id.blk_time, s.hmc(b.start));
        Render.textColor(c, r, R.id.blk_time, Render.blkInk(c, sw));
        String title = HerDayPlan.title(b, stale);
        r.setTextViewText(R.id.blk_title, title);
        if (title.equals("Busy")) Render.textColor(c, r, R.id.blk_title, R.color.kfw_ink_muted);
        if (running && !stale) Render.countdown(r, R.id.blk_cd, s, b.end, now, "%s left");
        return r;
    }
}
