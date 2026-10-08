package com.kaisflow.garden.widgets;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Debug builds only. Draws every widget with the design's sample day (Kai's Tue 7 Oct at 14:52,
 * render_widgets.mjs) through the real Render, in Day and Night, at the design's grid sizes
 * (cell 76dp, gap 16), and writes PNGs to files/widgets/ for review:
 *
 *   adb shell am start -W -n com.kaisflow.garden/.widgets.WidgetGallery
 *   adb pull /sdcard/Android/data/com.kaisflow.garden/files/widgets
 *
 * RemoteViews.apply() inflates with the same class filter a launcher uses, so a layout a home
 * screen would refuse fails here too (logged as "FAIL").
 */
public class WidgetGallery extends Activity {
    private static final String TAG = "KfGallery";
    private static final TimeZone CAIRO = TimeZone.getTimeZone("Africa/Cairo");

    interface Tweak {
        void apply(JSONObject s) throws JSONException;
    }

    /** 2026-10-07 hh:mm in Cairo. */
    static long t(int hh, int mm) {
        return at(7, hh, mm);
    }

    static long at(int day, int hh, int mm) {
        Calendar c = Calendar.getInstance(CAIRO);
        c.clear();
        c.set(2026, Calendar.OCTOBER, day, hh, mm, 0);
        return c.getTimeInMillis();
    }

    static JSONObject item(String id, String title, long start, long end, boolean done) throws JSONException {
        return new JSONObject().put("id", id).put("title", title).put("start", start).put("end", end).put("done", done);
    }

    static JSONObject block(String id, String taskId, String title, long start, long end, String color, boolean done) throws JSONException {
        return new JSONObject().put("id", id).put("taskId", taskId).put("title", title).put("start", start).put("end", end).put("color", color).put("done", done);
    }

    static JSONArray week(int... dots) {
        JSONArray a = new JSONArray();
        for (int d : dots) a.put(d);
        return a;
    }

    /** The design's sample day (render_widgets.mjs: GOAL, TOP, blocks …). */
    static JSONObject sample() throws JSONException {
        long now = t(14, 52);
        JSONObject s = new JSONObject();
        s.put("v", 1).put("at", now - 60_000).put("signedIn", true).put("offline", false).put("zone", "Africa/Cairo").put("day", "2026-10-07").put("dayN", 83);
        s.put("goal", item("g1", "Crypto — heavy session", t(14, 45), t(16, 15), false));
        s.put("picks", new JSONArray().put(item("p1", "Skim OS lectures 1 + 2", t(16, 15), t(16, 55), false)).put(item("p2", "Read 2 pages", t(17, 0), t(17, 10), false)));
        s.put("plannedMin", 120).put("finishAt", t(17, 10));
        s.put("progress", new JSONObject().put("done", 3).put("total", 7));
        s.put("blocks", new JSONArray()
            .put(block("b0", "", "OS lecture", t(10, 0), t(11, 0), "lavender", false))
            .put(block("b1", "g1", "Crypto — heavy session", t(14, 45), t(16, 15), "goal", false))
            .put(block("b2", "p1", "Skim OS lectures 1 + 2", t(16, 15), t(16, 55), "sage", false))
            .put(block("b3", "p2", "Read 2 pages", t(17, 0), t(17, 10), "blossom", false))
            .put(block("b4", "", "Gym", t(18, 0), t(19, 0), "hydrangea", false)));
        JSONArray days = new JSONArray();
        int[] counts = {2, 5, 3, 1, 0, 2, 0};
        for (int i = 0; i < 7; i++) days.put(new JSONObject().put("day", String.format("2026-10-%02d", 5 + i)).put("n", counts[i]));
        s.put("week", days);
        s.put("countdown", new JSONObject().put("title", "Midterm").put("at", at(16, 9, 0)).put("id", "c1").put("route", "/today"));
        s.put("focus", new JSONObject().put("state", "running").put("endsAt", now + (18 * 60 + 42) * 1000L).put("roundMin", 30).put("taskId", "g1").put("title", "Crypto — heavy session"));
        s.put("routines", new JSONArray()
            .put(new JSONObject().put("id", "r1").put("title", "Morning med").put("done", true).put("week", week(2, 2, 1, 2, 2, 2, 2)))
            .put(new JSONObject().put("id", "r2").put("title", "Gym").put("done", false).put("week", week(2, 0, 2, 2, 0, 2, 0)))
            .put(new JSONObject().put("id", "r3").put("title", "Read 2 pages").put("done", false).put("week", week(2, 2, 2, 1, 0, 2, 0))));
        s.put("bestStreak", 12);
        s.put("streak", new JSONObject().put("id", "r2").put("title", "Gym").put("days", 12).put("goal", 30));
        s.put("inbox", 3);
        s.put("overdue", new JSONObject().put("count", 4).put("oldestDays", 9).put("titles", new JSONArray().put("Call the tyre supplier").put("Renew the car licence")));
        s.put("slipping", new JSONArray()
            .put(new JSONObject().put("title", "Tyre supplier").put("days", 9))
            .put(new JSONObject().put("title", "Guitar practice").put("days", 6))
            .put(new JSONObject().put("title", "Email Dr. Hany").put("days", 5)));
        s.put("ritual", new JSONObject().put("phase", "plan").put("inbox", 3).put("overdue", 4).put("done", 4).put("total", 5).put("carry", 1));
        s.put("journal", new JSONObject().put("wrote", false).put("line", JSONObject.NULL));
        s.put("memory", new JSONObject().put("text", "Start the crypto notes with the questions, not the answers.").put("when", "3 Sep").put("source", "Journal · a month ago").put("route", "/journal"));
        s.put("specimen", new JSONObject().put("title", "A week of mornings").put("date", "Oct 3").put("art", "wisteria_p80"));
        s.put("season", new JSONObject().put("name", "Autumn").put("weather", "31° clear").put("art", "daisy_midday"));
        return s;
    }

