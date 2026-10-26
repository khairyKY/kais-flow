package com.kaisflow.garden.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Draws one widget from the snapshot. The family style (widgets-build 2026-10-26, design-export/Phone home
 * options.html): the layouts carry the look (res/layout/kfw_*.xml; colours in values{,-night}, so the system dark
 * mode needs no redraw), the shared pieces below fill them — the header, the paper goal strip, a row to tick, a
 * palette C block, the Now card, the capture bar. This file has Today's widgets and the two families built on
 * them (A · Checklist, B · Now card); Families has the rest, DayBarWidgets family C (the Day bar).
 */
final class Render {
    private Render() {}

    /** Widgets that only make sense signed in (Capture, Ask, Paper and Season don't need data). */
    private static boolean needsData(String kind) {
        return !(kind.equals("capture") || kind.equals("paper") || kind.equals("ask") || kind.equals("season"));
    }

    /** `w` × `h`: the widget's size in dp as the launcher reports it (portrait), for what fits. */
    static RemoteViews build(Context c, String kind, int cols, int rows, int w, int h, Snap s, long now) {
        if (s == null) return new RemoteViews(c.getPackageName(), R.layout.kfw_loading); // S5 First paint
        if (!s.signedIn() && needsData(kind)) return signedOut(c);
        switch (kind) {
            case "goal": return goal(c, rows, s, now);
            // A · Checklist: W03 (small), W35 (medium), W36 (large), by the size it's given.
            case "check": return cols <= 2 ? checkSmall(c, h, s, now) : rows >= 3 ? checkLarge(c, h, s, now) : checkMedium(c, h, s, now);
            // W04 Today · Top 3; resized it becomes the Checklist small or the Now card large.
            case "top": return cols <= 2 ? checkSmall(c, h, s, now) : rows >= 3 ? nowLarge(c, h, s, now) : top(c, h, s, now);
            // B · Now card: W37 (small), W38 (medium), W05 (large).
            case "nowcard": return cols <= 2 ? nowSmall(c, s, now) : rows >= 3 ? nowLarge(c, h, s, now) : nowMedium(c, h, s, now);
            case "now": return cols <= 2 ? nowSmall(c, s, now) : now(c, s, now);
            case "next": return next(c, s, now);
            case "progress": return progress(c, w, s, now);
            case "daybar": return DayBarWidgets.build(c, cols, rows, w, h, s, now);
            default: return Families.build(c, kind, cols, rows, w, h, s, now);
        }
    }

    // ── shared pieces ──

    /** A widget's views; the containers named are emptied (a launcher may reapply an update onto the views it has). */
    static RemoteViews views(Context c, int layout, int... lists) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        for (int id : lists) v.removeAllViews(id);
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

    /** An icon or a line drawing in a colour resource (day/night from 12 on, as drawn before). */
    static void tint(Context c, RemoteViews v, int id, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setImageTintList", colorRes);
        else v.setInt(id, "setColorFilter", c.getColor(colorRes));
    }

    /** A progress line or ring in a colour resource; before 12 it keeps its drawable's muted ink. */
    static void barTint(RemoteViews v, int id, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setProgressTintList", colorRes);
    }

    /**
     * The checkbox (layout/kfw_box*.xml). Android 12+: a real CheckBox that ticks on the home screen at once and
     * sends the tick (WidgetActions); a done one stays checked and can't be unticked here. Before 12: the paper box
     * image, a tap is the same tick. `gold` only matters before 12 (the layout picks the goal's box from 12 on).
     */
    static void box(Context c, RemoteViews v, int id, boolean done, boolean gold, String type, String taskId) {
        boolean can = !done && taskId != null && !taskId.isEmpty();
        v.setContentDescription(id, done ? "Done" : gold ? "Tick the goal" : "Tick");
        if (Build.VERSION.SDK_INT >= 31) {
            v.setCompoundButtonChecked(id, done);
            v.setBoolean(id, "setEnabled", can);
            if (can) v.setOnCheckedChangeResponse(id, RemoteViews.RemoteResponse.fromPendingIntent(KfWidget.tick(c, type, taskId)));
            return;
        }
        v.setImageViewResource(id, done ? (gold ? R.drawable.kfw_box_gold_done : R.drawable.kfw_box_done) : gold ? R.drawable.kfw_box_gold : R.drawable.kfw_box);
        if (can) v.setOnClickPendingIntent(id, KfWidget.tick(c, type, taskId));
    }

