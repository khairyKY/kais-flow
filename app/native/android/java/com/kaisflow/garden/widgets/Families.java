package com.kaisflow.garden.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** The families after Today: Capture, Calendar, Focus, Routines & streaks, Triage, Rituals & reflection. */
final class Families {
    private Families() {}

    static RemoteViews build(Context c, String kind, int cols, int rows, Snap s, long now) {
        switch (kind) {
            case "capture": return capture(c, cols);
            case "paper": return tap(c, R.layout.kfw_paper, "/today?kfAction=paper");
            case "ask": return ask(c);
            case "agenda": return agenda(c, rows, s, now);
            case "week": return week(c, s, now);
            case "countdown": return countdown(c, s, now);
            case "focus": return focus(c, rows, s, now);
            case "routines": return routines(c, cols, rows, s, now);
            case "streak": return streak(c, cols, rows, s);
            case "inbox": return inbox(c, cols, rows, s);
            case "overdue": return overdue(c, s);
            case "slipping": return slipping(c, s);
            case "ritual": return ritual(c, s, now);
            case "journal": return journal(c, s, now);
            case "memory": return memory(c, s);
            case "pressed": return pressed(c, s);
            case "season": return season(c, s);
            default: return new RemoteViews(c.getPackageName(), R.layout.kfw_loading);
        }
    }

    private static PendingIntent open(Context c, String path) {
        return KfWidget.open(c, path);
    }

    private static RemoteViews tap(Context c, int layout, String path) {
        RemoteViews v = Render.views(c, layout);
        v.setOnClickPendingIntent(R.id.root, open(c, path));
        return v;
    }

    /** A bundled garden picture by its snapshot key ("wisteria_p80"), or the fallback. */
    private static int art(Context c, String key, int fallback) {
        int id = key.isEmpty() ? 0 : c.getResources().getIdentifier("kfw_art_" + key, "drawable", c.getPackageName());
        return id != 0 ? id : fallback;
    }

    // ── Capture: tap to type (the capture sheet with the keyboard up), the mic to talk ──

    private static RemoteViews capture(Context c, int cols) {
        if (cols <= 1) return tap(c, R.layout.kfw_capture_seal, "/today?kfAction=capture");
        if (cols <= 3) return tap(c, R.layout.kfw_capture_pill, "/today?kfAction=capture");
        RemoteViews v = tap(c, R.layout.kfw_capture_bar, "/today?kfAction=capture");
        v.setOnClickPendingIntent(R.id.type, open(c, "/today?kfAction=capture"));
        v.setOnClickPendingIntent(R.id.mic, open(c, "/today?kfAction=voice"));
        v.setOnClickPendingIntent(R.id.paper, open(c, "/today?kfAction=paper"));
        return v;
    }

    private static RemoteViews ask(Context c) {
        RemoteViews v = tap(c, R.layout.kfw_ask, "/today?kfAction=ask");
        v.setOnClickPendingIntent(R.id.ask, open(c, "/today?kfAction=ask"));
        v.setOnClickPendingIntent(R.id.chip, open(c, "/today?kfAction=ask&kfText=" + android.net.Uri.encode("What should I drop?")));
        return v;
    }

    // ── Calendar ──

    /** Block colours: the slot's fill and rule, or the block's own #hue at 24%. */
    private static void tone(Context c, RemoteViews r, String color) {
        int fill;
        switch (color) {
            case "goal": fill = R.drawable.kfw_block_goal; break;
            case "sage": fill = R.drawable.kfw_block_sage; break;
            case "blossom": fill = R.drawable.kfw_block_blossom; break;
            case "hydrangea": fill = R.drawable.kfw_block_hydrangea; break;
            case "lavender": case "": fill = R.drawable.kfw_block_lavender; break;
            default: fill = 0;
        }
        if (fill != 0) r.setImageViewResource(R.id.fill, fill);
        else {
            r.setImageViewResource(R.id.fill, R.drawable.kfw_mask_8);
            r.setInt(R.id.fill, "setColorFilter", Render.hue(color, 0xFF888888));
            r.setInt(R.id.fill, "setImageAlpha", 61);
        }
        Render.rule(c, r, R.id.rule, color);
    }

