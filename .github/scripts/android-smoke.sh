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
bar="$(grep -o 'type=statusBars[^}]*insetsSize=Insets{left=[0-9]*, top=[0-9]*' shots/window.txt | head -1 | grep -o '[0-9]*$')"
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
# Activity lifecycle: a destroy/relaunch during the cold start means the WebView loaded twice.
{ adb logcat -d -b events | grep -E 'wm_(on_create_called|on_destroy_called|relaunch|relaunch_resume_activity)|wm_destroy_activity' | grep -i kaisflow
  adb logcat -d | grep -iE 'config changes|relaunch|onConfigurationChanged' | grep -i kaisflow; } > shots/lifecycle.txt 2>&1
# A second cold start once the freshly booted emulator has settled: tells a one-off relaunch (the
# WebView provider being set up after boot) from one on every launch.
adb logcat -c
adb shell am force-stop "$pkg"
{ adb shell am start -W -n "$pkg/.MainActivity" | grep -E 'LaunchState|TotalTime'
  sleep 10
  adb logcat -d -b events | grep -E 'wm_(on_create_called|on_destroy_called|relaunch)' | grep -i kaisflow; } > shots/lifecycle-2nd.txt 2>&1

# The share sheet (MainActivity.onNewIntent): the SEND filter offers the app for text; a share into a
# closed app loads /share?text=…, and a share into the open app navigates the page in place
# (window.kaisFlowOpen). Signed out here, so the page then goes on to sign-in — the log is the proof.
adb shell cmd package query-activities --brief -a android.intent.action.SEND -t text/plain > shots/share-targets.txt
adb logcat -c
adb shell am force-stop "$pkg"
adb shell am start -W -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT hello -n "$pkg/.MainActivity"
sleep 4
adb exec-out screencap -p > shots/3-share-cold-4s.png
sleep 11
adb exec-out screencap -p > shots/3-share-cold.png
{ echo "after the cold share: pid $(adb shell pidof "$pkg")"; adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity'; } > shots/share-state.txt
# The warm case needs the page up. On a freshly booted emulator Play services restarts now and
# then, and Android kills the app with it: "depends on provider …gms/.fonts.provider.FontsProvider
# in dying proc com.google.android.gms.persistent" (runs 37115560734, 37116749969). If the app is
# gone, open it again first and say so (share-logcat.txt shows why); the cold share above has
# already been logged.
if [ -z "$(adb shell pidof "$pkg")" ]; then
  echo 'WARN: the app process was gone before the warm share; relaunching' | tee -a shots/share-state.txt
  adb shell am start -W -n "$pkg/.MainActivity"
  sleep 12
fi
adb shell am start -W -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "'hello again'" --es android.intent.extra.SUBJECT "'a page'" -n "$pkg/.MainActivity"
sleep 5
adb exec-out screencap -p > shots/4-share-warm.png
adb logcat -d -s KaisFlowShare:I > shots/share.txt
adb logcat -d -v time | grep -iE 'AndroidRuntime|FATAL|has died|died|KaisFlowShare|kaisflow|chromium|Console|Capacitor|ActivityTaskManager' | tail -150 > shots/share-logcat.txt
# The home-screen widgets: every picker entry is registered with the system (32, Phone Widgets.dc.html).
adb shell dumpsys appwidget | grep -o "$pkg/com.kaisflow.garden.widgets.KfWidget\$W[0-9]*" | sort -u > shots/widgets.txt
ls -la shots
[ "${webview_top:-0}" -gt 0 ] || { echo 'FAIL: the WebView starts under the status bar'; exit 1; }
if [ -n "$bar" ] && [ "$bar" -gt 0 ] && [ "$webview_top" -ge $((bar * 2)) ]; then
  echo 'FAIL: the WebView starts two status bars down (insets applied twice)'; exit 1
fi
case "$resumed" in *"$pkg"*) echo 'FAIL: Back on the sign-in page left the app in front'; exit 1 ;; esac
[ -n "$alive" ] || { echo 'FAIL: the app process died on Back'; exit 1; }
grep -q "$pkg/" shots/share-targets.txt || { echo 'FAIL: the app is not offered in the share sheet for text'; exit 1; }
grep -q 'load /share?text=hello[[:space:]]*$' shots/share.txt || { echo 'FAIL: a share into the closed app did not load /share'; exit 1; }
grep -q 'page /share?text=hello%20again&title=a%20page' shots/share.txt || { echo 'FAIL: a share into the open app did not navigate the page'; exit 1; }
[ "$(wc -l < shots/widgets.txt)" -ge 32 ] || { echo "FAIL: expected 32 widget providers, found $(wc -l < shots/widgets.txt)"; cat shots/widgets.txt; exit 1; }
