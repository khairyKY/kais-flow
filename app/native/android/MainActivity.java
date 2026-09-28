package com.kaisflow.garden;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        super.onCreate(savedInstanceState);
        // Until the page reports its own colour: paper, or night paper when the phone is dark
        // (res/values*/kf_colors.xml, also the theme's window background).
        pageColor = getColor(R.color.kf_page);
        lightPage = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES;
        if (bridge != null) bridge.getWebView().setBackgroundColor(pageColor); // no white flash before the first paint
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
