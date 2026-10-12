---
date: 2026-10-12 19:59 UTC
session: local (kai-bugs-1012)
type: decision
related: docs/log/2026-10-12-1922-local-audit-product.md (the yes/no list); docs/log/2026-10-12-1839-local-decision-unbuilt-designs.md
---

# Kai: "fix or cut" — the five items, decided

Kai answered the product audit's yes/no list with "fix or cut", delegating each call. Decided:

| Item | Call | Why | Where |
|---|---|---|---|
| Library | **Fix** — un-parked for good | Designed (Library 1a/1b), built, only hidden; [K-26] parked it for v1, which shipped | nav row + false "cover placeholder"/"via capture" copy: claude/fix-grammar; Library group in Search: merged (0064) |
| Dev-only pages: QuickCapturePage (892 lines), Seasons gallery (222), Stub.tsx | **Cut** | Dev-only galleries/dead code; QuickCapturePage still made real capture writes | done (`ee09b472`); git keeps them |
| Planning board (`/planning`) | **Cut** | Kai parked it ("until I redesign it"); downloaded on every app start; Calendar §4 planning mode is the redesign | claude/cal-wave2 (deletes it as it builds §4) |
| Capture key + endpoint | **Fix** — moved, not removed | Works, documented on the site; redundant for Kai (share + MCP) but useful to others | card moves under Settings › Advanced: claude/fix-grammar; site guide path updated at release |
| Weather | **Cut** | Cairo's weather for everyone (a zone has no coordinates); Kai lives in Borg El Arab / Tanta | done (`ee09b472`): topbar keeps the zone's city; Season widget shows the season |
| ⌘↵ AI-first capture | **Cut** | Since v1.0.22 every typed capture is AI-filled after it lands; ⌘↵ only gave Enter a second meaning | claude/fix-tasks; one capture rule: Enter → local parse → toast names where it went → AI fills gaps |

Also from the audit, no ruling needed (dead code): `streakRiskMessage` (pressure copy, no caller) — claude/fix-grammar.
