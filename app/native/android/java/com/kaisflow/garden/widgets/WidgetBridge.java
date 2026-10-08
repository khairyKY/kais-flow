package com.kaisflow.garden.widgets;

import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import org.json.JSONException;

/**
 * `window.KaisFlowWidgets` for the page (src/features/widgets/bridge.ts): the app writes the
 * widgets' snapshot and takes the ticks made on the home screen. Registered in MainActivity; a
 * plugin because plugins load before the first page does (the KaisFlowShell pattern).
 */
@CapacitorPlugin(name = "KaisFlowWidgets")
public class WidgetBridge extends Plugin {
    private static WeakReference<WebView> page = new WeakReference<>(null);

    @Override
    public void load() {
        WebView web = getBridge().getWebView();
        page = new WeakReference<>(web);
        web.addJavascriptInterface(this, "KaisFlowWidgets");
    }

    /** The app's snapshot (JSON); every widget redraws. Called from the page on a binder thread. */
    @JavascriptInterface
    public void setSnapshot(String json) {
        try {
            Snap.store(getContext(), json);
        } catch (JSONException e) {
            Log.w("KfWidget", "snapshot", e);
            return;
        }
        KfWidget.updateAll(getContext());
    }

    /** The home-screen ticks waiting for the app (a JSON array), cleared as they are handed over. */
    @JavascriptInterface
    public String takeQueue() {
        return Snap.take(getContext());
    }

    /** A tick landed while the app is running: it takes the queue now (bridge.ts window.__kfWidgetQueue). */
    static void nudge() {
        WebView web = page.get();
        if (web != null) web.post(() -> web.evaluateJavascript("window.__kfWidgetQueue && window.__kfWidgetQueue()", null));
    }
}