    private static RemoteViews blockRow(Context c, Snap s, JSONObject b, long now) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.kfw_row_block);
        boolean past = b.optLong("end") <= now;
        r.setTextViewText(R.id.start, s.hm(b.optLong("start")));
        r.setTextViewText(R.id.title, Render.struck(b.optString("title"), past || b.optBoolean("done")));
        r.setTextViewText(R.id.time, Render.range(s, b));
        tone(c, r, b.optString("color"));
        if (past) r.setFloat(R.id.row, "setAlpha", 0.55f);
        r.setOnClickPendingIntent(R.id.block, Render.openBlock(c, s, b));
        return r;
    }

    /** W14 Agenda (from the next block on) / W15 Agenda + week (the whole day, past ones faded). */
    private static RemoteViews agenda(Context c, int rows, Snap s, long now) {
        boolean week = rows >= 4;
        RemoteViews v = Render.views(c, week ? R.layout.kfw_agenda_week : R.layout.kfw_agenda);
        List<JSONObject> all = Render.blocks(s, now);
        int left = 0;
        int busyMin = 0;
        for (JSONObject b : all) {
            s.at(b.optLong("start"), now);
            s.at(b.optLong("end"), now);
            if (b.optLong("end") > now) {
                left++;
                busyMin += (int) ((b.optLong("end") - Math.max(now, b.optLong("start"))) / 60_000);
            }
        }
        int shown = 0;
        boolean lineDrawn = false;
        for (JSONObject b : all) {
            if (!week && b.optLong("end") <= now) continue; // W14 starts from the next one on
            if (shown >= (week ? 5 : rows)) break; // 4×3 → 3 blocks, 4×4 → 5
            if (!lineDrawn && b.optLong("end") > now) {
                v.addView(R.id.rows, new RemoteViews(c.getPackageName(), R.layout.kfw_now_line));
                lineDrawn = true;
            }
            v.addView(R.id.rows, blockRow(c, s, b, now));
            shown++;
        }
        if (shown == 0) {
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, all.isEmpty() ? "Nothing on the calendar today." : "Nothing more today.");
        }
        if (week) {
            v.setTextViewText(R.id.date, s.fmt("EEEE, MMM d", now));
            weekDays(c, v, s, now, R.layout.kfw_day_cell);
            v.setOnClickPendingIntent(R.id.add, open(c, "/today?kfAction=capture"));
        } else {
            // "4 left · 2 free hours": free time until 21:00 on the user's clock.
            int free = Math.max(0, 21 * 60 - s.minutes(now)) - busyMin;
            String count = left == 0 ? "" : left + " left";
            if (free >= 60) count += (count.isEmpty() ? "" : " · ") + (free / 60) + " free hour" + (free >= 120 ? "s" : "");
            v.setTextViewText(R.id.count, count);
        }
        Render.stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, open(c, "/calendar"));
        return v;
    }

    /** The week Monday–Sunday around today, from the snapshot's per-day counts. */
    private static void weekDays(Context c, RemoteViews v, Snap s, long now, int layout) {
        java.util.Calendar cal = java.util.Calendar.getInstance(s.zone);
        cal.setTimeInMillis(now);
        int back = (cal.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7; // days since Monday
        cal.add(java.util.Calendar.DAY_OF_MONTH, -back);
        JSONArray counts = s.arr("week");
        String today = s.day(now);
        for (int i = 0; i < 7; i++) {
            long t = cal.getTimeInMillis();
            String key = s.day(t);
            int n = 0;
            for (int k = 0; k < counts.length(); k++) {
                JSONObject d = counts.optJSONObject(k);
                if (d != null && key.equals(d.optString("day"))) n = d.optInt("n");
            }
            boolean isToday = key.equals(today);
            RemoteViews d = new RemoteViews(c.getPackageName(), layout);
            d.setTextViewText(R.id.dow, s.fmt("EEEEE", t));
            d.setTextViewText(R.id.num, s.fmt("d", t));
            if (isToday) Render.textColor(c, d, R.id.dow, R.color.kfw_terra_ink);
            if (layout == R.layout.kfw_day_cell) {
                if (isToday) {
                    d.setInt(R.id.num, "setBackgroundResource", R.drawable.kfw_circle_ink);
                    Render.textColor(c, d, R.id.num, R.color.kfw_parchment);
                }
                d.setViewVisibility(R.id.dot, n > 0 ? View.VISIBLE : View.INVISIBLE);
            } else {
                if (isToday) d.setInt(R.id.chip, "setBackgroundResource", R.drawable.kfw_chip_bone);
                d.setViewVisibility(R.id.dot1, n >= 1 ? View.VISIBLE : View.GONE);
                d.setViewVisibility(R.id.dot2, n >= 2 ? View.VISIBLE : View.GONE);
                d.setViewVisibility(R.id.dot3, n >= 3 ? View.VISIBLE : View.GONE);
            }
            d.setOnClickPendingIntent(R.id.cell, open(c, "/calendar?date=" + key));
            v.addView(R.id.days, d);
            cal.add(java.util.Calendar.DAY_OF_MONTH, 1);
        }
    }

    /** W16 Week strip. */
    private static RemoteViews week(Context c, Snap s, long now) {
        RemoteViews v = Render.views(c, R.layout.kfw_week);
        weekDays(c, v, s, now, R.layout.kfw_week_chip);
        v.setOnClickPendingIntent(R.id.root, open(c, "/calendar"));
        return v;
    }

    /** W17 Countdown: days until the counted-to deadline or event. */
    private static RemoteViews countdown(Context c, Snap s, long now) {
        RemoteViews v = Render.views(c, R.layout.kfw_countdown);
        JSONObject d = s.obj("countdown");
        if (d == null || d.optLong("at") < s.nextMidnight(now) - 86_400_000L) {
            v.setTextViewText(R.id.cap, "Countdown");
            v.setTextViewText(R.id.title, "Nothing ahead");
            v.setOnClickPendingIntent(R.id.root, open(c, "/calendar"));
            return v;
        }
        long at = d.optLong("at");
        long days = Math.round((s.nextMidnight(at) - s.nextMidnight(now)) / 86_400_000.0);
        v.setTextViewText(R.id.cap, d.optString("title"));
        v.setTextViewText(R.id.title, days <= 0 ? "today" : days == 1 ? "tomorrow" : "in " + days + " days");
        v.setTextViewText(R.id.time, s.fmt("EEE d", at));
        v.setOnClickPendingIntent(R.id.root, open(c, d.optString("route", "/calendar?date=" + s.day(at))));
        return v;
    }

    // ── Focus: the timer lives in the app; the widget shows it and can stop or finish it ──

    private static RemoteViews focus(Context c, int rows, Snap s, long now) {
        JSONObject f = s.obj("focus");
        String state = f == null ? "idle" : f.optString("state", "idle");
        long ends = f == null ? 0 : f.optLong("endsAt");
        long leftMs = f == null ? 0 : state.equals("paused") ? f.optLong("left") * 1000 : ends - now;
        boolean on = (state.equals("running") && ends > now) || (state.equals("paused") && leftMs > 0);
        int roundMin = f == null ? 25 : Math.max(1, f.optInt("roundMin", 25));
        String title = f == null ? "" : f.optString("title");
        int ring = on ? (int) Math.max(0, Math.min(1000, 1000 - leftMs * 1000 / (roundMin * 60_000L))) : 0;
        if (on && state.equals("running")) {
            s.at(ends, now); // the round runs out: redraw idle
            s.at(now + 60_000, now); // the ring and the minutes, once a minute while it runs
        }
        if (rows <= 1) {
            RemoteViews v = Render.views(c, R.layout.kfw_focus_slim);
            v.setProgressBar(R.id.ring, 1000, ring, false);
            v.setTextViewText(R.id.mins, (on ? Math.max(1, (leftMs + 59_999) / 60_000) : roundMin) + "m");
            if (on) {
                v.setTextViewText(R.id.cap, state.equals("paused") ? "Paused" : "Focusing");
                v.setTextViewText(R.id.title, title.isEmpty() ? "A round of focus" : title);
                v.setOnClickPendingIntent(R.id.root, open(c, "/focus"));
            } else {
                v.setTextViewText(R.id.cap, "Focus");
                v.setTextViewText(R.id.title, "Start on your goal");
                v.setOnClickPendingIntent(R.id.root, open(c, "/focus?kfAction=focus-start"));
            }
            return v;
        }
        if (!on) {
            RemoteViews v = Render.views(c, R.layout.kfw_focus_idle);
            JSONObject g = s.newDay(now) ? null : s.obj("goal");
            v.setTextViewText(R.id.title, roundMin + " min on " + (g != null && !g.optBoolean("done") ? "your goal" : "one thing"));
            v.setOnClickPendingIntent(R.id.start, open(c, "/focus?kfAction=focus-start"));
            v.setOnClickPendingIntent(R.id.root, open(c, "/focus"));
            return v;
        }
        RemoteViews v = Render.views(c, R.layout.kfw_focus_run);
        v.setProgressBar(R.id.ring, 1000, ring, false);
        v.setChronometer(R.id.left, SystemClock.elapsedRealtime() + leftMs, "%s", state.equals("running"));
        v.setChronometerCountDown(R.id.left, true);
        if (state.equals("paused")) v.setTextViewText(R.id.left_cap, "paused");
        v.setTextViewText(R.id.title, title.isEmpty() ? "A round of focus" : title);
        v.setOnClickPendingIntent(R.id.stop, KfWidget.tick(c, "focus-stop", "round"));
        if (f.optString("taskId").isEmpty()) v.setOnClickPendingIntent(R.id.done, KfWidget.tick(c, "focus-stop", "round"));
        else v.setOnClickPendingIntent(R.id.done, KfWidget.tick(c, "focus-done", f.optString("taskId")));
        v.setOnClickPendingIntent(R.id.root, open(c, "/focus"));
        return v;
    }

    // ── Routines & streaks ──

    private static RemoteViews routines(Context c, int cols, int rows, Snap s, long now) {
        JSONArray list = s.arr("routines");
        if (list.length() == 0) {
            return Render.state(c, "Routines", 0, R.drawable.kfw_art_vine_sprouting, 56, null, "No routines today", null, null, open(c, "/routines"));
        }
        boolean wide = cols >= 4;
        boolean newDay = s.newDay(now);
        RemoteViews v = Render.views(c, R.layout.kfw_routines);
        int done = 0;
        for (int i = 0; i < list.length(); i++) if (!newDay && list.optJSONObject(i).optBoolean("done")) done++;
        String tally = done + " / " + list.length();
        if (wide) {
            v.setTextViewText(R.id.cap, "Routines · " + tally);
            v.setViewVisibility(R.id.count, View.GONE);
            int best = s.j.optInt("bestStreak");
            if (best > 0) {
                v.setViewVisibility(R.id.best, View.VISIBLE);
                v.setTextViewText(R.id.best_text, "best streak " + best);
            }
        } else {
            v.setTextViewText(R.id.count, tally);
        }
        int room = rows <= 2 ? 3 : 5;
        for (int i = 0; i < Math.min(room, list.length()); i++) {
            JSONObject r = list.optJSONObject(i);
            boolean d = !newDay && r.optBoolean("done");
            RemoteViews row = new RemoteViews(c.getPackageName(), wide ? R.layout.kfw_row_routine_week : R.layout.kfw_row_check);
            if (i > 0) Render.dash(c, v);
            row.setTextViewText(R.id.title, Render.struck(r.optString("title"), d));
            if (d) Render.textColor(c, row, R.id.title, R.color.kfw_ink_faint);
            Render.box(c, row, R.id.box, d, false, "routine", r.optString("id"));
            if (wide) {
                JSONArray w = r.optJSONArray("week");
                int[] ids = {R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6};
                for (int k = 0; k < 7; k++) {
                    int p = w == null ? 0 : w.optInt(k);
                    row.setImageViewResource(ids[k], p == 2 ? R.drawable.kfw_dot_sage : p == 1 ? R.drawable.kfw_dot_blossom : R.drawable.kfw_dot_empty);
                }
            }
            v.addView(R.id.rows, row);
        }
        Render.stale(v, s, now);
        v.setOnClickPendingIntent(R.id.root, open(c, "/routines"));
        return v;
    }

    private static RemoteViews streak(Context c, int cols, int rows, Snap s) {
        JSONObject k = s.obj("streak");
        int days = k == null ? 0 : k.optInt("days");
        if (cols <= 1 && rows <= 1) {
            RemoteViews v = tap(c, R.layout.kfw_streak_tiny, "/routines");
            v.setTextViewText(R.id.title, String.valueOf(days));
            return v;
        }
        if (k == null) return Render.state(c, "Streak", 0, R.drawable.kfw_art_vine_sprouting, 56, null, "No streak yet", null, null, open(c, "/routines"));
        RemoteViews v = tap(c, R.layout.kfw_streak, "/routines");
        v.setTextViewText(R.id.cap, k.optString("title") + " · streak");
        v.setTextViewText(R.id.title, days + (days == 1 ? " day" : " days"));
        int goal = k.optInt("goal");
        v.setTextViewText(R.id.time, goal > 0 ? "goal " + goal : "");
        v.setImageViewResource(R.id.art, days >= 7 ? R.drawable.kfw_art_vine_flowering : R.drawable.kfw_art_vine_sprouting);
        return v;
    }

    // ── Triage ──

    private static RemoteViews inbox(Context c, int cols, int rows, Snap s) {
        int n = s.j.optInt("inbox");
        if (cols <= 1 && rows <= 1) {
            RemoteViews v = tap(c, R.layout.kfw_inbox_tiny, "/inbox");
            v.setImageViewResource(R.id.art, n == 0 ? R.drawable.kfw_art_hydrangea_zero : R.drawable.kfw_art_hydrangea_light);
            v.setTextViewText(R.id.count, String.valueOf(n));
            if (n == 0) v.setViewVisibility(R.id.count, View.GONE);
            return v;
        }
        // S6 Inbox zero: the empty hydrangea.
        if (n == 0) return Render.state(c, "Inbox", 0, R.drawable.kfw_art_hydrangea_zero, 64, "all sorted ✿", null, null, null, open(c, "/inbox"));
        RemoteViews v = tap(c, R.layout.kfw_inbox, "/inbox");
        v.setTextViewText(R.id.count, String.valueOf(n));
        v.setImageViewResource(R.id.art, n >= 3 ? R.drawable.kfw_art_hydrangea_medium : R.drawable.kfw_art_hydrangea_light);
        v.setOnClickPendingIntent(R.id.sort, open(c, "/inbox"));
        return v;
    }

    private static RemoteViews overdue(Context c, Snap s) {
        JSONObject o = s.obj("overdue");
        int n = o == null ? 0 : o.optInt("count");
        if (n == 0) return Render.state(c, "Overdue", R.color.kfw_overdue, R.drawable.kfw_art_clover_seedling, 56, "nothing overdue", null, null, null, open(c, "/today"));
        RemoteViews v = tap(c, R.layout.kfw_overdue, "/today");
        v.setTextViewText(R.id.count, String.valueOf(n));
        int oldest = o.optInt("oldestDays");
        v.setTextViewText(R.id.time, oldest <= 1 ? "since yesterday" : "oldest " + oldest + " days");
        JSONArray t = o.optJSONArray("titles");
        for (int i = 0; t != null && i < Math.min(2, t.length()); i++) {
            RemoteViews line = new RemoteViews(c.getPackageName(), R.layout.kfw_row_line);
            line.setTextViewText(R.id.title, t.optString(i));
            v.addView(R.id.rows, line);
        }
        v.setOnClickPendingIntent(R.id.replan, open(c, "/today?kfAction=replan"));
        return v;
    }

    private static RemoteViews slipping(Context c, Snap s) {
        JSONArray a = s.arr("slipping");
        if (a.length() == 0) return Render.state(c, "Slipping", R.color.kfw_gold, R.drawable.kfw_art_clover_four_leaf, 48, "nothing slipping", null, null, null, open(c, "/today"));
        RemoteViews v = tap(c, R.layout.kfw_slipping, "/today");
        int min = Integer.MAX_VALUE;
        for (int i = 0; i < Math.min(3, a.length()); i++) {
            JSONObject r = a.optJSONObject(i);
            RemoteViews row = new RemoteViews(c.getPackageName(), R.layout.kfw_row_slip);
            row.setTextViewText(R.id.title, r.optString("title"));
            row.setTextViewText(R.id.time, r.optInt("days") + "d");
            v.addView(R.id.rows, row);
        }
        for (int i = 0; i < a.length(); i++) min = Math.min(min, a.optJSONObject(i).optInt("days"));
        v.setTextViewText(R.id.foot, "quiet " + min + "+ days");
        return v;
    }

    // ── Rituals & reflection ──

    /** W29 / W30: Plan my day in the morning, Shut down from 17:00, a closed day after. */
    private static RemoteViews ritual(Context c, Snap s, long now) {
        JSONObject r = s.obj("ritual");
        if (r == null) r = new JSONObject();
        boolean evening = s.minutes(now) >= 17 * 60;
        String phase = s.newDay(now) ? (evening ? "shutdown" : "plan") : r.optString("phase", "now");
        if (phase.equals("now")) phase = evening ? "shutdown" : "plan"; // the widget always offers its ritual
        RemoteViews v = Render.views(c, R.layout.kfw_ritual);
        if (phase.equals("closed")) {
            v.setImageViewResource(R.id.art, R.drawable.kfw_art_daisy_evening);
            v.setTextViewText(R.id.cap, "Evening · closed");
            Render.textColor(c, v, R.id.cap, R.color.kfw_lavender_text);
            v.setTextViewText(R.id.title, "The garden’s closed");
            v.setTextViewText(R.id.meta, "see you in the morning");
            v.setViewVisibility(R.id.go, View.GONE);
            v.setOnClickPendingIntent(R.id.root, open(c, "/today"));
            s.at(s.nextMidnight(now), now);
            return v;
        }
        boolean plan = phase.equals("plan");
        if (plan) s.at(s.nextMidnight(now) - 7 * 3_600_000L, now); // 17:00: the evening face
        int inbox = s.j.optInt("inbox");
        JSONObject o = s.obj("overdue");
        int overdue = o == null ? 0 : o.optInt("count");
        if (plan) {
            v.setImageViewResource(R.id.art, R.drawable.kfw_art_daisy_morning);
            v.setTextViewText(R.id.cap, "Morning · not planned");
            v.setTextViewText(R.id.title, "Plan my day");
            String meta = "~5 min";
            if (inbox > 0) meta += " · " + inbox + " in Inbox";
            if (overdue > 0) meta += " · " + overdue + " overdue";
            v.setTextViewText(R.id.meta, meta);
            v.setTextViewText(R.id.go, "Plan");
            v.setOnClickPendingIntent(R.id.go, open(c, "/today?kfAction=plan"));
            v.setOnClickPendingIntent(R.id.root, open(c, "/today?kfAction=plan"));
        } else {
            JSONObject p = s.obj("progress");
            int done = p == null || s.newDay(now) ? 0 : p.optInt("done");
            int total = p == null || s.newDay(now) ? 0 : p.optInt("total");
            v.setImageViewResource(R.id.art, R.drawable.kfw_art_daisy_evening);
            v.setTextViewText(R.id.cap, total > 0 ? "Evening · " + done + " of " + total + " done" : "Evening");
            Render.textColor(c, v, R.id.cap, R.color.kfw_lavender_text);
            v.setTextViewText(R.id.title, "Shut down the day");
            int carry = Math.max(0, total - done);
            v.setTextViewText(R.id.meta, "~3 min" + (carry > 0 ? " · " + carry + " to carry over" : ""));
            v.setTextViewText(R.id.go, "Close");
            v.setOnClickPendingIntent(R.id.go, open(c, "/today?kfAction=shutdown"));
            v.setOnClickPendingIntent(R.id.root, open(c, "/today?kfAction=shutdown"));
        }
        return v;
    }

    private static RemoteViews journal(Context c, Snap s, long now) {
        RemoteViews v = tap(c, R.layout.kfw_journal, "/journal?kfAction=journal");
        JSONObject j = s.obj("journal");
        String line = j == null || s.newDay(now) ? "" : j.optString("line", "");
        if (line.isEmpty() || line.equals("null")) {
            v.setTextViewText(R.id.line, "one line about today…");
            Render.textColor(c, v, R.id.line, R.color.kfw_ink_faint);
        } else {
            v.setTextViewText(R.id.line, line);
            v.setTextViewText(R.id.write, "Edit");
        }
        v.setOnClickPendingIntent(R.id.write, open(c, "/journal?kfAction=journal"));
        v.setOnClickPendingIntent(R.id.mic, open(c, "/journal?kfAction=journal-voice"));
        return v;
    }

    private static RemoteViews memory(Context c, Snap s) {
        JSONObject m = s.obj("memory");
        if (m == null) return Render.state(c, "From a while ago", 0, R.drawable.kfw_art_envelope_front, 40, null, "Nothing to resurface today", null, null, open(c, "/today"));
        RemoteViews v = tap(c, R.layout.kfw_memory, m.optString("route", "/today"));
        v.setTextViewText(R.id.cap, "From a while ago" + (m.optString("when").isEmpty() ? "" : " · " + m.optString("when")));
        v.setTextViewText(R.id.title, "“" + m.optString("text") + "”");
        v.setTextViewText(R.id.meta, m.optString("source"));
        return v;
    }

    private static RemoteViews pressed(Context c, Snap s) {
        JSONObject p = s.obj("specimen");
        if (p == null) return Render.state(c, "Pressed", 0, R.drawable.kfw_art_clover_seedling, 56, null, "Nothing pressed yet", null, null, open(c, "/herbarium"));
        RemoteViews v = tap(c, R.layout.kfw_pressed, "/herbarium");
        v.setTextViewText(R.id.cap, "Pressed · " + p.optString("date"));
        v.setImageViewResource(R.id.art, art(c, p.optString("art"), R.drawable.kfw_art_wisteria_p80));
        v.setTextViewText(R.id.title, p.optString("title"));
        return v;
    }

    private static RemoteViews season(Context c, Snap s) {
        JSONObject n = s.obj("season");
        RemoteViews v = tap(c, R.layout.kfw_season, "/today");
        v.setTextViewText(R.id.cap, n == null ? "" : n.optString("name"));
        String w = n == null ? "" : n.optString("weather", "");
        v.setTextViewText(R.id.title, w.isEmpty() || w.equals("null") ? "Kai’s Flow" : w);
        if (n != null) v.setImageViewResource(R.id.art, art(c, n.optString("art"), R.drawable.kfw_art_daisy_midday));
        return v;
    }
}
