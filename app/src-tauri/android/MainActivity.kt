package com.kaisflow.garden

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

// Kai's Flow shell activity (M1). Copied over Tauri's generated MainActivity by
// .github/workflows/android.yml. Tauri draws edge to edge (enforced on Android 15+), and the web
// app has no status-bar inset of its own, so the shell keeps the page clear of the system bars,
// the display cutout and the keyboard by padding the content view. The strips that padding leaves
// take the page's own colour, which the web app reports through `KaisFlowShell.setChrome`
// (lib/platform.ts, on every Day/Night change), so they read as part of the page.
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val clear = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(clear.left, clear.top, clear.right, clear.bottom)
      WindowInsetsCompat.CONSUMED
    }
    setChrome(PAPER, light = true)
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(Bridge(), "KaisFlowShell")
  }

  private fun setChrome(color: Int, light: Boolean) {
    findViewById<View>(android.R.id.content).setBackgroundColor(color)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = light
      isAppearanceLightNavigationBars = light
    }
  }

  inner class Bridge {
    /** `color` is `#RRGGBB`; `light` = dark icons (Day). Called from the page on a binder thread. */
    @JavascriptInterface
    fun setChrome(color: String, light: Boolean) {
      val parsed = try { Color.parseColor(color) } catch (e: IllegalArgumentException) { return }
      runOnUiThread { this@MainActivity.setChrome(parsed, light) }
    }
  }

  companion object {
    /** Day paper (--bg-app), used until the page reports its own. */
    private val PAPER = Color.parseColor("#EFE9DB")
  }
}
