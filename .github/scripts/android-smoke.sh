#!/usr/bin/env bash
# M1 emulator smoke test: install the CI-built APK, launch it, capture day + night screens, the UI
# tree (WebView content is in the accessibility tree, with bounds) and the WebView console.
set -x
pkg=com.kaisflow.garden
mkdir -p shots
adb install -r apk/*.apk || exit 1
adb shell am start -W -n "$pkg/.MainActivity"
sleep 25
adb exec-out screencap -p > shots/1-launch-day.png
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml shots/ui.xml
# The page must start below the status bar (Capacitor's SystemBars pads the window by the system
# bars). The dump can hold more than one WebView node; the highest (smallest top) must still clear
# the bar — and by no more than one bar, or the insets were applied twice.
webview_top="$(grep -o 'class="android.webkit.WebView"[^>]*bounds="\[[0-9]*,[0-9]*\]' shots/ui.xml | grep -o '\[[0-9]*,[0-9]*\]$' | tr -d '[]' | cut -d, -f2 | sort -n | head -1)"
adb shell dumpsys window windows | grep -iE 'mCurrentFocus|statusBars|navigationBars|InsetsSource' | head -30 > shots/window.txt
bar="$(grep -o 'type=statusBars frame=\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' shots/window.txt | head -1 | grep -o '[0-9]*\]$' | tr -d ']')"
echo "WebView top edge: ${webview_top:-unknown}px, status bar: ${bar:-unknown}px" | tee shots/webview-top.txt

# Android Back on the sign-in page (no overlay, first history entry) must leave the app: the JS
# handler (lib/androidBack.ts) minimizes it. Without the handler Back does nothing here.
adb shell input keyevent KEYCODE_BACK
sleep 3
resumed="$(adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity')"
alive="$(adb shell pidof "$pkg")"
echo "After Back: resumed = ${resumed:-unknown}; app process = ${alive:-gone}" | tee shots/back.txt

# Back in, then the phone goes dark: the page keeps its own theme, and the bar strips must keep
# the page's colour through the configuration change (MainActivity re-applies them).
adb shell am start -W -n "$pkg/.MainActivity"
sleep 3
adb shell cmd uimode night yes
sleep 8
adb exec-out screencap -p > shots/2-launch-night.png
adb logcat -d | grep -iE 'chromium|console|capacitor|webview|kaisflow|AndroidRuntime' | tail -300 > shots/logcat.txt
ls -la shots
[ "${webview_top:-0}" -gt 0 ] || { echo 'FAIL: the WebView starts under the status bar'; exit 1; }
if [ -n "$bar" ] && [ "$bar" -gt 0 ] && [ "$webview_top" -ge $((bar * 2)) ]; then
  echo 'FAIL: the WebView starts two status bars down (insets applied twice)'; exit 1
fi
case "$resumed" in *"$pkg"*) echo 'FAIL: Back on the sign-in page left the app in front'; exit 1 ;; esac
[ -n "$alive" ] || { echo 'FAIL: the app process died on Back'; exit 1; }
