package com.kaisflow.garden.widgets;

import java.util.ArrayList;
import java.util.List;

/**
 * Her day widget's rules (Partner sharing P2, flow 6), as plain numbers: which of her blocks is on, which come next, what a
 * title may say, and when the widget has gone out of date. No Android in here, so it runs as a plain JUnit test
 * (native/android/test/.../HerDayPlanTest.java). HerDay draws it. Mirrors src/features/widgets/partnerSnapshot.ts
 * (PARTNER_STALE_MS): the app writes her masked day into the snapshot, and the widget may not show more than that.
 */
public final class HerDayPlan {
    private HerDayPlan() {}

    /** A day old: the widget greys out and hides titles. Same rule as her calendar lane. */
    static final long STALE_MS = 24L * 60 * 60 * 1000;

    /** One of her timed blocks; `title` is null for a Busy block (the server left it out, or this phone hides titles). */
    public static final class Blk {
        final long start;
        final long end;
        final String title;

        public Blk(long start, long end, String title) {
            this.start = start;
            this.end = end;
            this.title = title;
        }
    }

    /** More than a day since the app last read her day: nothing here is shown by name any more. */
    static boolean stale(long at, long now) {
        return now - at > STALE_MS;
    }

    /** The block on at `now`; of two that overlap, the one that started last. */
    static Blk running(List<Blk> blocks, long now) {
        Blk best = null;
        for (Blk b : blocks) if (b.start <= now && now < b.end && (best == null || b.start > best.start)) best = b;
        return best;
    }

    /** The blocks still to come after `now`, by start, at most `max`. */
    static List<Blk> next(List<Blk> blocks, long now, int max) {
        List<Blk> out = new ArrayList<>();
        for (Blk b : blocks) if (b.start > now) out.add(b);
        out.sort((a, b) -> Long.compare(a.start, b.start));
        return out.size() > max ? new ArrayList<>(out.subList(0, max)) : out;
    }

    /** What the row says: a Busy block, or any block once the widget is out of date, says only "Busy". */
    static String title(Blk b, boolean stale) {
        return stale || b.title == null || b.title.isEmpty() ? "Busy" : b.title;
    }

    /** The earliest moment after `now` when the face changes: a block starts or ends, or it goes out of date. 0 = none. */
    static long nextChange(List<Blk> blocks, long now, long at) {
        long t = Long.MAX_VALUE;
        for (Blk b : blocks) {
            if (b.start > now && b.start < t) t = b.start;
            if (b.end > now && b.end < t) t = b.end;
        }
        long staleAt = at + STALE_MS + 1;
        if (staleAt > now && staleAt < t) t = staleAt;
        return t == Long.MAX_VALUE ? 0 : t;
    }
}
