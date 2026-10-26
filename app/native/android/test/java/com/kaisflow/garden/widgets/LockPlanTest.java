package com.kaisflow.garden.widgets;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** LockPlan on the design's day (Phone home options.html #lockscreen): lecture, the goal, the gym. */
public class LockPlanTest {
    private static int at(int h, int m) {
        return h * 60 + m;
    }

    // Palette C (res/values/kfw_palette.xml): Rose for an event, the goal's gold, Fern for the gym.
    private static final int ROSE = 0xFFE58F99;
    private static final int GOLD = 0xFFC9A55A;
    private static final int FERN = 0xFF72BF8E;
    private static final int IRIS = 0xFFB59CE3;

    private static final LockPlan.Block LECTURE = new LockPlan.Block(at(11, 0), at(12, 30), "Lecture — Computer Vision", ROSE, false);
    private static final LockPlan.Block GOAL = new LockPlan.Block(at(13, 30), at(15, 0), "CNN notes", GOLD, true);
    private static final LockPlan.Block GYM = new LockPlan.Block(at(18, 0), at(19, 0), "Gym", FERN, false);
    private static final List<LockPlan.Block> DAY = Arrays.asList(GYM, LECTURE, GOAL); // unsorted on purpose

    @Test
    public void currentAndNext() {
        assertEquals(LECTURE, LockPlan.current(DAY, at(11, 10)));
        assertEquals(GOAL, LockPlan.next(DAY, at(11, 10)));
        assertNull(LockPlan.current(DAY, at(12, 30))); // the end is exclusive
        assertEquals(GOAL, LockPlan.next(DAY, at(12, 30)));
        assertNull(LockPlan.next(DAY, at(18, 0)));
    }

    @Test
    public void showsOnlyNearABlock() {
        assertFalse(LockPlan.showing(DAY, at(3, 0)));
        assertTrue(LockPlan.showing(DAY, at(9, 0))); // the lecture is 2 h away
        assertTrue(LockPlan.showing(DAY, at(11, 30)));
        assertFalse(LockPlan.showing(DAY, at(19, 0)));
    }

    @Test
    public void nextChangeIsTheNearestStartEndOrLeadIn() {
        assertEquals(at(9, 0), LockPlan.nextChange(DAY, at(3, 0)));
        assertEquals(at(11, 30), LockPlan.nextChange(DAY, at(11, 10))); // the goal's lead-in
        assertEquals(at(12, 30), LockPlan.nextChange(DAY, at(11, 40)));
        assertEquals(-1, LockPlan.nextChange(DAY, at(19, 0)));
    }

    @Test
    public void segmentsCoverTheWindowInEachBlocksColour() {
        int[] w = LockPlan.window(DAY);
        assertArrayEquals(new int[] {at(7, 0), at(23, 0)}, w);
        List<int[]> s = LockPlan.segments(DAY, w[0], w[1]);
        int[][] want = {
            {240, LockPlan.GAP}, {90, ROSE}, {60, LockPlan.GAP}, {90, GOLD},
            {180, LockPlan.GAP}, {60, FERN}, {240, LockPlan.GAP},
        };
        assertEquals(want.length, s.size());
        int total = 0;
        for (int i = 0; i < want.length; i++) {
            assertArrayEquals("segment " + i, want[i], s.get(i));
            total += s.get(i)[0];
        }
        assertEquals(w[1] - w[0], total);
    }

    @Test
    public void windowWidensAndOverlapsAreCut() {
        List<LockPlan.Block> early = Arrays.asList(
            new LockPlan.Block(at(5, 45), at(7, 0), "Run", IRIS, false),
            new LockPlan.Block(at(6, 30), at(8, 0), "Overlap", IRIS, false),
            new LockPlan.Block(at(23, 30), 24 * 60, "Late", ROSE, false));
        int[] w = LockPlan.window(early);
        assertArrayEquals(new int[] {at(5, 0), 24 * 60}, w);
        List<int[]> s = LockPlan.segments(early, w[0], w[1]);
        assertArrayEquals(new int[] {45, LockPlan.GAP}, s.get(0));
        assertArrayEquals(new int[] {75, IRIS}, s.get(1));
        assertArrayEquals(new int[] {60, IRIS}, s.get(2)); // the overlap starts where Run ends
        for (int[] seg : s) assertTrue(seg[0] >= 1); // a ProgressStyle segment can't be empty
    }

    @Test
    public void words() {
        assertEquals("Lecture — Computer Vision", LockPlan.title(DAY, at(11, 10)));
        assertEquals("11:00–12:30 · then ✶ CNN notes 13:30", LockPlan.text(DAY, at(11, 10)));
        assertEquals("Next · ✶ CNN notes", LockPlan.title(DAY, at(12, 40)));
        assertEquals("13:30–15:00", LockPlan.text(DAY, at(12, 40)));
        assertEquals("Gym", LockPlan.title(DAY, at(18, 5)));
        assertEquals("18:00–19:00", LockPlan.text(DAY, at(18, 5)));
        assertEquals("Nothing else today", LockPlan.title(DAY, at(20, 0)));
    }

    @Test
    public void countdownTarget() {
        assertEquals(at(12, 30), LockPlan.target(DAY, at(11, 10)));
        assertEquals(at(13, 30), LockPlan.target(DAY, at(12, 40)));
        assertEquals(-1, LockPlan.target(DAY, at(19, 30)));
    }
}
