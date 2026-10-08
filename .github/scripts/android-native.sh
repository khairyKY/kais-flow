#!/usr/bin/env bash
# Installs app/native/android/ into the Android project `npx cap add android` just generated: our
# MainActivity, the home-screen widgets (java/, res/), the debug-only widget gallery, and the
# manifest additions. Run from app/ — by .github/workflows/android.yml, and by hand for a local build.
set -euo pipefail
main=android/app/src/main
manifest="$main/AndroidManifest.xml"
py="$(command -v python3 || command -v python)"

# Our activity (the bar strips take the page's colour, the share sheet, widget taps), launch theme, clover icons.
test -f "$main/java/com/kaisflow/garden/MainActivity.java" || { echo "::error::generated MainActivity.java not found"; find "$main/java" -name '*.java'; exit 1; }
cp native/android/MainActivity.java "$main/java/com/kaisflow/garden/MainActivity.java"
cp -r native/android/java/. "$main/java/"
cp -r native/android/res/. "$main/res/"
# The widget gallery (renders every widget to PNGs for review) — the debug source set only; release builds never see it.
mkdir -p android/app/src/debug
cp -r native/android/debug/. android/app/src/debug/

# Voice capture: the WebView asks for the mic through the shell, which needs these declared.
sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#&\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />#' "$manifest"
grep -q RECORD_AUDIO "$manifest" || { echo "::error::RECORD_AUDIO was not added to the manifest"; exit 1; }
# Reminders on time (notify-fix, 2026-10-08): @capacitor/local-notifications declares POST_NOTIFICATIONS
# and SCHEDULE_EXACT_ALARM, but Android 14 denies the latter by default; USE_EXACT_ALARM (a reminders
# app's own permission, granted at install) lets a reminder fire on the minute even in Doze. The app
# falls back to inexact alarms without it. ic_stat_kf (res/drawable-nodpi) is the status-bar K.
sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#&\n    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />#' "$manifest"
grep -q USE_EXACT_ALARM "$manifest" || { echo "::error::USE_EXACT_ALARM was not added to the manifest"; exit 1; }
# The share sheet: shared text opens the app (MainActivity.onNewIntent → /share). text/*
# covers text/plain. Images wait for Paper capture, so no image/* yet.
sed -i 's#</activity>#    <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/*" />\n            </intent-filter>\n\n        &#' "$manifest"
grep -q 'android.intent.action.SEND' "$manifest" || { echo "::error::the SEND intent filter was not added to the manifest"; exit 1; }

# The widgets' receivers (native/android/widgets-manifest.xml) go in just before </application>.
"$py" - "$manifest" native/android/widgets-manifest.xml <<'PY'
import io, sys
path, extra = sys.argv[1], io.open(sys.argv[2], encoding='utf-8').read()
xml = io.open(path, encoding='utf-8').read()
assert xml.count('</application>') == 1, 'expected one </application>'
indented = ''.join('        ' + line if line.strip() else line for line in extra.splitlines(True))
io.open(path, 'w', encoding='utf-8', newline='\n').write(xml.replace('</application>', indented + '\n    </application>'))
PY
n=$(grep -c 'android.appwidget.provider' "$manifest")
test "$n" -ge 30 || { echo "::error::expected the widget receivers in the manifest, found $n"; exit 1; }
echo "widgets: $n receivers"
grep -n 'uses-permission' "$manifest"
sed -n '/<activity/,/<\/activity>/p' "$manifest"
grep -n 'app_name' "$main/res/values/strings.xml"
