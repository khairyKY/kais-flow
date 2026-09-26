#!/usr/bin/env bash
# M1 emulator smoke test: install the CI-built APK, launch it, capture day + night screens, the UI
# tree (WebView content is in the accessibility tree, with bounds) and the WebView console.
set -x
mkdir -p shots
adb install -r apk/*.apk || exit 1
adb shell am start -W -n com.kaisflow.garden/.MainActivity
sleep 25
adb exec-out screencap -p > shots/1-launch-day.png
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml shots/ui.xml
# The page must start below the status bar (MainActivity pads the content by the system bars).
webview_top="$(grep -o 'class="android.webkit.WebView"[^>]*bounds="\[[0-9]*,[0-9]*\]' shots/ui.xml | grep -o '\[[0-9]*,[0-9]*\]$' | tr -d '[]' | cut -d, -f2)"
echo "WebView top edge: ${webview_top:-unknown}px" | tee shots/webview-top.txt
adb shell dumpsys window windows | grep -iE 'mCurrentFocus|statusBars|navigationBars|InsetsSource' | head -30 > shots/window.txt
adb shell cmd uimode night yes
sleep 8
adb exec-out screencap -p > shots/2-launch-night.png
adb logcat -d | grep -iE 'chromium|console|tauri|webview|kaisflow|AndroidRuntime' | tail -300 > shots/logcat.txt
ls -la shots
[ "${webview_top:-0}" -gt 0 ] || { echo 'FAIL: the WebView starts under the status bar'; exit 1; }
