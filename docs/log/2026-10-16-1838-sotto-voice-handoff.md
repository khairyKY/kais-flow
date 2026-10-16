---
date: 2026-10-16
session: sotto-voice (builder, worktree .claude/worktrees/sotto-voice, branch claude/sotto-voice from claude/bound-journal 3030dce6)
type: handoff
---

# 2026-10-16 18:38 · handoff · sotto-voice

Kai: "include Sotto in Kai's Flow as well and do the same style of having stuff powered by Sotto". Every voice surface now shows Sotto's pill and "Powered by Sotto", as in Sukoon (`feat/sotto-voice`, bc3acbe). Branch `claude/sotto-voice` is pushed. Not merged, no PR. No migration.

## Where the pill shows

| Surface | Pill | Powered by Sotto |
|---|---|---|
| Voice sheet: journal Talk it out, the chat mic, Today's mic, the tray, widgets, the phone capture sheet's mic | replaces the terra mic and its looping bars | under the buttons |
| Hold-to-talk (phone centre button) | the recording pill is Sotto's (no ✕: sliding left cancels) | — (the take goes to the sheet, which has it) |
| Hands-free bar (slid onto the lock) | Sotto's pill between the timer and Send. Tap it = Send | above the row |
| ⌘K dictation (desktop) | in the hint row while dictating, beside its status line | beside the pill |

## States, on the real pipeline

- **Listening**: lilac bars on the mic's real level. An AnalyserNode on the take's own stream gives the RMS (as Sotto's `publish_level`) and the bars use overlay.js's formula. Tap the pill = finish. ✕ = cancel, same as the sheet's Cancel.
- **Transcribing**: the `transcribe` edge function (Groq Whisper). Unchanged.
- **Polishing**: `captureWithAI` (parse-capture), only where the AI files the take. Journal, chat and dictation get words back with no AI step, so they go straight to done.
- **Done**: Sotto's tick. The sheet or row holds it for `SOTTO_DONE_MS` (700 ms), then goes.
- **Error**: a kept take (transcription failed). Blush disc with ↻, and ↻ = Try again. Never lose a take is unchanged: no ✕, no countdown, and it leaves only through Try again / Save to Inbox / Discard.
- **Reduced motion or Effects off**: one still frame per state.

## Files

- `app/src/features/capture/SottoPill.tsx` holds `SottoPill` (canvas, Sotto's 148×40 units at 1.2× = 48 px tall) and `PoweredBySotto` (Sotto's wave in the lilac tile).
- `app/src/features/capture/sotto.ts` holds the pure math (cycle, seg, mm-blob, bars, RMS) and `micMeter`. It has a test, `sotto.test.ts`.
- `app/src/styles/tokens/sotto.css` holds `--sotto-*`: Sotto's own palette, day plus Night Garden (= Sotto's dark). Nothing else in the app changed colour.
- Wired into `VoiceCaptureSheet.tsx` (new `polishing` and `done` phases), `CaptureButton.tsx` (its own meter is gone; the pill measures) and `CommandBar.tsx`.
- Removed CSS: `.kf-mic-pulsing`, `.kf-waveform-bar`, `.kf-rec-dot`, `.kf-rec-wave`.

## Gates

- vitest 163 files / 2245 tests. Lint 0 errors. Build OK. ds:check **0 new** (3 fixed).
- `docs/log/assets/sotto-voice/verify.mjs`: **250/250** on phone and desktop, day and night, live and reduced motion. The mic is a fake MediaStream (an oscillator) and the harness turns it from quiet to loud: the bars go from 8.5 px to 21.5 px. 80 screenshots are in the same folder (`*-sheet-*`, `*-ai-*`, `*-hold-*`, `*-cmdk-*`, and `-still-` for reduced motion).
- Reruns: journal-media 123/123, capture-rules 42/42, resurface-chat 292/292, fix-inbox 69/69, phone-polish 718/718, capture-type 100/100. capture-type needed two waits for the sheet's done tick; the checks themselves are unchanged.

## Not done

- No "Powered by Sotto" on the hold pill itself (no room beside the thumb). The hands-free bar and the sheet the take goes to both show it.
- The ⌘K ✕ drops the dictation, as closing the bar did. It does not keep it for ↻ the way Sotto's desktop cancel does.
- Not tried on a real phone or on the Windows/Android shells. Only headless Chrome.

## Follow-up (not built): handing dictation to the real, offline Sotto

Sotto 0.6.2 has no local API, deep link or IPC for dictation. Here is what it exposes:

1. **Its global hotkey should already work with Kai's Flow (untested).** Focus any field in the Windows app (⌘K, the journal) and hold Right Ctrl. Sotto records, polishes and types into whatever window has focus, offline. This needs no code; only Kai needs to know it.
2. **A one-shot CLI**: `Sotto.exe --transcribe <file.wav>` prints `(N samples, ms) => "text"`, and `--polish "<text>"` runs the local AI polish. The Tauri shell could decode the take (AudioContext → 16 kHz PCM → WAV), spawn the installed exe (currentUser NSIS, typically `%LOCALAPPDATA%\Sotto\Sotto.exe`) and use its text instead of Groq. That is offline and private. Each call loads the model, so expect seconds. It needs a Tauri shell permission and a "use Sotto when installed" setting.
3. While Sotto runs, its polish model listens on `127.0.0.1:8177` (llama.cpp, OpenAI-style). It is usable, but it is Sotto's internal port.
4. Its single-instance wake event (`Sotto_Wake_…`) only opens Sotto's Settings.
