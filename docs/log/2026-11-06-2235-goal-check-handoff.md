# goal-check handoff (2026-11-06)

Bug (Kai): a ticked goal of the day showed a pale/white checkbox with a faint tick (desktop "Today's three").

Cause: `GoalCard` (app/src/features/today/TodayPage.tsx), desktop variant. Its box style (`box`) kept the 50% parchment fill while
checked, so the Checkbox's check fill was overridden and the parchment tick sat on a pale square. `bloom.checking` also stays
true after completion (it only drops on reopen), so the box stayed in that pale state instead of settling. No overlay, opacity or
filter was involved: goalFireworks' glow, pageMotion `[data-top3-slot]:has(.kf-goal-row)::after` (onboarding-only, `html[data-planted]`)
and today.css `is-done` rules only touch the title/clover.

Fix: one `goalBox(ticked)` style (gold fill `--acc-gold`, `--paper-parchment` tick when ticked; hollow gold ring otherwise) used by
the desktop, compact and slim goal cards. The desktop goal now always shows the Checkbox (ticked when done), not the ink DoneCheck
chip, so it is gold in every state; clicking a ticked box still reopens with Undo. Tokens only.

Checks: docs/log/assets/goal-check/verify.mjs (mock backend, :5354) - 36/36 pass: before tick hollow; after tick and after reload the
box background is opaque and equals --acc-gold, contrasts the card (day 4.87:1, night 8.19:1) and the tick contrasts the box
(5.18 / 9.06); desktop, phone Now, phone Day, day and night. On base the post-tick check cannot even find the gold checkbox.
worth-fireworks 45 PASS, phone-today 94 PASS, no FAIL. Gate green (vitest x4 TZ 2854, lint, build, ds:check 0 new);
birthday_on 1/1.

Not covered: other days' goal (no separate component - GoalCard is the only goal card, so it is covered); TaskRow's DoneCheck
(non-goal rows) unchanged.
