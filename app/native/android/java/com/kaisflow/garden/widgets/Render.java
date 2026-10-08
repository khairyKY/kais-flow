package com.kaisflow.garden.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Draws one widget from the snapshot: the generator's widgets (design-integration/render_widgets.mjs,
 * W.*) in RemoteViews. Layouts carry the look (res/layout/kfw_*.xml, colours in values{,-night}, so
 * the system dark mode needs no redraw); this fills in the day, the ticks and the taps.
 */
final class Render {
    private Render() {}

    /** Widgets that only make sense signed in (Capture, Ask, Paper and Season don't need data). */
    private static boolean needsData(String kind) {
        return !(kind.equals("capture") || kind.equals("paper") || kind.equals("ask") || kind.equals("season"));
    }

    static RemoteViews build(Context c, String kind, int cols, int rows, Snap s, long now) {
        if (s == null) return new RemoteViews(c.getPackageName(), R.layout.kfw_loading); // S5 First paint
        if (!s.signedIn() && needsData(kind)) return signedOut(c);
        switch (kind) {
            case "goal": return goal(c, rows, s, now);
            case "top": return cols <= 2 ? topSmall(c, s, now) : rows >= 3 ? topPage(c, s, now) : topWide(c, cols, s, now);
            case "now": return now(c, s, now);
            case "next": return next(c, s, now);
            case "progress": return progress(c, s, now);
            default: return Families.build(c, kind, cols, rows, s, now);
        }
    }

    // ── shared pieces ──

    private static final java.util.Set<Integer> LISTS = new java.util.HashSet<>(java.util.Arrays.asList(
        R.layout.kfw_top_small, R.layout.kfw_top_wide, R.layout.kfw_top_page, R.layout.kfw_agenda, R.layout.kfw_agenda_week,
        R.layout.kfw_routines, R.layout.kfw_overdue, R.layout.kfw_slipping));