    static final class Spec {
        final String name, kind;
        final int cols, rows;
        final long now;
        final Tweak tweak;

        Spec(String name, String kind, int cols, int rows, long now, Tweak tweak) {
            this.name = name;
            this.kind = kind;
            this.cols = cols;
            this.rows = rows;
            this.now = now;
            this.tweak = tweak;
        }
    }

    static Spec w(String name, String kind, int cols, int rows) {
        return new Spec(name, kind, cols, rows, t(14, 52), null);
    }

    static Spec w(String name, String kind, int cols, int rows, Tweak tweak) {
        return new Spec(name, kind, cols, rows, t(14, 52), tweak);
    }

    static Spec w(String name, String kind, int cols, int rows, long now, Tweak tweak) {
        return new Spec(name, kind, cols, rows, now, tweak);
    }

    static void doneAt(JSONObject s, String key, int i) throws JSONException {
        s.getJSONArray(key).getJSONObject(i).put("done", true);
    }

    static Spec[] specs() {
        return new Spec[] {
            // Today
            w("W01", "goal", 4, 1),
            w("W02", "goal", 2, 2),
            w("W03", "top", 2, 2, (s) -> doneAt(s, "picks", 1)),
            w("W04", "top", 4, 2),
            w("W05", "top", 4, 4),
            w("W06", "now", 4, 2),
            w("W06b", "now", 4, 2, t(14, 20), null),
            w("W07", "next", 2, 1),
            w("W08", "progress", 4, 1),
            // Capture
            w("W09", "capture", 1, 1),
            w("W10", "capture", 2, 1),
            w("W11", "capture", 4, 1),
            w("W12", "paper", 1, 1),
            w("W13", "ask", 4, 1),
            // Calendar
            w("W14", "agenda", 4, 3),
            w("W15", "agenda", 4, 4),
            w("W16", "week", 4, 1),
            w("W17", "countdown", 2, 1),
            // Focus
            w("W18", "focus", 2, 2),
            w("W19", "focus", 2, 2, (s) -> s.getJSONObject("focus").put("state", "idle").put("endsAt", 0).put("roundMin", 25)),
            w("W20", "focus", 2, 1),
            // Routines & streaks
            w("W21", "routines", 2, 2),
            w("W22", "routines", 4, 2),
            w("W23", "streak", 2, 2),
            w("W24", "streak", 1, 1),
            // Triage
            w("W25", "inbox", 2, 2),
            w("W26", "inbox", 1, 1),
            w("W27", "overdue", 2, 2),
            w("W28", "slipping", 2, 2),
            // Rituals & reflection
            w("W29", "ritual", 4, 2, t(8, 30), null),
            w("W30", "ritual", 4, 2, t(19, 30), (s) -> s.getJSONObject("ritual").put("phase", "shutdown")),
            w("W31", "journal", 4, 2),
            w("W32", "memory", 4, 2),
            w("W33", "pressed", 2, 2),
            w("W34", "season", 2, 1),
            // States
            w("S1", "top", 2, 2, (s) -> {
                s.getJSONObject("goal").put("done", true);
                doneAt(s, "picks", 0);
                doneAt(s, "picks", 1);
            }),
            w("S2", "top", 2, 2, (s) -> {
                s.remove("goal");
                s.put("picks", new JSONArray());
            }),
            w("S3", "top", 2, 2, (s) -> {
                s.put("offline", true).put("at", t(9, 40));
                s.getJSONArray("picks").remove(1);
            }),
            w("S4", "top", 2, 2, (s) -> s.put("signedIn", false)),
            w("S5", "top", 2, 2, (s) -> s.put("v", -1)),
            w("S6", "inbox", 2, 2, (s) -> s.put("inbox", 0)),
        };
    }

