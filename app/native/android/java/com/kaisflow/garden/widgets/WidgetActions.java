package com.kaisflow.garden.widgets;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The widgets' own taps that don't open the app: a tick (task, goal, routine) and focus Stop / Done.
 * Each is drawn at once and queued (Snap.tick); a running app is told straight away
 * (WidgetBridge.nudge), otherwise it applies the queue the next time it starts. Also the redraw alarm.
 */
public class WidgetActions extends BroadcastReceiver {
    static final String TICK = "com.kaisflow.garden.widget.TICK";
    static final String REFRESH = "com.kaisflow.garden.widget.REFRESH";
    public static final String EXTRA_PATH = "kf_widget_path";

    @Override
    public void onReceive(Context c, Intent intent) {
        if (TICK.equals(intent.getAction())) {
            try {
                JSONObject op = new JSONObject().put("t", intent.getStringExtra("t")).put("id", intent.getStringExtra("id"));
                Snap.tick(c, op);
            } catch (JSONException e) {
                Log.w("KfWidget", "tick", e);
                return;
            }
            WidgetBridge.nudge();
        }
        KfWidget.updateAll(c);
    }
}
