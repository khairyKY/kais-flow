package com.kaisflow.garden.widgets;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kaisflow.garden.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Kai's Flow on the lock screen (lockscreen, 2026-10-26; Phone home options.html #lockscreen):
 *   B · the Now Bar: an Android 16 Live Update, a promoted ongoing ProgressStyle notification with today's
 *       blocks as palette C segments; the countdown chip is drawn by the system from `when` ("20 min").
 *       Below Android 16 the same notification posts as an ordinary ongoing one.
 *   C · the Day strip: an ongoing notification with our own layout, the widgets' Day bar (DayBar), the block
 *       that's on and what's next. Every version; a custom layout can't be promoted, so never the Now Bar.
 *   A · the Top 3 lock widget is LockWidget; it redraws from here.
 * All of it reads the widgets' snapshot (Snap). Redrawn whenever the home-screen widgets are (KfWidget.updateAll:
 * the app's pushes, a tick, their refresh alarm), at the exact minute a block starts or ends (one exact alarm,
 * the app's USE_EXACT_ALARM), at boot and on Settings → Notifications → This phone. No polling.
 */
public final class LockScreen {
    private LockScreen() {}

    private static final String TAG = "KfLock";
    private static final String PREFS = "kf_lock";
    /** Silent, low: never a sound, never heads-up; above MIN so a Live Update may be promoted. No kf_ prefix:
     *  the sound packs' channel clean-up (features/notifications/android.ts staleChannels) leaves it alone. */
    static final String CHANNEL = "lockscreen";
    private static final int ID_NOW_BAR = 7101;
    private static final int ID_STRIP = 7102;
    static final String REFRESH = "com.kaisflow.garden.lock.REFRESH";

    // ── this device's choices (Settings → Notifications → This phone) ──

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The Now Bar is Android 16's (One UI 8). */
    static boolean nowBarSupported() {
        return Build.VERSION.SDK_INT >= 36;
    }

    /** Defaults: the Now Bar on where it exists, the Day strip off. */
    static boolean nowBarOn(Context c) {
        return prefs(c).getBoolean("nowBar", nowBarSupported());
    }

    static boolean stripOn(Context c) {
        return prefs(c).getBoolean("dayStrip", false);
    }

    /** Settings → Notifications → Show task names on the lock screen (the app pushes it; off until then). */
    static boolean names(Context c) {
        return prefs(c).getBoolean("names", false);
    }

    /** The snapshot with names, or (names off) with what things are: the words of the app's own "Hide titles
     *  on the home screen" mask (features/widgets/snapshot.ts mask). */
    static Snap masked(Context c, Snap s) {
        if (s == null || names(c)) return s;
        try {
            JSONObject j = new JSONObject(s.j.toString());
            JSONObject g = j.optJSONObject("goal");
            if (g != null) g.put("title", "Your goal");
            JSONArray picks = j.optJSONArray("picks");
            for (int i = 0; picks != null && i < picks.length(); i++) picks.getJSONObject(i).put("title", "Pick " + (i + 2));
            JSONArray blocks = j.optJSONArray("blocks");
            for (int i = 0; blocks != null && i < blocks.length(); i++) {
                JSONObject b = blocks.getJSONObject(i);
                b.put("title", Render.goalBlock(b) ? "Your goal" : b.optString("taskId").isEmpty() ? "Busy" : "A task");
            }
            return new Snap(j);
        } catch (JSONException e) {
            return null; // never show names by accident
        }
    }

    // ── redraw ──

    /** Everything on the lock screen, from the snapshot as it is now; then the alarm for the next change. */
    @SuppressLint("MissingPermission") // areNotificationsEnabled() is checked; a revoke mid-way is caught
    static void refresh(Context c) {
        channel(c); // made up front, so Android's settings list it before the first block
        LockWidget.updateAll(c);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        Snap s = masked(c, Snap.load(c));
        long now = System.currentTimeMillis();
        List<LockPlan.Block> blocks = s == null || !s.signedIn() || s.newDay(now) ? new ArrayList<>() : blocks(c, s, now);
        int min = s == null ? 0 : s.minutes(now);
        boolean show = LockPlan.showing(blocks, min) && nm.areNotificationsEnabled();
        try {
            if (show && nowBarOn(c)) nm.notify(ID_NOW_BAR, nowBar(c, blocks, min, now));
            else nm.cancel(ID_NOW_BAR);
            if (show && stripOn(c)) nm.notify(ID_STRIP, strip(c, s, blocks, min, now));
            else nm.cancel(ID_STRIP);
        } catch (RuntimeException e) {
            Log.w(TAG, "notify", e); // POST_NOTIFICATIONS revoked, or a bad snapshot: never crash a broadcast
        }
        int next = LockPlan.nextChange(blocks, min);
        schedule(c, s == null ? 0 : next >= 0 ? atMinute(now, min, next) : s.nextMidnight(now));
    }

    /** The epoch time of minute `m` today, given that `now` is minute `min` (zones are whole minutes). */
    private static long atMinute(long now, int min, int m) {
        return now - now % 60_000L + (m - min) * 60_000L;
    }