    /** The header (layout/kfw_head.xml): a line icon (0 = none), the label, its quiet half. */
    static void head(RemoteViews v, int icon, String label, String q) {
        if (icon != 0) {
            v.setViewVisibility(R.id.head_icon, View.VISIBLE);
            v.setImageViewResource(R.id.head_icon, icon);
        }
        v.setTextViewText(R.id.head, label);
        v.setTextViewText(R.id.head_q, q == null || q.isEmpty() ? "" : "· " + q);
    }

    /** A quiet word on the header's right ("0/3", "11:00"). */
    static void headRight(RemoteViews v, String text) {
        if (text == null || text.isEmpty()) return;
        v.setViewVisibility(R.id.head_r, View.VISIBLE);
        v.setTextViewText(R.id.head_r, text);
    }

    /** The terra + on the header's right: capture. */
    static void headAdd(Context c, RemoteViews v) {
        v.setViewVisibility(R.id.add, View.VISIBLE);
        v.setOnClickPendingIntent(R.id.add, KfWidget.open(c, "/today?kfAction=capture"));
    }

    /** The paper goal strip (layout/kfw_goal_strip.xml), or nothing without a goal. */
    static void goalStrip(Context c, RemoteViews v, Snap s, JSONObject g, int lines, boolean full) {
        if (g == null) {
            v.setViewVisibility(R.id.goal, View.GONE);
            return;
        }
        boolean done = g.optBoolean("done");
        v.setTextViewText(R.id.goal_title, struck(g.optString("title"), done));
        v.setInt(R.id.goal_title, "setMaxLines", lines);
        String when = range(s, g);
        v.setTextViewText(R.id.goal_tag, (full ? "✶ Goal of the day" : "✶ Goal") + (when.isEmpty() ? "" : " · " + when));
        box(c, v, R.id.box, done, true, "task", g.optString("id"));
        v.setOnClickPendingIntent(R.id.goal_open, openTask(c, g.optString("id")));
    }

