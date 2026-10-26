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
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
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
 *   B · the Now Bar: an Android 16 Live Update — a promoted ongoing ProgressStyle notification, today's
 *       blocks as palette C segments, the countdown chip drawn by the system from `when` ("20 min").
 *       Below Android 16 the same notification posts as an ordinary ongoing one.
 *   C · the Day strip: an ongoing notification with our own layout (the day as palette C blocks, a now
 *       line, Next). Every version; a custom layout can't be promoted, so it never sits in the Now Bar.
 *   A · the Top 3 lock widget is LockWidget; it redraws from here too.
 * All of it reads the widgets' snapshot (Snap) — no extra data from the app. Redrawn when the snapshot
 * changes (the app's pushes, a tick), at the exact minute a block starts or ends (one exact alarm, the
 * app's USE_EXACT_ALARM), at boot and on Settings → Notifications → This phone. No polling.
 */
public final class LockScreen {
    private LockScreen() {}

    private static final String TAG = "KfLock";
    private static final String PREFS = "kf_lock";
    /** Silent, low: never a sound, never heads-up; above MIN so a Live Update may be promoted. */
    static final String CHANNEL = "lockscreen";
    private static final int ID_NOW_BAR = 7101;
    private static final int ID_STRIP = 7102;
    static final String REFRESH = "com.kaisflow.garden.lock.REFRESH";
    static final String TICK = "com.kaisflow.garden.lock.TICK";

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

    // ── redraw ──

    private static SharedPreferences.OnSharedPreferenceChangeListener watcher;

    /** The widgets' snapshot changed (WidgetBridge.setSnapshot, a tick): redraw. Held in a static —
     * SharedPreferences keeps listeners weakly. Lives as long as the process does. */
    static synchronized void watch(Context c) {
        if (watcher != null) return;
        Context app = c.getApplicationContext();
        watcher = (p, key) -> {
            if ("snap".equals(key)) refresh(app);
        };
        app.getSharedPreferences("kf_widgets", Context.MODE_PRIVATE).registerOnSharedPreferenceChangeListener(watcher);
    }

    /** Everything on the lock screen, from the snapshot as it is now; then the alarm for the next change. */
    @SuppressLint("MissingPermission") // areNotificationsEnabled() is checked; a revoke mid-way is caught
    static void refresh(Context c) {
        watch(c);
        channel(c); // made up front, so Android's settings list it before the first block
        LockWidget.updateAll(c);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        Snap s = Snap.load(c);
        long now = System.currentTimeMillis();
        List<LockPlan.Block> blocks = s == null || !s.signedIn() || s.newDay(now) ? new ArrayList<>() : blocks(s, now);
        int min = s == null ? 0 : s.minutes(now);
        boolean show = LockPlan.showing(blocks, min) && nm.areNotificationsEnabled();
        try {
            if (show && nowBarOn(c)) nm.notify(ID_NOW_BAR, nowBar(c, s, blocks, min, now));
            else nm.cancel(ID_NOW_BAR);
            if (show && stripOn(c)) nm.notify(ID_STRIP, strip(c, s, blocks, min, now));
            else nm.cancel(ID_STRIP);
        } catch (SecurityException e) {
            Log.w(TAG, "notify", e); // POST_NOTIFICATIONS not granted
        }
        int next = LockPlan.nextChange(blocks, min);
        long at = s == null ? 0 : next >= 0 ? now + (next - min) * 60_000L - (now % 60_000L) : s.nextMidnight(now);
        schedule(c, at);
    }

    /** Today's blocks from the snapshot, in minutes on the user's clock. */
    private static List<LockPlan.Block> blocks(Snap s, long now) {
        List<LockPlan.Block> out = new ArrayList<>();
        JSONArray a = s.arr("blocks");
        String today = s.day(now);
        for (int i = 0; i < a.length(); i++) {
            JSONObject b = a.optJSONObject(i);
            if (b == null) continue;
            long start = b.optLong("start");
            long end = b.optLong("end");
            int from = s.day(start).equals(today) ? s.minutes(start) : start < now ? 0 : 24 * 60;
            int to = s.day(end).equals(today) ? s.minutes(end) : end > now ? 24 * 60 : 0;
            if (to > from) out.add(new LockPlan.Block(from, to, b.optString("title"), b.optString("color"), b.optBoolean("done")));
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

    private static PendingIntent openToday(Context c) {
        return KfWidget.open(c, "/today");
    }

    private static NotificationCompat.Builder base(Context c, List<LockPlan.Block> blocks, int min, long now, boolean names) {
        int target = LockPlan.target(blocks, min);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_kf)
            .setColor(0xFF9C5139)
            .setContentTitle(LockPlan.title(blocks, min, names))
            .setContentText(LockPlan.text(blocks, min, names))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(target >= 0)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openToday(c));
        if (target >= 0) b.setWhen(now + (target - min) * 60_000L - (now % 60_000L));
        return b;
    }

    /** B · the Now Bar. Android 16: a Live Update (ProgressStyle, promoted); before: an ordinary ongoing one. */
    private static android.app.Notification nowBar(Context c, Snap s, List<LockPlan.Block> blocks, int min, long now) {
        NotificationCompat.Builder b = base(c, blocks, min, now, names(c));
        int[] w = LockPlan.window(blocks);
        int pos = Math.max(0, Math.min(w[1] - w[0], min - w[0]));
        if (nowBarSupported()) {
            // The chip text comes from `when` (≥ 2 min ahead: "20 min", kept current by the system).
            // A fixed setShortCriticalText("20m") would go stale between redraws — we don't poll.
            NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle().setStyledByProgress(true).setProgress(pos);
            for (int[] seg : LockPlan.segments(blocks, w[0], w[1])) style.addProgressSegment(new NotificationCompat.ProgressStyle.Segment(seg[0]).setColor(seg[1]));
            b.setStyle(style).setRequestPromotedOngoing(true);
        } else {
            // ponytail: the fallback counts down in the shade (a Chronometer) and shows the day as one bar.
            b.setUsesChronometer(true).setChronometerCountDown(true).setProgress(w[1] - w[0], pos, false);
        }
        return b.build();
    }

    /** C · the Day strip: our own layout, collapsed and expanded, with Start focus. */
    private static android.app.Notification strip(Context c, Snap s, List<LockPlan.Block> blocks, int min, long now) {
        boolean names = names(c);
        int[] w = LockPlan.window(blocks);
        Bitmap art = drawStrip(c, blocks, w, min);
        RemoteViews small = new RemoteViews(c.getPackageName(), R.layout.kfl_strip);
        small.setTextViewText(R.id.kfl_title, LockPlan.title(blocks, min, names));
        small.setImageViewBitmap(R.id.kfl_strip, art);
        RemoteViews big = new RemoteViews(c.getPackageName(), R.layout.kfl_strip_big);
        big.setTextViewText(R.id.kfl_title, LockPlan.title(blocks, min, names));
        big.setTextViewText(R.id.kfl_text, LockPlan.text(blocks, min, names));
        big.setImageViewBitmap(R.id.kfl_strip, art);
        return base(c, blocks, min, now, names)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .addAction(0, "Start focus", KfWidget.open(c, "/today?kfAction=focus-start"))
            .build();
    }

    /** The day across: palette C blocks on a faint track (past ones faded), the now line, hour marks. */
    private static Bitmap drawStrip(Context c, List<LockPlan.Block> blocks, int[] w, int min) {
        float d = c.getResources().getDisplayMetrics().density;
        int width = Math.round(320 * d);
        int bar = Math.round(18 * d);
        int height = bar + Math.round(16 * d);
        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float span = Math.max(1, w[1] - w[0]);
        float r = 4 * d;
        p.setColor(LockPlan.GAP);
        cv.drawRoundRect(new RectF(0, 0, width, bar), r, r, p);
        for (LockPlan.Block b : blocks) {
            float x0 = (Math.max(b.start, w[0]) - w[0]) / span * width;
            float x1 = (Math.min(b.end, w[1]) - w[0]) / span * width;
            if (x1 <= x0) continue;
            p.setColor(LockPlan.colorOf(b.color));
            p.setAlpha(b.end <= min || b.done ? 120 : 255);
            cv.drawRoundRect(new RectF(x0 + d, 0, Math.max(x0 + 2 * d, x1 - d), bar), r, r, p);
        }
        p.setAlpha(255);
        if (min >= w[0] && min <= w[1]) {
            float x = (min - w[0]) / span * width;
            p.setColor(0xFF9C5139); // terra, the app's now line
            cv.drawRect(x - d, -1, x + d, bar + 2 * d, p);
        }
        p.setColor(0xFF8A8A8A); // reads on a light and a dark shade
        p.setTextSize(10 * d);
        for (int h = (w[0] + 239) / 240 * 4; h * 60 < w[1]; h += 4) {
            float x = (h * 60 - w[0]) / span * width;
            String label = String.valueOf(h);
            cv.drawText(label, Math.min(Math.max(0, x - p.measureText(label) / 2), width - p.measureText(label)), height - 2 * d, p);
        }
        return bmp;
    }

    // ── the exact alarm at the next change ──

    private static PendingIntent refreshIntent(Context c) {
        Intent i = new Intent(REFRESH, null, c, Receiver.class);
        return PendingIntent.getBroadcast(c, 7100, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void schedule(Context c, long at) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent pi = refreshIntent(c);
        boolean anything = LockWidget.placed(c) || nowBarOn(c) || stripOn(c);
        if (at <= 0 || !anything) {
            alarms.cancel(pi);
            return;
        }
        // Exact (the reminders' USE_EXACT_ALARM): the Now Bar shows on the AOD, so it must turn on the minute.
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    // ── broadcasts: the alarm, boot, an app update, a tick on the lock widget ──

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent intent) {
            if (TICK.equals(intent.getAction())) {
                try {
                    Snap.tick(c, new JSONObject().put("t", "task").put("id", intent.getStringExtra("id")));
                } catch (JSONException e) {
                    Log.w(TAG, "tick", e);
                }
                WidgetBridge.nudge(); // a running app applies it now
                KfWidget.updateAll(c); // the home-screen widgets show it too
            }
            refresh(c);
        }
    }

    /** A tick on the lock widget: drawn at once, applied by the app later (as a home-screen tick is). */
    static PendingIntent tick(Context c, String taskId) {
        Intent i = new Intent(TICK, Uri.parse("kflock://tick/" + Uri.encode(taskId)), c, Receiver.class).putExtra("id", taskId);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // ── window.KaisFlowLock for the page (src/features/lockscreen/native.ts) ──

    @CapacitorPlugin(name = "KaisFlowLock")
    public static class LockBridge extends Plugin {
        @Override
        public void load() {
            getBridge().getWebView().addJavascriptInterface(this, "KaisFlowLock");
            refresh(getContext()); // also starts watching the snapshot
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
