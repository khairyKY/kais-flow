#!/usr/bin/env bash
# The Mac app, built and checked on any Mac CI (GitHub's macos runner today, desktop.yml's macos job;
# Codemagic's free M2 minutes once the repo goes private — call this from codemagic.yaml the same way).
#
#   TAG=v1.2.3 OUT=/some/dir .github/scripts/mac-build.sh     (from the repo root; TAG empty = a test build)
#
# Needs: macOS with Xcode command-line tools, Node 22 + npm, rustup. Env:
#   TAG                                   the release tag (stamps the version; names the files), or empty
#   OUT                                   where the finished files go (default: $RUNNER_TEMP/mac or ./mac-out)
#   TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)  the updater key Windows uses; without it no .app.tar.gz/.sig
#   VITE_SUPABASE_URL / _ANON_KEY         optional: else read from the live web app (supabase-public-config.py)
#   APP_URL                               the live web app (default below)
#
# Makes, in $OUT: kais-flow-<tag|sha>-mac.dmg, and with the key kais-flow-<…>-mac.app.tar.gz + .sig.
# One universal .app (Apple silicon + Intel), ad-hoc signed (tauri.conf.json bundle.macOS.signingIdentity
# "-"; no Apple account, so no notarization). Fails if the .dmg doesn't mount, lacks the .app or the
# Applications link, the signature isn't ad-hoc, the binary isn't universal, Info.plist's version or
# identifier is wrong, or the app copied out of the .dmg doesn't keep running for 25 s.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export TAG="${TAG:-}"
OUT="${OUT:-${RUNNER_TEMP:-$ROOT}/mac-out}"
TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
export APP_URL="${APP_URL:-https://kais-flow.kaidagoat.workers.dev}"
summary() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; else echo "$1"; fi; }
fail() { echo "::error::$1"; exit 1; }
cd "$ROOT/app"

# ── build ──
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
if [ -n "$TAG" ]; then
  node -e "const f='src-tauri/tauri.conf.json',c=require('./'+f);c.version=process.env.TAG.replace(/^v/,'');require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
fi
if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  # The script writes KEY=value lines to $GITHUB_ENV; outside GitHub, a file of our own we read back.
  envfile="$TMP/kf-supabase.env"; : > "$envfile"
  GITHUB_ENV="$envfile" VARS_URL="${VITE_SUPABASE_URL:-}" VARS_KEY="${VITE_SUPABASE_ANON_KEY:-}" python3 ../.github/scripts/supabase-public-config.py
  set -a; . "$envfile"; set +a
fi
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  npx tauri build --target universal-apple-darwin --bundles app,dmg
else
  echo "::notice title=No updater signature::TAURI_SIGNING_PRIVATE_KEY isn't set, so this Mac app can't update in place."
  npx tauri build --target universal-apple-darwin --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":false}}'
fi

# ── check: what a person gets, the way they meet it ──
b=src-tauri/target/universal-apple-darwin/release/bundle
app="$(ls -d "$b"/macos/*.app | head -1)"
dmg="$(ls "$b"/dmg/*.dmg | head -1)"
name="$(basename "$app")"
want_v="$(node -p "require('./src-tauri/tauri.conf.json').version")"
want_id="$(node -p "require('./src-tauri/tauri.conf.json').identifier")"

codesign -dv "$app" > "$TMP/codesign.txt" 2>&1; cat "$TMP/codesign.txt"
grep -q '^Signature=adhoc' "$TMP/codesign.txt" || fail "$name isn't ad-hoc signed"
codesign --verify --deep --strict --verbose=2 "$app"
archs="$(lipo -archs "$app/Contents/MacOS/kais-flow")"
[[ "$archs" == *x86_64* && "$archs" == *arm64* ]] || fail "expected a universal binary, got: $archs"

mnt="$TMP/kf-dmg"
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$dmg"
ls -la "$mnt"
[ -d "$mnt/$name" ] || fail "the .dmg has no $name"
[ -L "$mnt/Applications" ] || fail "the .dmg has no Applications link to drag onto"
plist="$mnt/$name/Contents/Info.plist"
v="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$plist")"
id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$plist")"
[ "$v" = "$want_v" ] || fail "Info.plist version $v, expected $want_v"
[ "$id" = "$want_id" ] || fail "Info.plist identifier $id, expected $want_id"
codesign -dv "$mnt/$name" > "$TMP/codesign-dmg.txt" 2>&1
grep -q '^Signature=adhoc' "$TMP/codesign-dmg.txt" || fail "the .dmg's copy isn't ad-hoc signed"
smoke="$TMP/kf-smoke"
rm -rf "$smoke" && mkdir -p "$smoke"
ditto "$mnt/$name" "$smoke/$name"
hdiutil detach "$mnt"

# Smoke: the copy dragged out of the .dmg, its binary run directly so its exit is ours to see.
"$smoke/$name/Contents/MacOS/kais-flow" > "$TMP/smoke.log" 2>&1 &
pid=$!
sleep 25
if ! kill -0 "$pid" 2>/dev/null; then
  wait "$pid" && code=0 || code=$?
  cat "$TMP/smoke.log"
  fail "the app quit within 25 s of starting (exit $code)"
fi
kill "$pid"; wait "$pid" 2>/dev/null || true
echo "--- smoke log"; cat "$TMP/smoke.log"

if [ -f "$app.tar.gz.sig" ]; then
  tar -tzf "$app.tar.gz" > "$TMP/bundle.txt"
  grep -q "Contents/MacOS/kais-flow$" "$TMP/bundle.txt" || fail "the updater bundle has no app binary"
fi
summary "- Mac app: \`$name\` $v ($id) · $archs · ad-hoc signed · .dmg mounts · started and kept running 25 s"

# ── collect: named like the Windows files (the signature is over the bytes, so it holds renamed) ──
sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
label="${TAG:-${sha:0:7}}"
mkdir -p "$OUT"
cp "$dmg" "$OUT/kais-flow-$label-mac.dmg"
if [ -f "$app.tar.gz.sig" ]; then
  cp "$app.tar.gz" "$OUT/kais-flow-$label-mac.app.tar.gz"
  cp "$app.tar.gz.sig" "$OUT/kais-flow-$label-mac.app.tar.gz.sig"
fi
ls -la "$OUT"
summary "- Mac .dmg: \`kais-flow-$label-mac.dmg\` ($(du -h "$OUT/kais-flow-$label-mac.dmg" | cut -f1))"
