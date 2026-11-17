package com.kaisflow.garden.widgets;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * "Now / Next on the lock screen" (v165-nownext, 2026-11-17), as plain numbers and words: the block that's on,
 * the one after it, the two lines of the notification, and the minute it next changes. Minutes since the
 * user's midnight in (LockPlan.Block, already clipped to the day, masked and coloured by LockScreen), no
 * Android in here, so it runs as a plain JUnit test (native/android/test/.../NowNextTest.java).
 *
 * Unlike the Day strip it has no 2-hour lead-in: it is there all day (idle: what's next, or "Free").
 */
public final class NowNext {
    private NowNext() {}

    /** 22:30–07:00, the app's quiet-hours defaults (supabase/functions/notify/copy.ts) until the app pushes its own. */
    static final int QUIET_FROM = 22 * 60 + 30;
    static final int QUIET_TO = 7 * 60;
    private static final int DAY = 24 * 60;

    /** Blocks that have a start and an end inside the day. A block that spans the whole day (an all-day item
     *  that came in as 00:00–24:00) is not a block you are "in", and a zero-length one is never on. */
    static List<LockPlan.Block> timed(List<LockPlan.Block> blocks) {
        List<LockPlan.Block> out = new ArrayList<>();
        for (LockPlan.Block b : blocks) {
            if (b.end > b.start && !(b.start <= 0 && b.end >= DAY)) out.add(b);
        }
        return out;
    }

    /** The block on at `now` (start ≤ now < end). Overlapping blocks: the one that ends first (what you finish
     *  next), then the one that started first, then list order. */
    static LockPlan.Block current(List<LockPlan.Block> blocks, int now) {
        LockPlan.Block best = null;
        for (LockPlan.Block b : timed(blocks)) {
            if (b.start > now || now >= b.end) continue;
            if (best == null || b.end < best.end || (b.end == best.end && b.start < best.start)) best = b;
        }
        return best;
    }

    /** The first block that starts after `now`, running or not (a block that starts inside the one on is next). */
    static LockPlan.Block next(List<LockPlan.Block> blocks, int now) {
        LockPlan.Block best = null;
        for (LockPlan.Block b : timed(blocks)) {
            if (b.start > now && b.start < DAY && (best == null || b.start < best.start)) best = b;
        }
        return best;
    }

    /** A time as the app shows it: "7:15 PM", or "19:15" on the 24-hour clock; the day's end is "midnight". */
    static String clock(int min, boolean h24) {
        if (min >= DAY) return "midnight";
        int h = min / 60;
        int m = min % 60;
        if (h24) return String.format(Locale.US, "%02d:%02d", h, m);
        return String.format(Locale.US, "%d:%02d %s", h % 12 == 0 ? 12 : h % 12, m, h < 12 ? "AM" : "PM");
    }

    private static String label(LockPlan.Block b) {
        return b.goal ? "✶ " + b.title : b.title;
    }

    /** The first line: "Now: Gym until 7:15 PM", else "Next: Dinner 9:00 PM", else "Free for the rest of today". */
    static String title(List<LockPlan.Block> blocks, int now, boolean h24) {
        LockPlan.Block cur = current(blocks, now);
        if (cur != null) return "Now: " + label(cur) + " until " + clock(cur.end, h24);
        LockPlan.Block n = next(blocks, now);
        return n == null ? "Free for the rest of today" : "Next: " + label(n) + " " + clock(n.start, h24);
    }

    /** The second line: what follows the block that's on ("Next: Dinner 9:00 PM"); "" when the title says it all. */
    static String text(List<LockPlan.Block> blocks, int now, boolean h24) {
        if (current(blocks, now) == null) return "";
        LockPlan.Block n = next(blocks, now);
        return n == null ? "Nothing else today" : "Next: " + label(n) + " " + clock(n.start, h24);
    }

    /** Both lines in one: "Now: Gym until 7:15 PM · Next: Dinner 9:00 PM" (the expanded text and the screen reader's). */
    static String line(List<LockPlan.Block> blocks, int now, boolean h24) {
        String t = text(blocks, now, h24);
        return title(blocks, now, h24) + (t.isEmpty() ? "" : " · " + t);
    }

    /** The colour it draws: the block that's on, else the next one; 0 when there is none (the caller's default). */
    static int accent(List<LockPlan.Block> blocks, int now) {
        LockPlan.Block b = current(blocks, now);
        if (b == null) b = next(blocks, now);
        return b == null ? 0 : b.color;
    }

    /** The next minute after `now` today when what it says changes (a start or an end); -1 if none. A block
     *  that runs past midnight ends at minute 1440 (the day rollover). */
    static int nextChange(List<LockPlan.Block> blocks, int now) {
        int best = -1;
        for (LockPlan.Block b : timed(blocks)) {
            for (int t : new int[] {b.start, b.end}) {
                if (t > now && (best < 0 || t < best)) best = t;
            }
        }
        return best;
    }

    // ── quiet hours (the app's: Settings → Notifications → Quiet; the window may cross midnight) ──

    static boolean quiet(int now, boolean on, int from, int to) {
        if (!on || from == to) return false;
        return from < to ? now >= from && now < to : now >= from || now < to;
    }

    /** The next minute after `now` today when quiet hours start or end; -1 if none (midnight then does it). */
    static int quietChange(int now, boolean on, int from, int to) {
        if (!on || from == to) return -1;
        int best = -1;
        for (int t : new int[] {from, to}) {
            if (t > now && (best < 0 || t < best)) best = t;
        }
        return best;
    }

    /** The earlier of two minutes, where -1 is none. */
    static int earliest(int a, int b) {
        return a < 0 ? b : b < 0 ? a : Math.min(a, b);
    }
}
