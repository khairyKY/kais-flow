package com.kaisflow.garden.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** FocusBar's geometry: Focus D3's rounds and breaks laid side by side, widths following the minutes. */
public class FocusBarTest {
    @Test
    public void widthsFollowTheMinutesWithAGapBetween() {
        // 25 · 5 · 25 on 300 px with 2 px gaps: 296 px of segments, 25/55 and 5/55 of it.
        float[] x = FocusBar.spans(new int[] {25, 5, 25}, 300, 2);
        float round = 296f * 25 / 55;
        float brk = 296f * 5 / 55;
        assertEquals(0f, x[0], 0.01f);
        assertEquals(round, x[1], 0.01f);
        assertEquals(round + 2, x[2], 0.01f);
        assertEquals(round + 2 + brk, x[3], 0.01f);
        assertEquals(300f, x[5], 0.01f); // the last one ends on the edge
    }

    @Test
    public void oneSegmentFillsTheBar() {
        float[] x = FocusBar.spans(new int[] {25}, 120, 2);
        assertEquals(0f, x[0], 0.01f);
        assertEquals(120f, x[1], 0.01f);
    }

    @Test
    public void aNarrowBarNeverGoesNegative() {
        float[] x = FocusBar.spans(new int[] {25, 5, 25, 5, 25}, 6, 2);
        for (int i = 1; i < x.length; i++) assertTrue(x[i] >= x[i - 1]);
    }

    @Test
    public void fractionIsHowFarThroughTheSegment() {
        assertEquals(0f, FocusBar.frac(25 * 60_000L, 25), 0.001f);
        assertEquals(0.5f, FocusBar.frac(150_000L, 5), 0.001f);
        assertEquals(1f, FocusBar.frac(-1000L, 5), 0.001f); // past its end
        assertEquals(0f, FocusBar.frac(999_999_999L, 5), 0.001f); // a stale clock never goes negative
    }
}
