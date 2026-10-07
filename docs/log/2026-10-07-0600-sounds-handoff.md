---
date: 2026-10-07T06:00+03:00
session: builder (sounds, Kai's feedback 2026-10-07)
type: handoff
related: docs/log/assets/sounds/ (verify.mjs, index.html, the WAVs, screenshots) · app/src/lib/sounds.ts · Settings.dc.html 3a
---

# Sounds v2: events, three packs, one key

Branch `claude/sounds`, cut from `origin/master` (14ca8ff, v1.0.22). Not merged, not deployed.

Kai (2026-10-07): "Redesign the sounds, I hate the current sounds."

**Audition without the app:** open `docs/log/assets/sounds/index.html`. It has one player per pack × event, rendered at full volume by the app's own synthesis code.

## What was wrong

- v1 had six named "voices". Four were white-noise bursts through one biquad (paper rustle, petal fall, rain patter, pencil scratch). Two were bare sines (distant chime, birdsong). There was no envelope shaping beyond one ramp, no body and no room, so they read as hiss and beeps.
- Only three ever played:
  - `paper_rustle` from the kit `Checkbox` on any check. A swipe, a menu "Complete", a key or the Focus "Done" made no sound.
  - `distant_chime` at a focus round's end.
  - `pencil_scratch` when the evening ritual saved its line.
- Settings listed all six, with help text for features that don't exist ("Rain patter: rainy weather").

## What it is now

`lib/sounds.ts` defines seven **events**. Each is a short phrase in **one key, C major pentatonic**. **Three packs** voice every phrase. Everything is still synthesised in Web Audio: zero asset bytes, $0, nothing on the network.

### Events, notes and where they fire

| Event | Phrase (start s · note · velocity · ring s) | Fires from |
|---|---|---|
| `complete` | 0 · E5 · 1 · 0.20 | `tasks/api completeTask`: every way a task is checked off (box, swipe, menu, key, Focus "Done", tray, notification action). Also a routine check-in (`routines/api toggleCompletion`) |
| `complete_big` | 0 · C5 · .75 · .28 → .085 · E5 · .85 · .28 → .17 · G5 · 1 · .45 | the same `completeTask`, when the task is the Goal of the day, or the last open Top 3 pick (`completionSound`) |
| `capture` | 0 · D6 · .55 · .07 → .04 · A5 · 1 · .12 | `CommandBar.submit` (⌘K bar and the phone capture sheet), `capture/api captureWithAI` (AI capture, voice, tray, /capture). Plays before any await, so it's inside the tap |
| `focus_start` | 0 · C4 · 1 · .38 | `focusStore.togglePlay` on a fresh pomodoro round (a resume is silent) |
| `focus_end` | 0 · E5 · .8 · .9 → .22 · G5 · .85 · .9 → .44 · C6 · 1 · 1.45 | `focusStore.tick` when the round runs out |
| `ritual_done` | 0 · G4 · .85 · .7 → .17 · C5 · 1 · .95 (a fourth up, resolving) | MorningRitual "Start the day"; EveningRitual "Close the day" (before `closeTheGarden`, which is what silences the garden) |
| `undo` (off by default) | 0 · A5 · .7 · .05 → .035 · E5 · 1 · .09 | `lib/undo toastUndo`: the toast's Undo |

E5 is the tock everything grows from. `complete_big` climbs through it, `focus_end` rings past it to C6, and `undo` steps back down to it.

Per-event level (peak of a velocity-1 note at full volume) and room send:

| Event | Level | Room send |
|---|---|---|
| complete | .17 | 0 |
| complete_big | .26 | .06 |
| capture | .14 | 0 |
| focus_start | .24 | .04 |
| focus_end | .34 | .14 |
| ritual_done | .28 | .12 |
| undo | .11 | 0 |

The ≤ 250 ms events are dry, because a room tail can't fit inside 250 ms.

### The packs

Every partial is a sine under its own envelope:
- 0 → peak, linear over the attack;
- exponential to −60 dB over its decay (ring × the partial's scale);
- linear to 0 over 4 ms, then stopped.

**Kalimba** (the default): plucked tines. Lowpass at 4.8 kHz.

| Partial | Amplitude | Attack | Decay |
|---|---|---|---|
| f | .72 | 3 ms | ring |
| f +7 cents (the detuned twin: a slow shimmer) | .24 | 3 ms | .85 × ring |
| 2f (the box) | .07 | 2 ms | .3 × ring |
| 5.93f (the tine's inharmonic ping) | .06 | 1.5 ms | min(60 ms, .35 × ring) |

**Felt**: muted felt piano, warm and low. Transposed −12, with a floor at E3 so a note below it goes up an octave (phone and laptop speakers can't play C3). Lowpass at 2.2 kHz.

| Partial | Amplitude | Attack | Decay |
|---|---|---|---|
| f | .62 | 9 ms (felt hammer) | ring |
| f −5 cents | .22 | 9 ms | .9 × ring |
| 2f | .30 | 8 ms | .55 × ring |
| 3f | .10 | 7 ms | .35 × ring |
| 4f (marimba-ish) | .07 | 6 ms | .22 × ring |

**Glass**: soft glass bells, airy. Lowpass at 5.2 kHz.
- A low-index FM bell, amplitude .62, attack 5 ms:
  - the carrier is f;
  - the modulator is 3.5f (inharmonic glass sidebands);
  - the index starts at 0.55 and falls to 3% over .6 × ring, so it starts glassy and ends pure.
- A pure twin at f +4 cents, .28, attack 6 ms, decay .9 × ring.
- 2.76f at .04, decay .3 × ring.

Shared craft:
- **No partial above 6 kHz is made** (`NYQUIST_GUARD`), so there's no hiss.
- Notes start 6 ms ahead, so each envelope is scheduled before the first rendered sample.
- The bus:
  - **Room**: a `ConvolverNode` with a generated impulse response. It is decaying noise low-passed twice at ~2.4 kHz from a fixed seed, −60 dB at 0.8 s, with a 12 ms pre-delay and a 10 ms fade-in, normalised to unit energy. It is mono, so stereo-neutral, and mixed low per event.
  - **Limiter**: a stateless soft-knee limiter (`WaveShaperNode`, 2× oversampled). It is linear up to 0.3, then a tanh shoulder that never passes 0.48 (−6.4 dBFS).
  - **Volume** comes last, so the timbre is the same at every volume.
- **Volume curve**: gain = volume^1.5. Whisper (0.34) is −14 dB and the default (0.35) stays quiet.

**Deviation from the brief: no `DynamicsCompressorNode`.** I built it with one first. Its automatic makeup gain and envelope state made the first ~200 ms of an offline render ~10 dB quieter than the same sound on a warmed-up live bus, so the measured peaks didn't describe what plays. The waveshaper limiter is stateless: offline equals live, and the −6 dBFS ceiling holds by construction even with two sounds overlapping.

### Gating

`playSound(event)` is silent when any of these hold:
- the event is off;
- the volume is 0;
- the garden is closed (the evening ritual ran today, with "silent after you close the garden" on);
- **Notifications' quiet hours** or **the tray's "Pause notifications"** apply. Both are read from the cached `app_settings` with `inQuietHours` / `isPaused` from `notify/copy.ts`, the same check the tray uses. Settings already promised this: "Quiet hours — Nothing makes a sound".

It also plays at most one sound per 80 ms, so a bulk complete of twelve tasks is one tock. Previews bypass the toggles and quiet, not the volume.

### Settings → Sound

- Master row (whisper ↔ full meter + toggle), kept.
- **Three pack cards** (a radio group). The card picks the pack and plays its phrase (`complete_big`). Its ▶ auditions it without choosing.
- **Seven event rows**, each with ▶, label, help and a toggle. All seven really play.
- Quiet row, kept. Its copy now says quiet hours and pause hush it too.
- `Toggle` got an optional `label` (aria-label). The rows' switches had no name.
- **The phone had no Sound card at all** (`MobileSettings` never rendered it). It does now.
- Focus page "Gentle chime at round's end" is the same switch as Settings' "Focus ends" (`focus_end`).

### Migration

`kf_sounds` (v1) is read once into `kf_sound_events` when the new key doesn't exist yet:

| v1 voice | v2 event(s) |
|---|---|
| paper_rustle | complete |
| petal_fall | complete_big |
| distant_chime | focus_start, focus_end |
| pencil_scratch | ritual_done |

- `rain_patter` and `birdsong` never played, so they map to nothing.
- Events v1 didn't have take their defaults: all on except `undo`.
- The pack lives in `kf_sound_pack` (default `kalimba`; an unknown value falls back to it).

## Root-cause notes (why the call sites moved)

- **The sound left the kit `Checkbox`.** A box doesn't know whether it's the Goal. Swipes, menus and keys never went through it. And it rang for non-task boxes too. One line in `completeTask` covers every path. The bulk paths that loop `completeTask` are one sound, thanks to the 80 ms throttle.
- **FocusPage had its own copy of `togglePlay`.** It stamped `pomodoroStartIso` itself, then flipped `isRunning`. So the store's fresh-round check never saw a fresh round. The page now calls the store's `togglePlay`, which was identical apart from the sound.
- **Evening ritual:** `ritual_done` plays before `closeTheGarden`, otherwise the garden's own quiet would swallow it. The line-save's `pencil_scratch` is gone; saving a line isn't one of the events.
- **Edits in other builders' areas** (tasks/, routines/) are one import + one call each. `features/today/` is untouched; `lib/sounds` reads the goal id from `today/goalStore` itself.

## Evidence

**`docs/log/assets/sounds/verify.mjs`: 126/126 passed** (`verify-results.json`, `measurements.json`). Run it as `node verify.mjs . http://localhost:5275` against the mock dev server.

Render: all 21 pack × event voices are rendered by `renderSound` (an `OfflineAudioContext` in Chrome, the same graph as live). Each is checked for:
- peak ≤ −6 dBFS, 0 clipped samples;
- rings ≤ its limit, to −60 dBFS;
- no click: first 5 ms < 0.01, last 5 ms and the 5 ms before the limit < 0.001, largest sample-to-sample step < 0.15;
- < 1% of the energy above 6 kHz.

The WAVs are mono, 44.1 kHz, 16-bit, trimmed to the sound plus 30 ms, 1.1 MB total. All 21 are written along with `index.html`.

| pack / event | peak dBFS | RMS dB | rings | > 6 kHz | centroid |
|---|---|---|---|---|---|
| kalimba complete | −15.3 | −28.7 | 148 ms | 0.000% | 667 Hz |
| kalimba complete_big | −11.9 | −25.8 | 677 ms | 0.000% | 698 Hz |
| kalimba capture | −17.3 | −31.1 | 132 ms | 0.000% | 935 Hz |
| kalimba focus_start | −12.3 | −27.6 | 423 ms | 0.000% | 263 Hz |
| kalimba focus_end | −9.0 | −23.2 | 1421 ms | 0.000% | 860 Hz |
| kalimba ritual_done | −8.5 | −22.9 | 1044 ms | 0.000% | 469 Hz |
| kalimba undo | −19.3 | −32.9 | 105 ms | 0.000% | 719 Hz |
| felt complete | −15.8 | −29.1 | 157 ms | 0.000% | 362 Hz |
| felt complete_big | −11.9 | −25.6 | 722 ms | 0.000% | 384 Hz |
| felt capture | −17.5 | −31.0 | 138 ms | 0.000% | 517 Hz |
| felt focus_start | −13.1 | −28.0 | 428 ms | 0.000% | 286 Hz |
| felt focus_end | −7.0 | −21.1 | 1729 ms | 0.000% | 463 Hz |
| felt ritual_done | −10.2 | −24.0 | 966 ms | 0.000% | 262 Hz |
| felt undo | −19.8 | −32.6 | 110 ms | 0.000% | 399 Hz |
| glass complete | −16.8 | −29.4 | 154 ms | 0.000% | 730 Hz |
| glass complete_big | −12.1 | −26.2 | 660 ms | 0.007% | 791 Hz |
| glass capture | −17.9 | −31.5 | 133 ms | 0.005% | 1014 Hz |
| glass focus_start | −13.3 | −28.0 | 423 ms | 0.000% | 287 Hz |
| glass focus_end | −9.0 | −23.3 | 1378 ms | 0.018% | 1000 Hz |
| glass ritual_done | −9.1 | −22.9 | 1014 ms | 0.000% | 505 Hz |
| glass undo | −20.7 | −33.1 | 107 ms | 0.001% | 769 Hz |

Call sites: the harness swaps `player.play` for a recorder on the app's own module instance. On the real app with a mocked backend:
- Tasks: checking a plain task gives `["complete"]`, once (no double from box + api). The toast's Undo gives `undo`. ⌘K, type, Enter gives `capture`.
- Today, with the Top 3 star log mocked so finished picks stay:
  - a pick with others still open gives `complete`;
  - the Goal gives `complete_big`;
  - the last open pick gives `complete_big`;
  - 3 checks give 3 sounds.
- Focus: ▶ Start gives `focus_start`, pause → resume is silent, and running the round out gives `focus_end`.
- Morning: Start the day gives `ritual_done`. Evening: Close the day gives `ritual_done`, and the garden is closed afterwards.

Settings → Sound at desktop 1280 and phone 390, day and night (`settings-{desktop,phone}-{day,night}.png`):
- 3 pack radios with Kalimba chosen; 3 "Hear" ▶ buttons; 7 rows with 7 "Preview" ▶ buttons.
- No sideways scroll, no page errors.
- On desktop day:
  - choosing Felt saves it and plays its phrase in felt;
  - ▶ Glass auditions glass without choosing it;
  - turning Undo on saves it and previews it;
  - a row ▶ plays in the chosen pack;
  - all of it survives a reload.

Gate:
- vitest from PowerShell ×4 TZ: Africa/Cairo, UTC, America/Los_Angeles and Asia/Kolkata each ran 106 files / 1293 tests, all passed.
- `sounds.test.ts` has 25 tests: catalog, pack persistence, v1 migration, `completionSound`, garden quiet, and gating with a stubbed player (event off, volume 0, garden closed, notification quiet hours, tray pause, the 80 ms burst rule, previews).
- `npm run lint`: 0 errors (the 21 warnings were already there). `npm run build`: ok.

## Risks / for Kai

- **Quiet hours now silence in-app sounds too.** That is on by default, 22:30–07:00. Settings → Notifications already said "Nothing makes a sound". If you work late and want the tock, turn quiet hours off or move them.
- **Migration keeps your old choices.** If you had switched "Paper rustle" off because you hated it, "Task done" starts off. Turn it on in Settings → Sound to hear the new one.
- Levels and timbres are tuned by measurement, not by ear. The audition page is how to judge them. Ask for tweaks per pack or per event: brighter or softer, longer, a different note.
- The tray window has its own webview. Its capture plays there, and it reads quiet hours from its own cached settings.
- The WAVs + screenshots add ~2 MB under `docs/log/assets/sounds/`.