    /** Today's blocks (Render.blocks), in minutes on the user's clock, in their palette C colour (the goal gold). */
    private static List<LockPlan.Block> blocks(Context c, Snap s, long now) {
        List<LockPlan.Block> out = new ArrayList<>();
        String today = s.day(now);
        int gold = c.getColor(R.color.kfw_gold_warm);
        for (JSONObject b : Render.blocks(s, now)) {
            long start = b.optLong("start");
            long end = b.optLong("end");
            int from = s.day(start).equals(today) ? s.minutes(start) : start < now ? 0 : 24 * 60;
            int to = s.day(end).equals(today) ? s.minutes(end) : end > now ? 24 * 60 : 0;
            boolean goal = Render.goalBlock(b);
            int color = goal ? gold : c.getColor(Render.blkAccent(c, Render.swatch(b)));
            if (to > from) out.add(new LockPlan.Block(from, to, b.optString("title"), color, goal));
        }
        return out;
    }

    private static void channel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Lock screen", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("The block that's on now (Now Bar) and the Day strip. Silent.");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private static NotificationCompat.Builder base(Context c, List<LockPlan.Block> blocks, int min, long now) {
        int target = LockPlan.target(blocks, min);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_kf)
            .setColor(0xFF9C5139)
            .setContentTitle(LockPlan.title(blocks, min))
            .setContentText(LockPlan.text(blocks, min))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(target >= 0)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // names already follow the app's own switch
            .setContentIntent(KfWidget.open(c, "/today"));
        if (target >= 0) b.setWhen(atMinute(now, min, target));
        return b;
    }

    /** B · the Now Bar. Android 16: a Live Update (ProgressStyle, promoted); before: an ordinary ongoing one. */
    private static android.app.Notification nowBar(Context c, List<LockPlan.Block> blocks, int min, long now) {
        NotificationCompat.Builder b = base(c, blocks, min, now);
        int[] w = LockPlan.window(blocks);
        int pos = Math.max(0, Math.min(w[1] - w[0], min - w[0]));
        if (nowBarSupported()) {
            // The chip text comes from `when` (≥ 2 min ahead: "20 min", kept current by the system).
            // A fixed setShortCriticalText("20m") would go stale between redraws, and we don't poll.
            NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle().setStyledByProgress(true).setProgress(pos);
            for (int[] seg : LockPlan.segments(blocks, w[0], w[1])) style.addProgressSegment(new NotificationCompat.ProgressStyle.Segment(seg[0]).setColor(seg[1]));
            b.setStyle(style).setRequestPromotedOngoing(true);
        } else {
            // ponytail: the fallback counts down in the shade (a Chronometer) and shows the day as one bar.
            b.setUsesChronometer(true).setChronometerCountDown(true).setProgress(w[1] - w[0], pos, false);
        }
        return b.build();
    }

    /** C · the Day strip: the widgets' Day bar in our own layout, collapsed (slim bar) and expanded, with Start focus. */
    private static android.app.Notification strip(Context c, Snap s, List<LockPlan.Block> blocks, int min, long now) {
        RemoteViews small = new RemoteViews(c.getPackageName(), R.layout.kfl_strip);
        small.setTextViewText(R.id.kfl_title, LockPlan.title(blocks, min));
        DayBar.draw(c, small, s, now, 300, true);
        RemoteViews big = new RemoteViews(c.getPackageName(), R.layout.kfl_strip_big);
        big.setTextViewText(R.id.kfl_title, LockPlan.title(blocks, min));
        big.setTextViewText(R.id.kfl_text, LockPlan.text(blocks, min));
        DayBar.draw(c, big, s, now, 300, false);
        return base(c, blocks, min, now)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .addAction(0, "Start focus", KfWidget.open(c, "/today?kfAction=focus-start"))
            .build();
    }

    // ── the exact alarm at the next change ──

    private static void schedule(Context c, long at) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 7100, new Intent(REFRESH, null, c, Receiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        if (at <= 0 || !(LockWidget.placed(c) || nowBarOn(c) || stripOn(c))) {
            alarms.cancel(pi);
            return;
        }
        // Exact (the reminders' USE_EXACT_ALARM): the Now Bar shows on the AOD, so it must turn on the minute.
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    /** The alarm, boot, an app update. */
    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent intent) {
            refresh(c);
        }
    }

    // ── window.KaisFlowLock for the page (src/features/lockscreen/native.ts) ──

    @CapacitorPlugin(name = "KaisFlowLock")
    public static class LockBridge extends Plugin {
        @Override
        public void load() {
            getBridge().getWebView().addJavascriptInterface(this, "KaisFlowLock");
            refresh(getContext());
        }

        /** {sdk, nowBarSupported, nowBar, dayStrip, names}. */
        @JavascriptInterface
        public String state() {
            Context c = getContext();
            try {
                return new JSONObject()
                    .put("sdk", Build.VERSION.SDK_INT)
                    .put("nowBarSupported", nowBarSupported())
                    .put("nowBar", nowBarOn(c))
                    .put("dayStrip", stripOn(c))
                    .put("names", names(c))
                    .toString();
            } catch (JSONException e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void set(boolean nowBar, boolean dayStrip) {
            prefs(getContext()).edit().putBoolean("nowBar", nowBar).putBoolean("dayStrip", dayStrip).apply();
            refresh(getContext());
        }

        @JavascriptInterface
        public void setNames(boolean on) {
            if (names(getContext()) == on) return;
            prefs(getContext()).edit().putBoolean("names", on).apply();
            refresh(getContext());
        }
    }
}
