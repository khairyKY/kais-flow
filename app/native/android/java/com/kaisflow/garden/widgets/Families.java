package com.kaisflow.garden.widgets;

import android.content.Context;
import android.widget.RemoteViews;
import com.kaisflow.garden.R;

/** The families after Today: Capture, Calendar, Focus, Routines & streaks, Triage, Rituals & reflection. */
final class Families {
    private Families() {}

    static RemoteViews build(Context c, String kind, int cols, int rows, Snap s, long now) {
        return new RemoteViews(c.getPackageName(), R.layout.kfw_loading);
    }
}
