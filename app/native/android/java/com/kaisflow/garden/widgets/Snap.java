package com.kaisflow.garden.widgets;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The widgets' one source: the snapshot the app writes (src/features/widgets/snapshot.ts, through
 * WidgetBridge) plus the ticks made on the home screen that the app hasn't applied yet. Both live in
 * SharedPreferences, so a widget redraws without the app running. A tick is drawn at once (it is
 * folded into the snapshot) and queued; the app takes the queue when it next runs and applies each
 * one through its own outbox. Every snapshot the app writes gets the still-queued ticks folded in
 * again, so a tick never flickers back before the app has applied it.
 */
public final class Snap {
    private static final String PREFS = "kf_widgets";
    /** Older than this (or written while offline): the widget shows S3, Offline / stale. */
    static final long STALE_MS = 3 * 60 * 60 * 1000L;

    final JSONObject j;
    final TimeZone zone;
    /** The earliest moment after now when something drawn changes (a block starts or ends …). */
    long boundary = Long.MAX_VALUE;

    Snap(JSONObject j) {
        this.j = j;
        this.zone = TimeZone.getTimeZone(j.optString("zone", "Africa/Cairo"));
    }

    // ── storage ──

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The current snapshot, or null before the app has written one (S5, First paint). */
    static synchronized Snap load(Context c) {
        String raw = prefs(c).getString("snap", null);
        if (raw == null) return null;
        try {
            return new Snap(new JSONObject(raw));
        } catch (JSONException e) {
            return null;
        }
    }

    /** The app's write: still-queued ticks are folded in before it is kept. */
    static synchronized void store(Context c, String json) throws JSONException {
        JSONObject snap = new JSONObject(json);
        JSONArray queue = queue(c);
        for (int i = 0; i < queue.length(); i++) apply(snap, queue.getJSONObject(i));
        prefs(c).edit().putString("snap", snap.toString()).apply();
    }

    static synchronized JSONArray queue(Context c) {
        try {
            return new JSONArray(prefs(c).getString("queue", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** The app takes the queue (and applies it); it is cleared here. */
    static synchronized String take(Context c) {
        String q = prefs(c).getString("queue", "[]");
        prefs(c).edit().putString("queue", "[]").apply();
        return q;
    }

    /** A tick on the home screen: queued for the app, and drawn now. */
    static synchronized void tick(Context c, JSONObject op) throws JSONException {
        op.put("at", System.currentTimeMillis());
        JSONArray queue = queue(c).put(op);
        SharedPreferences.Editor e = prefs(c).edit().putString("queue", queue.toString());
        String raw = prefs(c).getString("snap", null);
        if (raw != null) {
            JSONObject snap = new JSONObject(raw);
            apply(snap, op);
            e.putString("snap", snap.toString());
        }
        e.apply();
    }

    /** One queued op drawn into a snapshot: {t: task|routine|focus-stop|focus-done, id}. */
    static void apply(JSONObject s, JSONObject op) throws JSONException {
        String t = op.optString("t");
        String id = op.optString("id");
        if (t.equals("focus-stop") || t.equals("focus-done")) {
            JSONObject f = s.optJSONObject("focus");
            if (f != null) {
                if (t.equals("focus-done")) id = f.optString("taskId", "");
                f.put("state", "idle");
                f.put("endsAt", 0);
            }
            if (t.equals("focus-stop") || id.isEmpty()) return;
            t = "task";
        }
        if (t.equals("task")) {
            boolean flipped = done(s.optJSONObject("goal"), "id", id);
            flipped |= doneAll(s.optJSONArray("picks"), "id", id);
            flipped |= doneAll(s.optJSONArray("blocks"), "taskId", id);
            JSONObject p = s.optJSONObject("progress");
            if (flipped && p != null) p.put("done", Math.min(p.optInt("total"), p.optInt("done") + 1));
        } else if (t.equals("routine")) {
            doneAll(s.optJSONArray("routines"), "id", id);
        }
    }

    private static boolean doneAll(JSONArray a, String key, String id) throws JSONException {
        boolean any = false;
        for (int i = 0; a != null && i < a.length(); i++) any |= done(a.optJSONObject(i), key, id);
        return any;
    }

    private static boolean done(JSONObject o, String key, String id) throws JSONException {
        if (o == null || id.isEmpty() || !id.equals(o.optString(key)) || o.optBoolean("done")) return false;
        o.put("done", true);
        return true;
    }

    // ── reads ──

    JSONObject obj(String k) {
        return j.optJSONObject(k);
    }

    JSONArray arr(String k) {
        JSONArray a = j.optJSONArray(k);
        return a == null ? new JSONArray() : a;
    }

    boolean signedIn() {
        return j.optBoolean("signedIn", true);
    }

    String day(long t) {
        return fmt("yyyy-MM-dd", t);
    }

    /** The app wrote this on an earlier day: the day's lists aren't today's any more. */
    boolean newDay(long now) {
        return !j.optString("day").equals(day(now));
    }

    boolean stale(long now) {
        return j.optBoolean("offline") || now - j.optLong("at") > STALE_MS;
    }

    String fmt(String pattern, long t) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(zone);
        return f.format(new Date(t));
    }

    String hm(long t) {
        return fmt("HH:mm", t);
    }

    /** Minutes since midnight on the user's clock. */
    int minutes(long t) {
        String hm = hm(t);
        return Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(3));
    }

    /** The next local midnight after t (the day rollover). */
    long nextMidnight(long t) {
        java.util.Calendar cal = java.util.Calendar.getInstance(zone);
        cal.setTimeInMillis(t);
        cal.add(java.util.Calendar.DAY_OF_MONTH, 1);
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
        cal.set(java.util.Calendar.MINUTE, 0);
        cal.set(java.util.Calendar.SECOND, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    /** Something drawn changes at t: the widgets redraw then. */
    void at(long t, long now) {
        if (t > now && t < boundary) boundary = t;
    }
}