    static int dp(int cells) {
        return 76 * cells + 16 * (cells - 1);
    }

    /** Snap's tick rules (the one pure piece of the native side): a tick is drawn once, everywhere it shows. */
    static void selfCheck() throws JSONException {
        JSONObject s = sample();
        JSONObject op = new JSONObject().put("t", "task").put("id", "g1");
        Snap.apply(s, op);
        Snap.apply(s, op); // the app's next snapshot gets the still-queued tick folded in again: no double count
        check(s.getJSONObject("goal").getBoolean("done"), "goal ticked");
        check(s.getJSONArray("blocks").getJSONObject(1).getBoolean("done"), "its block ticked");
        check(s.getJSONObject("progress").getInt("done") == 4, "progress counted once");
        Snap.apply(s, new JSONObject().put("t", "routine").put("id", "r2"));
        check(s.getJSONArray("routines").getJSONObject(1).getBoolean("done"), "routine ticked");
        Snap.apply(s, new JSONObject().put("t", "focus-done").put("id", "p1"));
        check(s.getJSONObject("focus").getString("state").equals("idle"), "focus stopped");
        check(s.getJSONArray("picks").getJSONObject(0).getBoolean("done"), "focus task done");
        check(KfWidget.colsFor(76) == 1 && KfWidget.colsFor(168) == 2 && KfWidget.colsFor(352) == 4 && KfWidget.rowsFor(110) == 1 && KfWidget.rowsFor(230) == 2 && KfWidget.rowsFor(470) == 4, "size classes");
        Log.i(TAG, "selfcheck ok");
    }

    static void check(boolean ok, String what) {
        if (!ok) throw new IllegalStateException("selfcheck: " + what);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            selfCheck();
        } catch (Exception e) {
            Log.e(TAG, "FAIL selfcheck", e);
        }
        File dir = new File(getExternalFilesDir(null), "widgets");
        dir.mkdirs();
        int ok = 0;
        int failed = 0;
        for (Spec spec : specs()) {
            for (boolean night : new boolean[] {false, true}) {
                Configuration conf = new Configuration(getResources().getConfiguration());
                conf.uiMode = (conf.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (night ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
                Context ctx = createConfigurationContext(conf);
                try {
                    JSONObject j = sample();
                    if (spec.tweak != null) spec.tweak.apply(j);
                    Snap s = j.optInt("v") < 0 ? null : new Snap(j);
                    RemoteViews rv = Render.build(ctx, spec.kind, spec.cols, spec.rows, s, spec.now);
                    float d = getResources().getDisplayMetrics().density;
                    int wpx = Math.round(dp(spec.cols) * d);
                    int hpx = Math.round(dp(spec.rows) * d);
                    FrameLayout host = new FrameLayout(ctx);
                    View v = rv.apply(ctx, host);
                    host.addView(v, new FrameLayout.LayoutParams(wpx, hpx));
                    host.measure(View.MeasureSpec.makeMeasureSpec(wpx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hpx, View.MeasureSpec.EXACTLY));
                    host.layout(0, 0, wpx, hpx);
                    Bitmap b = Bitmap.createBitmap(wpx, hpx, Bitmap.Config.ARGB_8888);
                    host.draw(new Canvas(b));
                    try (FileOutputStream out = new FileOutputStream(new File(dir, spec.name + (night ? "-night" : "-day") + ".png"))) {
                        b.compress(Bitmap.CompressFormat.PNG, 100, out);
                    }
                    ok++;
                } catch (Exception e) {
                    failed++;
                    Log.e(TAG, "FAIL " + spec.name + (night ? " night" : " day"), e);
                }
            }
        }
        Log.i(TAG, "done ok=" + ok + " failed=" + failed + " dir=" + dir);
        finish();
    }
}
