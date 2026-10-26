package com.kaisflow.garden.widgets;

import java.util.ArrayList;
import java.util.List;

/**
 * The lock screen's day, as plain numbers (lockscreen, 2026-10-26): which block is on, which is next,
 * the day as palette C segments, and the words. Minutes since the user's midnight in, no Android in
 * here, so it runs as a plain JUnit test (native/android/test/.../LockPlanTest.java). LockScreen
 * draws it as the Now Bar Live Update (B) and the Day strip notification (C).
 */
public final class LockPlan {
    private LockPlan() {}

    /** A timed block today, in minutes since midnight (one that runs over midnight is clipped to 0 / 1440). */
    public static final class Block {
        final int start;
        final int end;
        final String title;
        final String color;
        final boolean done;

        public Block(int start, int end, String title, String color, boolean done) {
            this.start = start;
            this.end = end;
            this.title = title;
            this.color = color == null ? "" : color;
            this.done = done;
        }

        boolean goal() {
            return color.equals("goal");
        }
    }

    /** How long before a block the notifications appear (none overnight for a 9:00 start). */
    static final int LEAD_MIN = 120;
    /** The strip always shows at least 8:00–22:00 (the design's axis), wider if the day is. */
    static final int DAY_FROM = 8 * 60;
    static final int DAY_TO = 22 * 60;

    // Palette C (src/styles/tokens/colors.css --blk-*): an event is Rose, a task Iris, the goal gold.
    static final int ROSE = 0xFFE58F99;
    static final int IRIS = 0xFFB59CE3;
    static final int GOLD = 0xFFC9A658;
    /** Between blocks: a faint neutral track that reads on a light and a dark shade. */
    static final int GAP = 0x40888888;

    /** A snapshot colour ('goal' | 'lavender' | 'blossom' | '#rrggbb', CALENDAR.md §3) as palette C. */
    static int colorOf(String color) {
        if (color == null) return IRIS;
        switch (color) {
            case "goal": return GOLD;
            case "blossom": return ROSE;
            case "lavender": case "": return IRIS;
            default:
                if (color.matches("#[0-9a-fA-F]{6}")) return 0xFF000000 | Integer.parseInt(color.substring(1), 16);
                return IRIS;
        }
    }

    /** The block on at `now` (the first, if two overlap). */
    static Block current(List<Block> blocks, int now) {
        for (Block b : blocks) if (b.start <= now && now < b.end) return b;
        return null;
    }

    /** The first block starting after `now`. */
    static Block next(List<Block> blocks, int now) {
        Block best = null;
        for (Block b : blocks) if (b.start > now && (best == null || b.start < best.start)) best = b;
        return best;
    }

    /** Something to show: a block on now, or one starting within LEAD_MIN. */
    static boolean showing(List<Block> blocks, int now) {
        Block n = next(blocks, now);
        return current(blocks, now) != null || (n != null && n.start - now <= LEAD_MIN);
    }

    /** The next minute after `now` when what's shown changes (a start, an end, a lead-in); -1 if none today. */
    static int nextChange(List<Block> blocks, int now) {
        int best = -1;
        for (Block b : blocks) {
            for (int t : new int[] {b.start - LEAD_MIN, b.start, b.end}) {
                if (t > now && (best < 0 || t < best)) best = t;
            }
        }
        return best;
    }

    /** The strip's span: 8:00–22:00, widened to whole hours around the day's first and last block. */
    static int[] window(List<Block> blocks) {
        int from = DAY_FROM;
        int to = DAY_TO;
        for (Block b : blocks) {
            from = Math.min(from, b.start / 60 * 60);
            to = Math.max(to, (b.end + 59) / 60 * 60);
        }
        return new int[] {Math.max(0, from), Math.min(24 * 60, to)};
    }

    /** The day as {length in minutes, colour} pieces from `from` to `to`: blocks in their colour, gaps
     * as GAP. Overlaps are cut where the earlier block ends (a progress bar can't stack). */
    static List<int[]> segments(List<Block> blocks, int from, int to) {
        List<Block> sorted = new ArrayList<>(blocks);
        sorted.sort((a, b) -> Integer.compare(a.start, b.start));
        List<int[]> out = new ArrayList<>();
        int at = from;
        for (Block b : sorted) {
            int s = Math.max(b.start, at);
            int e = Math.min(b.end, to);
            if (e <= s) continue;
            if (s > at) out.add(new int[] {s - at, GAP});
            out.add(new int[] {e - s, colorOf(b.color)});
            at = e;
        }
        if (to > at) out.add(new int[] {to - at, GAP});
        return out;
    }

    static String hm(int min) {
        return String.format(java.util.Locale.US, "%02d:%02d", min / 60 % 24, min % 60);
    }

    /** A block's name, or (names off: Settings → Notifications → Show task names on the lock screen) what it is. */
    static String label(Block b, boolean names) {
        if (b.goal()) return "✶ " + (names ? b.title : "Goal of the day");
        return names ? b.title : "A block";
    }

    static String range(Block b) {
        return hm(b.start) + "–" + hm(b.end);
    }

    /** The first line: the block that's on, else "Next · …". */
    static String title(List<Block> blocks, int now, boolean names) {
        Block cur = current(blocks, now);
        if (cur != null) return label(cur, names);
        Block n = next(blocks, now);
        return n == null ? "Nothing else today" : "Next · " + label(n, names);
    }

    /** The second line: its times, then what follows ("11:00–12:30 · then ✶ CNN notes 13:30"). */
    static String text(List<Block> blocks, int now, boolean names) {
        Block cur = current(blocks, now);
        if (cur == null) {
            Block n = next(blocks, now);
            return n == null ? "" : range(n);
        }
        Block then = next(blocks, Math.max(now, cur.end - 1));
        return range(cur) + (then == null ? "" : " · then " + label(then, names) + " " + hm(then.start));
    }

    /** The minute the countdown runs to: the end of the block that's on, else the next start; -1 if none. */
    static int target(List<Block> blocks, int now) {
        Block cur = current(blocks, now);
        if (cur != null) return cur.end;
        Block n = next(blocks, now);
        return n == null ? -1 : n.start;
    }
}