    /** A row to tick (layout/kfw_row_task.xml), with its length or time on the right. */
    static RemoteViews taskRow(Context c, JSONObject o, String meta) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.kfw_row_task);
        boolean done = o.optBoolean("done");
        r.setTextViewText(R.id.title, struck(o.optString("title"), done));
        if (done) textColor(c, r, R.id.title, R.color.kfw_ink_faint);
        box(c, r, R.id.box, done, false, "task", o.optString("id"));
        if (meta != null && !meta.isEmpty()) {
            r.setViewVisibility(R.id.time, View.VISIBLE);
            r.setTextViewText(R.id.time, meta);
        }
        r.setOnClickPendingIntent(R.id.title, openTask(c, o.optString("id")));
        return r;
    }

    /** Rows into a container, a hairline between them. */
    static void rows(Context c, RemoteViews v, int list, List<RemoteViews> rows) {
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) v.addView(list, new RemoteViews(c.getPackageName(), R.layout.kfw_dash_row));
            v.addView(list, rows.get(i));
        }
    }

    /** How many rows of `rowDp` fit in `h` after `used` dp. */
    static int fit(int h, int used, int rowDp) {
        return Math.max(0, (h - used) / rowDp);
    }

    /** "1h 30m", "20m": a timed item's length; "" when it has none. */
    static String len(JSONObject o) {
        long a = o.optLong("start");
        long b = o.optLong("end");
        if (a <= 0 || b <= a) return "";
        int m = (int) ((b - a) / 60_000);
        return m >= 60 ? m / 60 + "h" + (m % 60 > 0 ? " " + m % 60 + "m" : "") : m + "m";
    }

    static String range(Snap s, JSONObject o) {
        long a = o.optLong("start");
        return a <= 0 ? "" : s.range(a, o.optLong("end"));
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

    /** Today's tasks (not the Top 3), as the snapshot lists them; none on a new day before the app has run. */
    static List<JSONObject> tasks(Snap s, long now) {
        List<JSONObject> out = new ArrayList<>();
        if (s.newDay(now)) return out;
        JSONArray a = s.arr("tasks");
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i) != null) out.add(a.optJSONObject(i));
        return out;
    }

    static JSONObject goalOf(Snap s, long now) {
        return s.newDay(now) ? null : s.obj("goal");
    }

    static int doneCount(List<JSONObject> items) {
        int n = 0;
        for (JSONObject o : items) if (o.optBoolean("done")) n++;
        return n;
    }

    /** "1 of 8 done" — the day's progress; "" before anything's planned. */
    static String progressText(Snap s, long now) {
        JSONObject p = s.obj("progress");
        int total = p == null || s.newDay(now) ? 0 : p.optInt("total");
        return total == 0 ? "" : p.optInt("done") + " of " + total + " done";
    }

    /** S3 Offline / stale: the offline mark and the time the day was fresh; rows dimmed. */
    static boolean stale(RemoteViews v, Snap s, long now) {
        if (!s.stale(now)) return false;
        v.setViewVisibility(R.id.stale, View.VISIBLE);
        v.setTextViewText(R.id.stale_at, s.hm(s.j.optLong("at")));
        v.setFloat(R.id.body, "setAlpha", 0.8f);
        return true;
    }

    // ── blocks (calendar), palette C ──

    /** Palette C (app/src/styles/tokens/colors.css --blk-*, values/kfw_palette.xml). */
    static final List<String> SWATCHES = Arrays.asList("rose", "clay", "ochre", "olive", "fern", "lagoon", "cornflower", "iris",
        "wine", "rust", "honey", "moss", "pine", "tide", "indigo", "heather");
    /** A snapshot written before palette C (kept until the app next pushes): its names and hexes as the new swatch
     *  (calendar/blockHue nearestSwatch; a task or Time block Iris, an event Rose). */
    private static final Map<String, String> LEGACY = new HashMap<>();
    static {
        String[] m = {"goal", "iris", "lavender", "iris", "", "iris", "blossom", "rose", "sage", "moss", "hydrangea", "lagoon",
            "#a8a0be", "iris", "#8a9a7e", "moss", "#7a946e", "moss", "#b5654a", "rust", "#d4a8b0", "rose", "#9ab4be", "lagoon",
            "#d4c78a", "ochre", "#c9a0a0", "rose", "#c9a55a", "ochre",
            "#e58f99", "rose", "#e29572", "clay", "#c9a658", "ochre", "#a0b569", "olive", "#72bf8e", "fern", "#47bfc5", "lagoon",
            "#81aded", "cornflower", "#b59ce3", "iris", "#b36670", "wine", "#b16c4c", "rust", "#9c7b31", "honey", "#768a42", "moss",
            "#4a9266", "pine", "#0d9298", "tide", "#5a81bc", "indigo", "#8972b3", "heather"};
        for (int i = 0; i < m.length; i += 2) LEGACY.put(m[i], m[i + 1]);
    }

    static String swatch(JSONObject b) {
        String c = b.optString("color").toLowerCase(Locale.ROOT);
        if (SWATCHES.contains(c)) return c;
        String m = LEGACY.get(c);
        return m != null ? m : "iris";
    }

    static boolean goalBlock(JSONObject b) {
        return b.optBoolean("goal") || "goal".equals(b.optString("color"));
    }

    private static final Map<String, Integer> IDS = new HashMap<>();

    static int res(Context c, String type, String name) {
        String key = type + "/" + name;
        Integer id = IDS.get(key);
        if (id == null) {
            id = c.getResources().getIdentifier(name, type, c.getPackageName());
            IDS.put(key, id);
        }
        return id;
    }

    static int blkFill(Context c, String sw) {
        return res(c, "drawable", "kfw_blk_" + sw);
    }

    static int blkInk(Context c, String sw) {
        return res(c, "color", "kfw_blk_" + sw + "_ink");
    }

    static int blkAccent(Context c, String sw) {
        return res(c, "color", "kfw_blk_" + sw);
    }

    /** A block's look on `root`: its swatch's fill and edge, the goal's gold rule (blk_goal) and ✶ (blk_star),
     *  the check square for a task (blk_k), in the swatch's text tone. Returns the swatch. */
    static String paint(Context c, RemoteViews r, int root, JSONObject b) {
        String sw = swatch(b);
        r.setInt(root, "setBackgroundResource", blkFill(c, sw));
        if (goalBlock(b)) {
            r.setViewVisibility(R.id.blk_goal, View.VISIBLE);
            r.setViewVisibility(R.id.blk_star, View.VISIBLE); // a layout without one ignores it
        }
        if (!b.optString("taskId").isEmpty()) {
            r.setViewVisibility(R.id.blk_k, View.VISIBLE);
            tint(c, r, R.id.blk_k, blkInk(c, sw));
        }
        return sw;
    }

    /** A block as a row (layout/kfw_row_blk.xml): `label` (Next, Then) first, its start, the title, `end` after
     *  (its end time; `cd` instead: a live "in 19:42" to its start). */
    static RemoteViews blockRow(Context c, Snap s, JSONObject b, String label, boolean end, long now) {
        return blockRow(c, s, b, label, end, false, now);
    }

    static RemoteViews blockRow(Context c, Snap s, JSONObject b, String label, boolean end, boolean cd, long now) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.kfw_row_blk);
        String sw = paint(c, r, R.id.blk, b);
        if (label != null) {
            r.setViewVisibility(R.id.blk_label, View.VISIBLE);
            r.setTextViewText(R.id.blk_label, label);
        }
        r.setTextViewText(R.id.blk_time, s.hmc(b.optLong("start")));
        textColor(c, r, R.id.blk_time, blkInk(c, sw));
        boolean past = b.optLong("end") <= now;
        r.setTextViewText(R.id.blk_title, struck(b.optString("title"), past || b.optBoolean("done")));
        if (end) {
            r.setViewVisibility(R.id.blk_end, View.VISIBLE);
            r.setTextViewText(R.id.blk_end, s.hmc(b.optLong("end")));
        }
        if (cd) countdown(r, R.id.blk_cd, s, b.optLong("start"), now, "in %s");
        if (past) r.setFloat(R.id.blk, "setAlpha", 0.62f);
        r.setOnClickPendingIntent(R.id.blk, openBlock(c, s, b));
        return r;
    }

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

    /** The blocks still to come today, not done, in order. */
    static List<JSONObject> upcoming(Snap s, long now) {
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject b : blocks(s, now)) if (b.optLong("start") > now && !b.optBoolean("done")) {
            s.at(b.optLong("start"), now);
            out.add(b);
        }
        return out;
    }

    static PendingIntent openBlock(Context c, Snap s, JSONObject b) {
        String task = b.optString("taskId");
        return task.isEmpty() ? KfWidget.open(c, "/calendar?date=" + s.day(b.optLong("start"))) : openTask(c, task);
    }

    // ── the Now card (layout/kfw_nowhead.xml) ──

    /**
     * The calendar's Now card: the running block, else the next one, in its palette C colour — the header with its
     * times and a live countdown (or, `small`, the start on the right), the ring and the title on `lines` lines,
     * the progress line, the times under it (`times`). Returns the block, or null when nothing's left today.
     */
    static JSONObject nowHead(Context c, RemoteViews v, Snap s, long now, int lines, boolean small, boolean times) {
        JSONObject run = running(s, now);
        List<JSONObject> next = upcoming(s, now);
        JSONObject b = run != null ? run : next.isEmpty() ? null : next.get(0);
        v.setInt(R.id.now_title, "setMaxLines", lines);
        if (b == null) {
            head(v, 0, "Up next", "");
            v.setTextViewText(R.id.now_title, "Nothing else today");
            textColor(c, v, R.id.now_title, R.color.kfw_ink_muted);
            v.setViewVisibility(R.id.now_ring, View.GONE);
            v.setViewVisibility(R.id.bar, View.GONE);
            v.setOnClickPendingIntent(R.id.now_open, KfWidget.open(c, "/calendar"));
            return null;
        }
        long a = b.optLong("start");
        long e = b.optLong("end");
        String sw = swatch(b);
        head(v, 0, run != null ? "Now" : "Up next", small ? "" : s.range(a, e));
        if (small) headRight(v, s.hmc(run != null ? e : a));
        else countdown(v, R.id.head_cd, s, run != null ? e : a, now, run != null ? "%s left" : "in %s");
        v.setTextViewText(R.id.now_title, (goalBlock(b) ? "✶ " : "") + b.optString("title"));
        tint(c, v, R.id.now_ring, blkAccent(c, sw));
        v.setProgressBar(R.id.bar, 1000, run != null ? (int) (1000 * (now - a) / Math.max(1, e - a)) : 0, false);
        barTint(v, R.id.bar, blkAccent(c, sw));
        if (times) {
            v.setViewVisibility(R.id.now_times, View.VISIBLE);
            v.setTextViewText(R.id.now_a, small ? s.hmc(a) : s.hm(a));
            v.setTextViewText(R.id.now_b, small ? s.hmc(e) : s.hm(e));
        }
        v.setOnClickPendingIntent(R.id.now_open, openBlock(c, s, b));
        return b;
    }

    /** The blocks after the Now card's, up to n. */
    static List<JSONObject> after(Snap s, long now, JSONObject head, int n) {
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject b : upcoming(s, now)) if (b != head && out.size() < n) out.add(b);
        return out;
    }

    /** The capture bar (layout/kfw_capbar.xml): type, or the mic. */
    static void capbar(Context c, RemoteViews v) {
        PendingIntent type = KfWidget.open(c, "/today?kfAction=capture");
        v.setOnClickPendingIntent(R.id.capbar, type);
        v.setOnClickPendingIntent(R.id.capture, type);
        v.setOnClickPendingIntent(R.id.mic, KfWidget.open(c, "/today?kfAction=voice"));
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
        if (action != null) v.setOnClickPendingIntent(R.id.root, action);
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
        String foot = s.minutes(now) < 17 * 60 ? "Shut down after 5 PM" : "Time to shut down";
        return state(c, "Top 3", R.color.kfw_sage_text, R.drawable.kfw_art_cherry_bloom, 66, n == 3 ? "all three done" : "all done", null, foot, null, KfWidget.open(c, "/today"));
    }

    // ── Today ──

    /** W01 (4×1) / W02 (2×2): the goal of the day, the only gold. */
    private static RemoteViews goal(Context c, int rows, Snap s, long now) {
        JSONObject g = goalOf(s, now);
        if (g == null && rows >= 2) return nothingYet(c, "✶ Goal", "No goal yet");
        if (rows < 2) {
            RemoteViews v = views(c, R.layout.kfw_goal_slim);
            if (g == null) {
                v.setTextViewText(R.id.goal_title, "Plan my day");
                v.setTextViewText(R.id.goal_tag, "✶ No goal yet");
                v.setViewVisibility(R.id.box, View.INVISIBLE);
                v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today?kfAction=plan"));
                return v;
            }
            goalStrip(c, v, s, g, 2, false);
            v.setOnClickPendingIntent(R.id.root, openTask(c, g.optString("id")));
            return v;
        }
        RemoteViews v = views(c, R.layout.kfw_goal_card);
        boolean done = g.optBoolean("done");
        v.setTextViewText(R.id.title, struck(g.optString("title"), done));
        String when = range(s, g);
        String l = len(g);
        v.setTextViewText(R.id.time, when + (l.isEmpty() ? "" : " · " + l));
        box(c, v, R.id.box, done, true, "task", g.optString("id"));
        v.setOnClickPendingIntent(R.id.root, openTask(c, g.optString("id")));
        return v;
    }

    /** W03 · Checklist small (2×2): ☆ Top 3, the paper goal, the picks. */
    private static RemoteViews checkSmall(Context c, int h, Snap s, long now) {
        List<JSONObject> top = top3(s, now);
        int done = doneCount(top);
        if (top.isEmpty()) return nothingYet(c, "Top 3", "Nothing starred yet");
        if (done == top.size()) return allDone(c, s, now, top.size());
        RemoteViews v = views(c, R.layout.kfw_top_small, R.id.rows);
        head(v, R.drawable.kfw_ic_star, "Top 3", done + "/" + top.size());
        JSONObject g = goalOf(s, now);
        boolean tight = h < 180;
        goalStrip(c, v, s, g, tight ? 1 : 2, false);
        int from = g != null ? 1 : 0;
        int room = fit(h, 24 + 26 + (g != null ? (tight ? 58 : 75) : 0), 33);
        List<RemoteViews> r = new ArrayList<>();
        for (int i = from; i < top.size() && r.size() < room; i++) r.add(taskRow(c, top.get(i), null));
        rows(c, v, R.id.rows, r);
        if (stale(v, s, now)) {
            v.setViewVisibility(R.id.head_q, View.INVISIBLE);
            v.setViewVisibility(R.id.stale_foot, View.VISIBLE);
            v.setTextViewText(R.id.stale_foot, s.j.optBoolean("offline") ? "Syncs when online" : "Open to refresh");
        }
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** The picks after the goal, then today's tasks: what the Checklist ticks. */
    private static List<JSONObject> tickables(Snap s, long now) {
        List<JSONObject> out = new ArrayList<>(top3(s, now));
        if (goalOf(s, now) != null && !out.isEmpty()) out.remove(0);
        out.addAll(tasks(s, now));
        return out;
    }

    /** W35 · Checklist medium (4×2): Today · 1 of 8 done, the goal on the left, rows to tick on the right. */
    private static RemoteViews checkMedium(Context c, int h, Snap s, long now) {
        List<JSONObject> list = tickables(s, now);
        JSONObject g = goalOf(s, now);
        if (g == null && list.isEmpty()) return nothingYet(c, "Today", "Nothing planned yet");
        RemoteViews v = views(c, R.layout.kfw_check_m, R.id.rows);
        head(v, R.drawable.kfw_ic_today, "Today", progressText(s, now));
        headAdd(c, v);
        goalStrip(c, v, s, g, 3, false);
        int room = fit(h, 24 + 26 + 2, 33);
        List<RemoteViews> r = new ArrayList<>();
        for (int i = 0; i < list.size() && r.size() < room; i++) r.add(taskRow(c, list.get(i), null));
        rows(c, v, R.id.rows, r);
        stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W36 · Checklist large (4×4): Next, the goal, the picks, Today's tasks, the fold, the capture bar. */
    private static RemoteViews checkLarge(Context c, int h, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_check_l, R.id.rows, R.id.rows2, R.id.slot);
        head(v, R.drawable.kfw_ic_today, "Today", s.fmt("EEE d", now) + (progressText(s, now).isEmpty() ? "" : " · " + progressText(s, now)));
        headAdd(c, v);
        int used = 24 + 26 + 44 + 28;
        JSONObject run = running(s, now);
        List<JSONObject> up = upcoming(s, now);
        JSONObject next = run != null ? run : up.isEmpty() ? null : up.get(0);
        if (next != null) {
            v.addView(R.id.slot, blockRow(c, s, next, run != null ? "Now" : "Next", false, now));
            used += 35;
        }
        JSONObject g = goalOf(s, now);
        goalStrip(c, v, s, g, 2, true);
        if (g != null) used += 82;
        List<JSONObject> top = top3(s, now);
        List<RemoteViews> picks = new ArrayList<>();
        for (int i = g != null ? 1 : 0; i < top.size(); i++) picks.add(taskRow(c, top.get(i), len(top.get(i))));
        rows(c, v, R.id.rows, picks);
        used += picks.size() * 34;
        List<JSONObject> today = tasks(s, now);
        int open = 0;
        for (JSONObject t : today) if (!t.optBoolean("done")) open++;
        int room = fit(h, used + 26, 34);
        if (today.isEmpty() || room == 0) v.setViewVisibility(R.id.sub, View.GONE);
        else v.setTextViewText(R.id.sub_n, String.valueOf(open));
        List<RemoteViews> tr = new ArrayList<>();
        for (int i = 0; i < today.size() && tr.size() < room; i++) {
            JSONObject t = today.get(i);
            tr.add(taskRow(c, t, t.optLong("start") > 0 ? s.hm(t.optLong("start")) : ""));
        }
        rows(c, v, R.id.rows2, tr);
        JSONObject o = s.obj("overdue");
        int over = o == null ? 0 : o.optInt("count");
        int also = s.newDay(now) ? 0 : s.j.optInt("alsoOpen");
        if (over == 0 && also == 0) v.setViewVisibility(R.id.fold, View.GONE);
        v.setTextViewText(R.id.fold_over, over > 0 ? "Overdue " + over : "");
        v.setTextViewText(R.id.fold_also, (also > 0 ? (over > 0 ? " · " : "") + "Also open " + also : "") + " ›");
        v.setOnClickPendingIntent(R.id.fold, KfWidget.open(c, "/today"));
        capbar(c, v);
        stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W04 Today · Top 3 (4×2): the date and progress, the goal on the left, Up next and the picks on the right. */
    private static RemoteViews top(Context c, int h, Snap s, long now) {
        List<JSONObject> top = top3(s, now);
        if (top.isEmpty()) return nothingYet(c, "Top 3", "Nothing starred yet");
        RemoteViews v = views(c, R.layout.kfw_top_wide, R.id.rows, R.id.slot);
        head(v, R.drawable.kfw_ic_today, s.fmt("EEEE, MMM d", now), progressText(s, now));
        headAdd(c, v);
        JSONObject g = goalOf(s, now);
        goalStrip(c, v, s, g, 3, false);
        int used = 24 + 26 + 6;
        List<JSONObject> up = upcoming(s, now);
        JSONObject run = running(s, now);
        JSONObject next = run != null ? run : up.isEmpty() ? null : up.get(0);
        if (next != null) {
            v.addView(R.id.slot, blockRow(c, s, next, null, false, now));
            used += 35;
        }
        int room = fit(h, used, 33);
        List<RemoteViews> r = new ArrayList<>();
        for (int i = g != null ? 1 : 0; i < top.size() && r.size() < room; i++) r.add(taskRow(c, top.get(i), null));
        rows(c, v, R.id.rows, r);
        stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W37 · Now card small (2×2): Up next, its progress and times, and Then. */
    private static RemoteViews nowSmall(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_nowcard_s);
        JSONObject b = nowHead(c, v, s, now, 2, true, true);
        List<JSONObject> then = after(s, now, b, 1);
        if (b == null || then.isEmpty()) v.setViewVisibility(R.id.then, View.GONE);
        else {
            JSONObject t = then.get(0);
            v.setTextViewText(R.id.then_title, "Then " + (goalBlock(t) ? "✶ " : "") + t.optString("title"));
            v.setTextViewText(R.id.then_time, s.hmc(t.optLong("start")));
        }
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar"));
        return v;
    }

    /** W38 · Now card medium (4×2): the Now card and the next two blocks. */
    private static RemoteViews nowMedium(Context c, int h, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_nowcard_m, R.id.rows);
        headAdd(c, v);
        JSONObject b = nowHead(c, v, s, now, 1, false, false);
        int room = Math.min(2, fit(h, 24 + 26 + 40 + 5, 35));
        for (JSONObject n : after(s, now, b, room)) v.addView(R.id.rows, blockRow(c, s, n, null, false, now));
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar"));
        return v;
    }

    /** W05 · Now card large (4×4): the Now card, the next two blocks, the goal, the Top 3, capture. */
    private static RemoteViews nowLarge(Context c, int h, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_nowcard_l, R.id.rows, R.id.slot);
        headAdd(c, v);
        JSONObject b = nowHead(c, v, s, now, 1, false, true);
        for (JSONObject n : after(s, now, b, 2)) v.addView(R.id.slot, blockRow(c, s, n, null, false, now));
        JSONObject g = goalOf(s, now);
        goalStrip(c, v, s, g, 2, true);
        List<JSONObject> top = top3(s, now);
        int room = fit(h, 24 + 60 + 70 + (g != null ? 82 : 0) + 44, 34);
        List<RemoteViews> r = new ArrayList<>();
        for (int i = g != null ? 1 : 0; i < top.size() && r.size() < room; i++) r.add(taskRow(c, top.get(i), len(top.get(i))));
        rows(c, v, R.id.rows, r);
        capbar(c, v);
        stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W06 Now (4×2): the Now card, Then, Start focus and Done. */
    private static RemoteViews now(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_now, R.id.slot);
        JSONObject b = nowHead(c, v, s, now, 1, false, false);
        for (JSONObject n : after(s, now, b, 1)) v.addView(R.id.slot, blockRow(c, s, n, "Then", false, now));
        String task = b == null ? "" : b.optString("taskId");
        v.setOnClickPendingIntent(R.id.focus, KfWidget.open(c, "/focus?kfAction=focus-start" + (task.isEmpty() ? "" : "&kfTasks=" + task)));
        if (task.isEmpty()) v.setViewVisibility(R.id.done, View.GONE);
        else v.setOnClickPendingIntent(R.id.done, KfWidget.tick(c, "task", task));
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }

    /** W07 Up next · tiny (2×1): the next block in its colour, its title on two lines. */
    private static RemoteViews next(Context c, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_next);
        JSONObject run = running(s, now);
        List<JSONObject> up = upcoming(s, now);
        JSONObject b = up.isEmpty() ? run : up.get(0);
        if (b == null) {
            v.setInt(R.id.blk, "setBackgroundResource", R.drawable.kfw_chip_step);
            v.setTextViewText(R.id.cap, "Next");
            v.setTextViewText(R.id.title, "Nothing else today");
            textColor(c, v, R.id.title, R.color.kfw_ink_muted);
            v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/calendar"));
            return v;
        }
        String sw = swatch(b);
        v.setInt(R.id.blk, "setBackgroundResource", blkFill(c, sw));
        if (goalBlock(b)) v.setViewVisibility(R.id.blk_goal, View.VISIBLE);
        v.setTextViewText(R.id.cap, b == run ? "Now · until " + s.hmc(b.optLong("end")) : "Next · " + s.hmc(b.optLong("start")));
        textColor(c, v, R.id.cap, blkInk(c, sw));
        v.setTextViewText(R.id.title, (goalBlock(b) ? "✶ " : "") + b.optString("title"));
        v.setOnClickPendingIntent(R.id.root, openBlock(c, s, b));
        return v;
    }

    /** W08 Day progress (4×1): the count, the finish estimate, the day's blocks as a strip, the wisteria. */
    private static RemoteViews progress(Context c, int w, Snap s, long now) {
        RemoteViews v = views(c, R.layout.kfw_progress);
        JSONObject p = s.obj("progress");
        int done = p == null || s.newDay(now) ? 0 : p.optInt("done");
        int total = p == null || s.newDay(now) ? 0 : p.optInt("total");
        v.setTextViewText(R.id.title, total == 0 ? "Nothing planned yet" : done + " of " + total + " done");
        long finish = s.j.optLong("finishAt");
        v.setTextViewText(R.id.time, finish > now && done < total ? "finish ~" + s.hm(finish) : "");
        if (!blocks(s, now).isEmpty()) {
            v.setViewVisibility(R.id.done_bar, View.GONE);
            DayBar.draw(c, v, s, now, w - 14 - 12 - 12 - 40, true); // less the body's padding and the art
        } else {
            v.setViewVisibility(R.id.bar, View.GONE);
            v.setProgressBar(R.id.done_bar, 1000, total == 0 ? 0 : 1000 * done / total, false);
        }
        v.setImageViewResource(R.id.art, total > 0 && done * 2 >= total ? R.drawable.kfw_art_wisteria_p80 : R.drawable.kfw_art_wisteria_p40);
        v.setOnClickPendingIntent(R.id.root, KfWidget.open(c, "/today"));
        return v;
    }
}
