package com.kaisflow.garden.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** NowNext: the lock screen's two lines and the minute they next change (Gym, Dinner, midnight, all-day, overlaps). */
public class NowNextTest {
    private static int at(int h, int m) {
        return h * 60 + m;
    }

    private static LockPlan.Block blk(int from, int to, String title, int color) {
        return new LockPlan.Block(from, to, title, color, false);
    }

    private static final int FERN = 0xFF72BF8E;
    private static final int ROSE = 0xFFE58F99;
    private static final int GOLD = 0xFFC9A55A;

    private static final LockPlan.Block GYM = blk(at(18, 0), at(19, 15), "Gym", FERN);
    private static final LockPlan.Block DINNER = blk(at(21, 0), at(22, 0), "Dinner", ROSE);
    private static final List<LockPlan.Block> DAY = Arrays.asList(DINNER, GYM); // unsorted on purpose

    @Test
    public void nowThenNext() {
        assertEquals("Now: Gym until 7:15 PM", NowNext.title(DAY, at(18, 30), false));
        assertEquals("Next: Dinner 9:00 PM", NowNext.text(DAY, at(18, 30), false));
        assertEquals("Now: Gym until 7:15 PM · Next: Dinner 9:00 PM", NowNext.line(DAY, at(18, 30), false));
    }

    @Test
    public void followsTheClockSetting() {
        assertEquals("Now: Gym until 19:15 · Next: Dinner 21:00", NowNext.line(DAY, at(18, 30), true));
        assertEquals("Next: Gym 06:05", NowNext.title(Collections.singletonList(blk(at(6, 5), at(7, 0), "Gym", FERN)), at(5, 0), true));
        assertEquals("Next: Run 12:05 AM", NowNext.title(Collections.singletonList(blk(at(0, 5), at(1, 0), "Run", FERN)), 0, false)); // 12, not 0
        assertEquals("Next: Lunch 12:00 PM", NowNext.title(Collections.singletonList(blk(at(12, 0), at(13, 0), "Lunch", FERN)), at(9, 0), false));
    }

    @Test
    public void nothingRunningSaysWhatIsNext() {
        assertEquals("Next: Gym 6:00 PM", NowNext.line(DAY, at(9, 0), false));
        assertEquals("Next: Dinner 9:00 PM", NowNext.line(DAY, at(19, 15), false)); // the end is exclusive
        assertNull(NowNext.current(DAY, at(19, 15)));
    }

    @Test
    public void lastBlockOfTheDay() {
        assertEquals("Now: Dinner until 10:00 PM · Nothing else today", NowNext.line(DAY, at(21, 30), false));
        assertEquals("Free for the rest of today", NowNext.line(DAY, at(22, 0), false));
        assertEquals("Free for the rest of today", NowNext.line(Collections.<LockPlan.Block>emptyList(), at(12, 0), false));
    }

    @Test
    public void theGoalKeepsItsStar() {
        List<LockPlan.Block> day = Collections.singletonList(new LockPlan.Block(at(13, 30), at(15, 0), "CNN notes", GOLD, true));
        assertEquals("Next: ✶ CNN notes 1:30 PM", NowNext.title(day, at(12, 0), false));
    }

    @Test
    public void aBlockPastMidnightEndsAtMidnight() {
        // LockScreen clips a block that runs on into tomorrow to minute 1440.
        List<LockPlan.Block> day = Arrays.asList(blk(at(23, 0), 24 * 60, "Movie", ROSE), blk(0, at(1, 0), "Left over", FERN));
        assertEquals("Now: Movie until midnight", NowNext.title(day, at(23, 30), false));
        assertEquals("Now: Movie until midnight", NowNext.title(day, at(23, 30), true));
        assertEquals("Now: Left over until 1:00 AM", NowNext.title(day, at(0, 30), false)); // ran in from yesterday
        assertEquals(24 * 60, NowNext.nextChange(day, at(23, 30))); // the day rolls over: the app's next push redraws
        assertEquals(at(1, 0), NowNext.nextChange(day, at(0, 30)));
    }

    @Test
    public void nothingStartsAtTheDaysEnd() {
        // A block clipped to start at 1440 belongs to tomorrow: never "next".
        assertNull(NowNext.next(Collections.singletonList(blk(24 * 60, 24 * 60 + 30, "Tomorrow", ROSE)), at(23, 0)));
    }

