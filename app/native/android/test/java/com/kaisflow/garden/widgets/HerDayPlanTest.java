package com.kaisflow.garden.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** Her day widget: now, next, what a title may say, and the 24 hours after which it greys out and hides titles. */
public class HerDayPlanTest {
    private static final long MIN = 60_000L;
    private static final long NOW = 1_000_000_000_000L;

    private static HerDayPlan.Blk b(long fromMin, long toMin, String title) {
        return new HerDayPlan.Blk(NOW + fromMin * MIN, NOW + toMin * MIN, title);
    }

    @Test
    public void nowIsTheBlockRunningAndNextTheOnesToCome() {
        HerDayPlan.Blk lecture = b(-10, 50, "Pharmacology lecture");
        HerDayPlan.Blk group = b(120, 180, "Study group");
        HerDayPlan.Blk over = b(-200, -100, "Over already");
        HerDayPlan.Blk dinner = b(300, 360, null);
        List<HerDayPlan.Blk> all = Arrays.asList(dinner, over, group, lecture);
        assertSame(lecture, HerDayPlan.running(all, NOW));
        List<HerDayPlan.Blk> next = HerDayPlan.next(all, NOW, 2);
        assertEquals(2, next.size());
        assertSame(group, next.get(0));
        assertSame(dinner, next.get(1));
    }

    @Test
    public void ofTwoOverlappingTheLatestStartedIsNow() {
        HerDayPlan.Blk early = b(-60, 60, "Early");
        HerDayPlan.Blk late = b(-5, 30, "Late");
        assertSame(late, HerDayPlan.running(Arrays.asList(early, late), NOW));
    }

    @Test
    public void nothingRunningIsNull() {
        assertNull(HerDayPlan.running(Arrays.asList(b(10, 20, "x")), NOW));
        assertTrue(HerDayPlan.next(Arrays.asList(b(-20, -10, "x")), NOW, 2).isEmpty());
    }

    @Test
    public void aBlockEndingExactlyNowIsOver() {
        assertNull(HerDayPlan.running(Arrays.asList(b(-30, 0, "x")), NOW));
    }

    @Test
    public void aBusyBlockHasNoNameAndAStaleOneHidesEveryName() {
        assertEquals("Busy", HerDayPlan.title(b(0, 1, null), false));
        assertEquals("Busy", HerDayPlan.title(b(0, 1, ""), false));
        assertEquals("Lecture", HerDayPlan.title(b(0, 1, "Lecture"), false));
        assertEquals("Busy", HerDayPlan.title(b(0, 1, "Lecture"), true));
    }

    @Test
    public void outOfDateIsMoreThanADayAndNotBefore() {
        long day = 24L * 60 * MIN;
        assertFalse(HerDayPlan.stale(NOW - day, NOW));
        assertTrue(HerDayPlan.stale(NOW - day - 1, NOW));
        assertFalse(HerDayPlan.stale(NOW, NOW));
    }

    @Test
    public void theNextChangeIsTheEarliestStartEndOrTheMomentItGoesStale() {
        List<HerDayPlan.Blk> all = Arrays.asList(b(-10, 50, "a"), b(120, 180, "b"));
        assertEquals(NOW + 50 * MIN, HerDayPlan.nextChange(all, NOW, NOW));
        assertEquals(NOW + 120 * MIN, HerDayPlan.nextChange(Arrays.asList(b(120, 180, "b")), NOW, NOW));
        // nothing on, and it was read 23h30m ago: it goes stale in 30 minutes (one past the day), before anything starts
        long at = NOW - (23 * 60 + 30) * MIN;
        assertEquals(at + 24L * 60 * MIN + 1, HerDayPlan.nextChange(Arrays.asList(b(600, 700, "later")), NOW, at));
        assertEquals(0, HerDayPlan.nextChange(Arrays.asList(), NOW, NOW - 25L * 60 * MIN));
    }
}