    static RemoteViews views(Context c, int layout) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        // The grain is clipped to the card's corners only from Android 12 (clipToOutline); before, none.
        if (Build.VERSION.SDK_INT < 31) v.setViewVisibility(R.id.grain, View.GONE);
        // A launcher may reapply an update onto the views it already has: lists start empty again.
        if (LISTS.contains(layout)) v.removeAllViews(R.id.rows);
        if (layout == R.layout.kfw_agenda_week || layout == R.layout.kfw_week) v.removeAllViews(R.id.days);
        return v;
    }

    static CharSequence struck(String text, boolean done) {
        if (!done) return text;
        SpannableString s = new SpannableString(text);
        s.setSpan(new StrikethroughSpan(), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    /** A text colour from a colour resource, resolved where the widget is drawn (day/night) from 12 on. */
    static void textColor(Context c, RemoteViews v, int id, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setTextColor", colorRes);
        else v.setTextColor(id, c.getColor(colorRes));
    }

    /** The checkbox: 22dp in a 44dp hit; open → a tick (WidgetActions), done → struck and inert. */
    static void box(Context c, RemoteViews v, int id, boolean done, boolean gold, String type, String taskId) {
        v.setImageViewResource(id, done ? (gold ? R.drawable.kfw_box_gold_done : R.drawable.kfw_box_done) : gold ? R.drawable.kfw_box_gold : R.drawable.kfw_box);
        v.setContentDescription(id, done ? "Done" : "Tick");
        if (!done && taskId != null && !taskId.isEmpty()) v.setOnClickPendingIntent(id, KfWidget.tick(c, type, taskId));
    }

    static String range(Snap s, JSONObject o) {
        long a = o.optLong("start");
        long b = o.optLong("end");
        if (a <= 0) return "";
        return b > a ? s.hm(a) + "–" + s.hm(b) : s.hm(a);
    }

    static PendingIntent openTask(Context c, String id) {
        return KfWidget.open(c, "/today?task=" + id);
    }

    /** A Chronometer counting down to t ("in 19:42", "1:23:05 left"); hidden once t has passed. */
    static void countdown(RemoteViews v, int id, Snap s, long t, long now, String format) {
        if (t <= now) {
            v.setViewVisibility(id, View.GONE);
            return;
        }
        v.setViewVisibility(id, View.VISIBLE);
        v.setChronometer(id, SystemClock.elapsedRealtime() + (t - now), format, true);
        v.setChronometerCountDown(id, true);
        s.at(t, now);
    }

    static void dash(Context c, RemoteViews rows) {
        rows.addView(R.id.rows, new RemoteViews(c.getPackageName(), R.layout.kfw_dash_row));
    }

    /** Today's Top 3 in order, the goal first (null-free), as the widget should show them now. */
    static List<JSONObject> top3(Snap s, long now) {
        List<JSONObject> out = new ArrayList<>();
        if (s.newDay(now)) return out; // a new day hasn't been planned yet
        JSONObject g = s.obj("goal");
        if (g != null) out.add(g);
        JSONArray p = s.arr("picks");
        for (int i = 0; i < p.length(); i++) out.add(p.optJSONObject(i));
        return out;
    }

    static int doneCount(List<JSONObject> items) {
        int n = 0;
        for (JSONObject o : items) if (o.optBoolean("done")) n++;
        return n;
    }

    /** "Day 83", counting on past the snapshot's day. */
    static int dayN(Snap s, long now) {
        long days = Math.round((s.nextMidnight(now) - s.nextMidnight(s.j.optLong("at", now))) / 86_400_000.0);
        return s.j.optInt("dayN", 1) + (int) Math.max(0, days);
    }

    /** S3 Offline / stale: the offline mark and the time the day was fresh; rows dimmed. */
    static boolean stale(RemoteViews v, Snap s, long now) {
        if (!s.stale(now)) return false;
        v.setViewVisibility(R.id.stale, View.VISIBLE);
        v.setTextViewText(R.id.stale_at, s.hm(s.j.optLong("at")));
        v.setFloat(R.id.rows, "setAlpha", 0.7f);
        return true;
    }

    // ── blocks (calendar) ──

    static List<JSONObject> blocks(Snap s, long now) {
        List<JSONObject> out = new ArrayList<>();
        JSONArray a = s.arr("blocks");
        String today = s.day(now);
        for (int i = 0; i < a.length(); i++) {
            JSONObject b = a.optJSONObject(i);
            if (b != null && (s.day(b.optLong("start")).equals(today) || b.optLong("end") > now && b.optLong("start") < now)) out.add(b);
        }
        return out;
    }

    /** Running now (start ≤ now < end), not done. */
    static JSONObject running(Snap s, long now) {
        for (JSONObject b : blocks(s, now)) {
            s.at(b.optLong("start"), now);
            s.at(b.optLong("end"), now);
            if (b.optLong("start") <= now && now < b.optLong("end") && !b.optBoolean("done")) return b;
        }
        return null;
    }

    /** The next block still to come today, not done. */
    static JSONObject upcoming(Snap s, long now) {
        for (JSONObject b : blocks(s, now)) if (b.optLong("start") > now && !b.optBoolean("done")) {
            s.at(b.optLong("start"), now);
            return b;
        }
        return null;
    }

    /** A block's colour slot (CALENDAR.md §3): the goal's gold, a named slot, or its own #hue. */
    static void rule(Context c, RemoteViews v, int id, String color) {
        int res;
        switch (color) {
            case "goal": res = R.drawable.kfw_rule_gold; break;
            case "sage": res = R.drawable.kfw_rule_sage; break;
            case "blossom": res = R.drawable.kfw_rule_blossom; break;
            case "hydrangea": res = R.drawable.kfw_rule_hydrangea; break;
            case "lavender": case "": res = R.drawable.kfw_rule_lavender; break;
            default: res = 0;
        }
        if (res != 0) {
            v.setImageViewResource(id, res);
            return;
        }
        v.setImageViewResource(id, R.drawable.kfw_mask_2);
        v.setInt(id, "setColorFilter", hue(color, Color.GRAY));
    }

    static int hue(String color, int fallback) {
        try {
            return Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    static PendingIntent openBlock(Context c, Snap s, JSONObject b) {
        String task = b.optString("taskId");
        return task.isEmpty() ? KfWidget.open(c, "/calendar?date=" + s.day(b.optLong("start"))) : openTask(c, task);
    }

    // ── states (Phone Widgets.dc.html, States) ──

    /** The shared state face: a cap, the art, a line (hand or plain), and a foot or one button. */
    static RemoteViews state(Context c, String cap, int capColor, int art, int artDp, String hand, String line, String foot, String button, PendingIntent action) {
        RemoteViews v = views(c, R.layout.kfw_state);
        v.setTextViewText(R.id.cap, cap);
        if (capColor != 0) textColor(c, v, R.id.cap, capColor);
        if (cap.isEmpty()) v.setViewVisibility(R.id.cap, View.GONE);
        v.setImageViewResource(R.id.art, art);
        if (Build.VERSION.SDK_INT >= 31) v.setViewLayoutHeight(R.id.art, artDp, android.util.TypedValue.COMPLEX_UNIT_DIP);
        if (hand != null) {
            v.setViewVisibility(R.id.hand, View.VISIBLE);
            v.setTextViewText(R.id.hand, hand);
        }
        if (line != null) {
            v.setViewVisibility(R.id.line, View.VISIBLE);
            v.setTextViewText(R.id.line, line);
        }
        if (foot != null) {
            v.setViewVisibility(R.id.foot, View.VISIBLE);
            v.setTextViewText(R.id.foot, foot);
        }
        if (button != null) {
            v.setViewVisibility(R.id.btn, View.VISIBLE);
            v.setTextViewText(R.id.btn, button);
            v.setOnClickPendingIntent(R.id.btn, action);
        }
        if (action != null) {
            v.setOnClickPendingIntent(R.id.root, action);
        }
        return v;
    }

    /** S4 Signed out: the intact seal and one button. */
    static RemoteViews signedOut(Context c) {
        RemoteViews v = state(c, "", 0, R.drawable.kfw_art_seal_intact, 48, null, "Sign in to see your day", null, null, null);
        v.setViewVisibility(R.id.btn_mid, View.VISIBLE);
        v.setTextViewText(R.id.btn_mid, "Open Kai’s Flow");
        PendingIntent open = KfWidget.open(c, "/today");
        v.setOnClickPendingIntent(R.id.btn_mid, open);
        v.setOnClickPendingIntent(R.id.root, open);
        return v;
    }

    /** S2 Nothing yet: a seedling and the way in (Plan my day). */
    static RemoteViews nothingYet(Context c, String cap, String line) {
        return state(c, cap, 0, R.drawable.kfw_art_clover_seedling, 56, null, line, null, "Plan my day", KfWidget.open(c, "/today?kfAction=plan"));
    }

    /** S1 All done: the cherry bloom, one Caveat line. */
    static RemoteViews allDone(Context c, Snap s, long now, int n) {
        String foot = s.minutes(now) < 17 * 60 ? "shut down after 17" : "time to shut down";
        return state(c, "Top 3", R.color.kfw_sage_text, R.drawable.kfw_art_cherry_bloom, 66, n == 3 ? "all three done" : "all done", null, foot, null, KfWidget.open(c, "/today"));
    }

    // ── Today ──

    /** W1 (4×1) / W2 (2×2): the goal of the day, the only gold. */
    private static RemoteViews goal(Context c, int rows, Snap s, long now) {
        JSONObject g = s.newDay(now) ? null : s.obj("goal");
        if (g == null && rows >= 2) return nothingYet(c, "✶ Goal", "No goal yet");
        RemoteViews v = views(c, rows >= 2 ? R.layout.kfw_goal_card : R.layout.kfw_goal_slim);
        if (g == null) {
            v.setTextViewText(R.id.title, "Plan my day");
            v.setViewVisibility(R.id.box, View.INVISIBLE);
            v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today?kfAction=plan"));
            return v;
        }
        boolean done = g.optBoolean("done");
        v.setTextViewText(R.id.title, struck(g.optString("title"), done));
        v.setTextViewText(R.id.time, range(s, g));
        box(c, v, R.id.box, done, true, "task", g.optString("id"));
        v.setOnClickPendingIntent(R.id.root, openTask(c, g.optString("id")));
        return v;
    }

    /** One Top 3 row (rowC): the goal's in the serif, gold box. */
    private static RemoteViews topRow(Context c, Snap s, JSONObject o, boolean goal, int layout, boolean startOnly) {
        RemoteViews r = new RemoteViews(c.getPackageName(), layout);
        boolean done = o.optBoolean("done");
        r.setTextViewText(R.id.title, struck(o.optString("title"), done));
        if (done) textColor(c, r, R.id.title, R.color.kfw_ink_faint);
        box(c, r, R.id.box, done, goal, "task", o.optString("id"));
        String time = startOnly && o.optLong("start") > 0 ? s.hm(o.optLong("start")) : "";
        if (!time.isEmpty()) {
            r.setViewVisibility(R.id.time, View.VISIBLE);
            r.setTextViewText(R.id.time, time);
            if (goal) textColor(c, r, R.id.time, R.color.kfw_gold);
        } else if (layout == R.layout.kfw_row_check_stack) {
            r.setViewVisibility(R.id.time, View.GONE);
        }
        r.setOnClickPendingIntent(R.id.title, openTask(c, o.optString("id")));
        return r;
    }

    /** W3 Top 3 · small (2×2). */
    private static RemoteViews topSmall(Context c, Snap s, long now) {
        List<JSONObject> top = top3(s, now);
        int done = doneCount(top);
        if (top.isEmpty()) return nothingYet(c, "Top 3", "Nothing starred yet");
        if (done == top.size()) return allDone(c, s, now, top.size());
        RemoteViews v = views(c, R.layout.kfw_top_small);
        v.setTextViewText(R.id.count, done + " / " + top.size());
        boolean hasGoal = s.obj("goal") != null;
        for (int i = 0; i < top.size(); i++) {
            if (i > 0) dash(c, v);
            boolean goal = i == 0 && hasGoal;
            v.addView(R.id.rows, topRow(c, s, top.get(i), goal, goal ? R.layout.kfw_row_goal : R.layout.kfw_row_check, false));
        }
        if (stale(v, s, now)) {
            v.setViewVisibility(R.id.count, View.GONE);
            v.setViewVisibility(R.id.stale_foot, View.VISIBLE);
            v.setTextViewText(R.id.stale_foot, s.j.optBoolean("offline") ? "syncs when online" : "open to refresh");
        }
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W4 Today · Top 3 (4×2). */
    private static RemoteViews topWide(Context c, int cols, Snap s, long now) {
        List<JSONObject> top = top3(s, now);
        int done = doneCount(top);
        if (top.isEmpty()) return nothingYet(c, "Top 3", "Nothing starred yet");
        if (done == top.size()) return allDone(c, s, now, top.size());
        RemoteViews v = views(c, R.layout.kfw_top_wide);
        v.setTextViewText(R.id.date, s.fmt("EEEE, MMM d", now));
        v.setTextViewText(R.id.count, (cols >= 4 ? "Day " + dayN(s, now) + " · Top 3 · " : "") + done + "/" + top.size()); // 3 columns: the count alone
        JSONObject g = s.obj("goal");
        int from = 0;
        if (g != null) {
            boolean gd = g.optBoolean("done");
            v.setTextViewText(R.id.title, struck(g.optString("title"), gd));
            v.setTextViewText(R.id.time, range(s, g));
            box(c, v, R.id.box, gd, true, "task", g.optString("id"));
            v.setOnClickPendingIntent(R.id.open, openTask(c, g.optString("id")));
            from = 1;
        } else {
            v.setViewVisibility(R.id.goal_card, View.GONE);
        }
        for (int i = from; i < top.size(); i++) {
            if (i > from) dash(c, v);
            v.addView(R.id.rows, topRow(c, s, top.get(i), false, R.layout.kfw_row_check_stack, true));
        }
        if (stale(v, s, now)) v.setViewVisibility(R.id.count, View.GONE);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W5 Today · full page (4×4). */
    private static RemoteViews topPage(Context c, Snap s, long now) {
        List<JSONObject> top = top3(s, now);
        if (top.isEmpty()) return nothingYet(c, "Today", "Nothing starred yet");
        RemoteViews v = views(c, R.layout.kfw_top_page);
        v.setTextViewText(R.id.date, s.fmt("EEEE, MMM d", now));
        int planned = s.newDay(now) ? 0 : s.j.optInt("plannedMin");
        long finish = s.j.optLong("finishAt");
        String p = planned >= 60 ? "~" + Math.round(planned / 60.0) + "h planned" : planned > 0 ? "~" + planned + "m planned" : "";
        if (finish > now) p += (p.isEmpty() ? "" : " · ") + "finish ~" + s.hm(finish);
        v.setTextViewText(R.id.planned, p);
        if (p.isEmpty()) v.setViewVisibility(R.id.planned, View.GONE);
        JSONObject g = s.obj("goal");
        int from = 0;
        if (g != null) {
            boolean gd = g.optBoolean("done");
            v.setTextViewText(R.id.title, struck(g.optString("title"), gd));
            v.setTextViewText(R.id.time, range(s, g));
            box(c, v, R.id.box, gd, true, "task", g.optString("id"));
            if (!gd) countdown(v, R.id.in, s, g.optLong("start"), now, " · in %s");
            v.setOnClickPendingIntent(R.id.open, openTask(c, g.optString("id")));
            from = 1;
        } else {
            v.setTextViewText(R.id.title, "No goal yet");
            v.setViewVisibility(R.id.box, View.INVISIBLE);
            v.setOnClickPendingIntent(R.id.open, KfWidget.open(c, "/today?kfAction=plan"));
        }
        for (int i = from; i < top.size(); i++) {
            if (i > from) dash(c, v);
            v.addView(R.id.rows, topRow(c, s, top.get(i), false, R.layout.kfw_row_check, true));
        }
        // Up next: the next block that isn't one of the picks above.
        JSONObject next = null;
        for (JSONObject b : blocks(s, now)) {
            if (b.optLong("start") <= now || b.optBoolean("done")) continue;
            boolean listed = false;
            for (JSONObject t : top) listed |= t.optString("id").equals(b.optString("taskId"));
            if (!listed) {
                next = b;
                break;
            }
        }
        if (next != null) {
            v.setTextViewText(R.id.next_title, next.optString("title"));
            v.setTextViewText(R.id.next_time, s.hm(next.optLong("start")));
            v.setOnClickPendingIntent(R.id.next, openBlock(c, s, next));
            s.at(next.optLong("start"), now);
        } else {
            v.setViewVisibility(R.id.next, View.GONE);
        }
        stale(v, s, now);
        v.setOnClickPendingIntent(R.id.add, KfWidget.open(c, "/today?kfAction=capture"));
        v.setOnClickPendingIntent(R.id.capture, KfWidget.open(c, "/today?kfAction=capture"));
        v.setOnClickPendingIntent(R.id.mic, KfWidget.open(c, "/today?kfAction=voice"));
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W6 Now (4×2): the running block, else the next one. */
    private static RemoteViews now(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_now);
        JSONObject run = running(s, now);
        JSONObject b = run != null ? run : upcoming(s, now);
        if (b == null) {
            v.setTextViewText(R.id.title, "Nothing on the calendar");
            textColor(c, v, R.id.title, R.color.kfw_ink_muted);
            v.setViewVisibility(R.id.bar, View.GONE);
            v.setViewVisibility(R.id.done, View.GONE);
            v.setViewVisibility(R.id.rule, View.INVISIBLE);
            v.setOnClickPendingIntent(R.id.focus, KfWidget.open(c, "/focus?kfAction=focus-start"));
            v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar"));
            return v;
        }
        long a = b.optLong("start");
        long e = b.optLong("end");
        v.setTextViewText(R.id.title, b.optString("title"));
        v.setTextViewText(R.id.time, range(s, b));
        rule(c, v, R.id.rule, b.optString("color"));
        if (run != null) {
            countdown(v, R.id.left, s, e, now, " · %s left");
            v.setProgressBar(R.id.bar, 1000, (int) (1000 * (now - a) / Math.max(1, e - a)), false);
        } else {
            v.setTextViewText(R.id.cap, "Next · " + s.hm(a));
            textColor(c, v, R.id.cap, R.color.kfw_ink_faint);
            countdown(v, R.id.left, s, a, now, " · in %s");
            v.setViewVisibility(R.id.bar, View.GONE);
        }
        String task = b.optString("taskId");
        v.setOnClickPendingIntent(R.id.focus, KfWidget.open(c, "/focus?kfAction=focus-start" + (task.isEmpty() ? "" : "&kfTasks=" + task)));
        if (task.isEmpty()) v.setViewVisibility(R.id.done, View.GONE);
        else v.setOnClickPendingIntent(R.id.done, KfWidget.tick(c, "task", task));
        v.setOnClickPendingIntent(R.id.open, openBlock(c, s, b));
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W7 Up next · tiny (2×1). */
    private static RemoteViews next(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_next);
        JSONObject run = running(s, now);
        JSONObject b = upcoming(s, now);
        if (b == null) b = run;
        if (b == null) {
            v.setTextViewText(R.id.cap, "Next");
            v.setTextViewText(R.id.title, "Nothing else today");
            textColor(c, v, R.id.title, R.color.kfw_ink_muted);
            v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar"));
            return v;
        }
        v.setTextViewText(R.id.cap, b == run ? "Now" : "Next · " + s.hm(b.optLong("start")));
        v.setTextViewText(R.id.title, b.optString("title"));
        rule(c, v, R.id.rule, b.optString("color"));
        v.setOnClickPendingIntent(R.id.root, openBlock(c, s, b));
        return v;
    }

    /** W8 Day progress (4×1). */
    private static RemoteViews progress(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_progress);
        JSONObject p = s.obj("progress");
        int done = p == null || s.newDay(now) ? 0 : p.optInt("done");
        int total = p == null || s.newDay(now) ? 0 : p.optInt("total");
        v.setTextViewText(R.id.title, total == 0 ? "Nothing planned yet" : done + " of " + total + " done");
        long finish = s.j.optLong("finishAt");
        v.setTextViewText(R.id.time, finish > now && done < total ? "finish ~" + s.hm(finish) : "");
        v.setProgressBar(R.id.bar, 1000, total == 0 ? 0 : 1000 * done / total, false);
        v.setImageViewResource(R.id.art, total > 0 && done * 2 >= total ? R.drawable.kfw_art_wisteria_p80 : R.drawable.kfw_art_wisteria_p40);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }
}
