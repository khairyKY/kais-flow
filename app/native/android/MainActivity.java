package com.kaisflow.garden;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Kai's Flow shell activity (M1b). CI copies this over Capacitor's generated MainActivity
 * (.github/workflows/android.yml). Capacitor's SystemBars keeps the page clear of the status bar,
 * the navigation bar and the keyboard by padding the window; the strips that padding leaves show
 * the window background. This paints them in the page's own colour, which the web app reports
 * through `KaisFlowShell.setChrome` (lib/platform.ts: on load and on every Day/Night change), so
 * they read as part of the page. @capacitor/status-bar can't: its background colour is a no-op
 * from Android 15, where edge-to-edge is enforced.
 */
public class MainActivity extends BridgeActivity {

    private int pageColor;
    private boolean lightPage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Shell.class);
        // A restored activity, or a launch from Recents after the process died, replays the intent
        // that first opened it: drop a share's text so it isn't captured a second time.
        Intent launch = getIntent();
        if (launch != null && (savedInstanceState != null || (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0)) {
            launch.removeExtra(Intent.EXTRA_TEXT);
            launch.removeExtra(Intent.EXTRA_SUBJECT);
        }
        super.onCreate(savedInstanceState); // BridgeActivity hands the launch intent to onNewIntent below
        // Until the page reports its own colour: paper, or night paper when the phone is dark
        // (res/values*/kf_colors.xml, also the theme's window background).
        pageColor = getColor(R.color.kf_page);
        lightPage = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES;
        if (bridge != null) bridge.getWebView().setBackgroundColor(pageColor); // no white flash before the first paint
    }

    /**
     * The share sheet (the SEND intent filter CI adds to the manifest, .github/workflows/android.yml).
     * Shared text goes to the page's own share route, `/share?text&title` — the one the installed
     * web app's share_target uses (features/capture/SharePage), which files it to the Inbox. An open
     * page navigates in place (`window.kaisFlowOpen`, App.tsx) and keeps its state; a page that isn't
     * up yet (a cold start: BridgeActivity calls this from onCreate) loads the route instead.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        CharSequence title = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        if (text == null && title == null) return; // e.g. a file shared as a stream: just open the app
        Uri.Builder share = Uri.parse(bridge.getLocalUrl()).buildUpon().path("/share");
        if (text != null) share.appendQueryParameter("text", text.toString());
        if (title != null) share.appendQueryParameter("title", title.toString());
        Uri url = share.build();
        String path = url.getEncodedPath() + "?" + url.getEncodedQuery();
        WebView webView = bridge.getWebView();
        webView.evaluateJavascript(
            "typeof kaisFlowOpen === 'function' && kaisFlowOpen(" + JSONObject.quote(path) + ")",
            (handled) -> {
                boolean inPage = "true".equals(handled);
                Log.i("KaisFlowShare", (inPage ? "page " : "load ") + path);
                if (!inPage) webView.loadUrl(url.toString());
            }
        );
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig); // SystemBars puts the bars back to the phone's theme here
        applyChrome();
    }

    void setChrome(int color, boolean light) {
        pageColor = color;
        lightPage = light;
        applyChrome();
    }

    @SuppressWarnings("deprecation")
    private void applyChrome() {
        Window window = getWindow();
        window.getDecorView().setBackgroundColor(pageColor);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            // Before Android 15 the bars may still draw a background of their own.
            window.setStatusBarColor(pageColor);
            window.setNavigationBarColor(pageColor);
        }
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(lightPage); // a light page gets dark icons
        bars.setAppearanceLightNavigationBars(lightPage);
    }

    /** `window.KaisFlowShell` for the page. A plugin, because plugins load before the first page does. */
    @CapacitorPlugin(name = "KaisFlowShell")
    public static class Shell extends Plugin {

        @Override
        public void load() {
            getBridge().getWebView().addJavascriptInterface(this, "KaisFlowShell");
        }

        /** `color` is `#RRGGBB`; `light` = a light page (Day). Called from the page on a binder thread. */
        @JavascriptInterface
        public void setChrome(String color, boolean light) {
            final int parsed;
            try {
                parsed = Color.parseColor(color);
            } catch (IllegalArgumentException e) {
                return;
            }
            getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).setChrome(parsed, light));
        }
    }
}
