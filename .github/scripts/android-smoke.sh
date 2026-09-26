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
adb shell dumpsys window windows | grep -iE 'mCurrentFocus|statusBars|navigationBars|InsetsSource' | head -30 > shots/window.txt
adb shell cmd uimode night yes
sleep 8
adb exec-out screencap -p > shots/2-launch-night.png
adb logcat -d | grep -iE 'chromium|console|tauri|webview|kaisflow|AndroidRuntime' | tail -300 > shots/logcat.txt
ls -la shots