    @Test
    public void anAllDayItemIsNotABlock() {
        List<LockPlan.Block> day = Arrays.asList(blk(0, 24 * 60, "Eid", ROSE), GYM);
        assertNull(NowNext.current(day, at(12, 0)));
        assertEquals("Next: Gym 6:00 PM", NowNext.line(day, at(12, 0), false));
        assertEquals(at(18, 0), NowNext.nextChange(day, at(12, 0)));
        assertEquals("Free for the rest of today", NowNext.line(Collections.singletonList(blk(0, 24 * 60, "Eid", ROSE)), at(12, 0), false));
        assertEquals(-1, NowNext.nextChange(Collections.singletonList(blk(0, 24 * 60, "Eid", ROSE)), at(12, 0)));
        assertEquals("Free for the rest of today", NowNext.line(Collections.singletonList(blk(at(9, 0), at(9, 0), "Zero", ROSE)), at(8, 0), false)); // zero-length
    }

    @Test
    public void overlappingBlocks() {
        LockPlan.Block a = blk(at(9, 0), at(11, 0), "Lecture", ROSE);
        LockPlan.Block b = blk(at(10, 0), at(10, 30), "Call", FERN);
        List<LockPlan.Block> day = Arrays.asList(a, b);
        assertEquals("Now: Lecture until 11:00 AM · Next: Call 10:00 AM", NowNext.line(day, at(9, 30), false));
        // inside both: the one that ends first is the one on, and nothing starts after
        assertEquals(b, NowNext.current(day, at(10, 10)));
        assertEquals("Now: Call until 10:30 AM · Nothing else today", NowNext.line(day, at(10, 10), false));
        // the call is over, the lecture is still on
        assertEquals(a, NowNext.current(day, at(10, 45)));
        // same end: the earlier start wins
        assertEquals(a, NowNext.current(Arrays.asList(blk(at(9, 30), at(11, 0), "Late", FERN), a), at(10, 0)));
        // starting together: either is fine but never null, and the change is the first end
        assertEquals(at(10, 30), NowNext.nextChange(day, at(10, 10)));
    }

    @Test
    public void nextChangeIsTheNearestStartOrEnd() {
        assertEquals(at(18, 0), NowNext.nextChange(DAY, at(3, 0)));
        assertEquals(at(19, 15), NowNext.nextChange(DAY, at(18, 0))); // a start at `now` has already happened
        assertEquals(at(21, 0), NowNext.nextChange(DAY, at(19, 15)));
        assertEquals(at(22, 0), NowNext.nextChange(DAY, at(21, 0)));
        assertEquals(-1, NowNext.nextChange(DAY, at(22, 0))); // none left today: midnight is the alarm
        assertEquals(-1, NowNext.nextChange(Collections.<LockPlan.Block>emptyList(), at(9, 0)));
    }

    @Test
    public void accentIsTheBlockOnElseTheNext() {
        assertEquals(FERN, NowNext.accent(DAY, at(18, 30)));
        assertEquals(ROSE, NowNext.accent(DAY, at(19, 30)));
        assertEquals(0, NowNext.accent(DAY, at(23, 0)));
    }

    @Test
    public void quietHoursCrossMidnight() {
        int from = at(22, 30);
        int to = at(7, 0);
        assertTrue(NowNext.quiet(at(23, 0), true, from, to));
        assertTrue(NowNext.quiet(at(0, 0), true, from, to));
        assertTrue(NowNext.quiet(at(6, 59), true, from, to));
        assertFalse(NowNext.quiet(at(7, 0), true, from, to)); // the end is exclusive
        assertFalse(NowNext.quiet(at(12, 0), true, from, to));
        assertTrue(NowNext.quiet(at(22, 30), true, from, to));
        assertFalse(NowNext.quiet(at(23, 0), false, from, to)); // switched off
        assertFalse(NowNext.quiet(at(23, 0), true, at(8, 0), at(8, 0))); // an empty window
        assertTrue(NowNext.quiet(at(13, 0), true, at(12, 0), at(14, 0))); // inside one day
        assertFalse(NowNext.quiet(at(14, 0), true, at(12, 0), at(14, 0)));
    }

    @Test
    public void quietChangesAreAlarms() {
        int from = at(22, 30);
        int to = at(7, 0);
        assertEquals(at(7, 0), NowNext.quietChange(at(3, 0), true, from, to));
        assertEquals(at(22, 30), NowNext.quietChange(at(7, 0), true, from, to));
        assertEquals(-1, NowNext.quietChange(at(23, 0), true, from, to)); // midnight is the next alarm, then 7:00
        assertEquals(-1, NowNext.quietChange(at(3, 0), false, from, to));
        assertEquals(at(7, 0), NowNext.earliest(at(18, 0), at(7, 0)));
        assertEquals(at(7, 0), NowNext.earliest(-1, at(7, 0)));
        assertEquals(at(7, 0), NowNext.earliest(at(7, 0), -1));
        assertEquals(-1, NowNext.earliest(-1, -1));
    }
}
