// Written by make.mjs — the options page's list. Don't edit by hand.
window.NOTIFICATION_SOUNDS = {
  "types": [
    {
      "id": "task_reminder",
      "label": "Task reminder",
      "say": "The one you hear most. Noticeable, never sharp."
    },
    {
      "id": "event_reminder",
      "label": "Event starting",
      "say": "An event with a reminder (0077): something is about to begin."
    },
    {
      "id": "snoozed_again",
      "label": "Snoozed reminder, again",
      "say": "A reminder you snoozed (\"In 10 min\", \"In 1 hour\") coming back."
    },
    {
      "id": "focus_end",
      "label": "Focus round end",
      "say": "The round is over: minutes tended, time for a break."
    },
    {
      "id": "break_end",
      "label": "Break end",
      "say": "The break is over: back to it."
    },
    {
      "id": "morning_digest",
      "label": "Morning digest",
      "say": "Your Top 3 and what’s overdue, at your morning time. Silent today (the Quiet channel) — pick one if you want it heard."
    },
    {
      "id": "evening_nudge",
      "label": "Evening nudge",
      "say": "\"4 done · 2 left\" — time to close the day."
    },
    {
      "id": "paper_ready",
      "label": "Page read",
      "say": "Paper capture finished reading a page."
    },
    {
      "id": "terms",
      "label": "Terms changed",
      "say": "The Terms of Use or Privacy Policy changed. Rare."
    },
    {
      "id": "sync_problem",
      "label": "Sync problem",
      "say": "Changes couldn’t be saved. Distinct, but not an alarm."
    }
  ],
  "sounds": [
    {
      "id": "task_reminder_a",
      "type": "task_reminder",
      "letter": "A",
      "pack": "felt",
      "room": 0.08,
      "desc": "Two felt notes rising, E to A — a tap on the shoulder.",
      "seconds": 0.946,
      "lufs": -16,
      "truePeak": -1.3,
      "clipped": 0
    },
    {
      "id": "task_reminder_b",
      "type": "task_reminder",
      "letter": "B",
      "pack": "glass",
      "room": 0.1,
      "desc": "One glass bell and its own quieter echo.",
      "seconds": 1.006,
      "lufs": -16,
      "truePeak": -1.75,
      "clipped": 0
    },
    {
      "id": "task_reminder_c",
      "type": "task_reminder",
      "letter": "C",
      "pack": "felt",
      "room": 0.08,
      "desc": "Three felt notes climbing C–E–G, a softer cousin of the Top 3 \"done\".",
      "seconds": 0.906,
      "lufs": -16,
      "truePeak": -3.43,
      "clipped": 0
    },
    {
      "id": "event_reminder_a",
      "type": "event_reminder",
      "letter": "A",
      "pack": "glass",
      "room": 0.12,
      "desc": "Glass, an open fifth up, C to G — something is beginning.",
      "seconds": 1.166,
      "lufs": -16,
      "truePeak": -1.72,
      "clipped": 0
    },
    {
      "id": "event_reminder_b",
      "type": "event_reminder",
      "letter": "B",
      "pack": "felt",
      "room": 0.1,
      "desc": "Felt, three notes up to the high C — a door opening.",
      "seconds": 1.046,
      "lufs": -16,
      "truePeak": -3.06,
      "clipped": 0
    },
    {
      "id": "event_reminder_c",
      "type": "event_reminder",
      "letter": "C",
      "pack": "glass",
      "room": 0.12,
      "desc": "A two-bell glass chime, high then low.",
      "seconds": 1.126,
      "lufs": -16,
      "truePeak": -2.98,
      "clipped": 0
    },
    {
      "id": "snoozed_again_a",
      "type": "snoozed_again",
      "letter": "A",
      "pack": "felt",
      "room": 0.08,
      "desc": "The task reminder’s tap, twice — \"still here\".",
      "seconds": 1.116,
      "lufs": -16,
      "truePeak": -1.85,
      "clipped": 0
    },
    {
      "id": "snoozed_again_b",
      "type": "snoozed_again",
      "letter": "B",
      "pack": "glass",
      "room": 0.1,
      "desc": "Two quick glass bells on the same note.",
      "seconds": 0.896,
      "lufs": -16,
      "truePeak": -2.21,
      "clipped": 0
    },
    {
      "id": "snoozed_again_c",
      "type": "snoozed_again",
      "letter": "C",
      "pack": "felt",
      "room": 0.08,
      "desc": "The reminder’s two notes turned round, falling A to E — a gentle nudge back.",
      "seconds": 0.946,
      "lufs": -16,
      "truePeak": -1.79,
      "clipped": 0
    },
    {
      "id": "focus_end_a",
      "type": "focus_end",
      "letter": "A",
      "pack": "felt",
      "room": 0.14,
      "desc": "The app’s own \"round done\" phrase (E–G–C) in felt, shortened for a notification.",
      "seconds": 1.2,
      "lufs": -16,
      "truePeak": -2.2,
      "clipped": 0
    },
    {
      "id": "focus_end_b",
      "type": "focus_end",
      "letter": "B",
      "pack": "glass",
      "room": 0.14,
      "desc": "The same phrase in glass, brighter.",
      "seconds": 1.2,
      "lufs": -16,
      "truePeak": -4.07,
      "clipped": 0
    },
    {
      "id": "focus_end_c",
      "type": "focus_end",
      "letter": "C",
      "pack": "glass",
      "room": 0.16,
      "desc": "One glass chord, E under C, left to ring.",
      "seconds": 1.106,
      "lufs": -17.84,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "break_end_a",
      "type": "break_end",
      "letter": "A",
      "pack": "felt",
      "room": 0.1,
      "desc": "Felt, G up to C — back to it.",
      "seconds": 0.826,
      "lufs": -16,
      "truePeak": -1.37,
      "clipped": 0
    },
    {
      "id": "break_end_b",
      "type": "break_end",
      "letter": "B",
      "pack": "glass",
      "room": 0.1,
      "desc": "Glass, three small steps up, C–D–E.",
      "seconds": 0.906,
      "lufs": -16,
      "truePeak": -2.87,
      "clipped": 0
    },
    {
      "id": "morning_digest_a",
      "type": "morning_digest",
      "letter": "A",
      "pack": "glass",
      "room": 0.14,
      "desc": "Glass, a slow climb C–D–E–G — sunrise.",
      "seconds": 1.2,
      "lufs": -16,
      "truePeak": -3.57,
      "clipped": 0
    },
    {
      "id": "morning_digest_b",
      "type": "morning_digest",
      "letter": "B",
      "pack": "felt",
      "room": 0.12,
      "desc": "Felt, a low warm arpeggio C–E–G–C.",
      "seconds": 1.176,
      "lufs": -16,
      "truePeak": -3.68,
      "clipped": 0
    },
    {
      "id": "morning_digest_c",
      "type": "morning_digest",
      "letter": "C",
      "pack": "glass",
      "room": 0.16,
      "desc": "One high glass bell with a low C humming under it.",
      "seconds": 1.116,
      "lufs": -17.21,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "evening_nudge_a",
      "type": "evening_nudge",
      "letter": "A",
      "pack": "felt",
      "room": 0.12,
      "desc": "Felt, three notes down G–E–C — winding down.",
      "seconds": 1.176,
      "lufs": -16,
      "truePeak": -3.75,
      "clipped": 0
    },
    {
      "id": "evening_nudge_b",
      "type": "evening_nudge",
      "letter": "B",
      "pack": "glass",
      "room": 0.14,
      "desc": "Glass, a soft fall from E to C.",
      "seconds": 1.156,
      "lufs": -16,
      "truePeak": -3.41,
      "clipped": 0
    },
    {
      "id": "evening_nudge_c",
      "type": "evening_nudge",
      "letter": "C",
      "pack": "felt",
      "room": 0.12,
      "desc": "One low felt chord, C and G together.",
      "seconds": 0.986,
      "lufs": -16.8,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "paper_ready_a",
      "type": "paper_ready",
      "letter": "A",
      "pack": "glass",
      "room": 0.08,
      "desc": "Two quick high glass notes — a page turned.",
      "seconds": 0.526,
      "lufs": -16.17,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "paper_ready_b",
      "type": "paper_ready",
      "letter": "B",
      "pack": "felt",
      "room": 0.06,
      "desc": "Two quick felt notes up, D to G.",
      "seconds": 0.586,
      "lufs": -16,
      "truePeak": -2.18,
      "clipped": 0
    },
    {
      "id": "paper_ready_c",
      "type": "paper_ready",
      "letter": "C",
      "pack": "glass",
      "room": 0.1,
      "desc": "A small glass sparkle, G–C–E.",
      "seconds": 0.676,
      "lufs": -16,
      "truePeak": -2.99,
      "clipped": 0
    },
    {
      "id": "terms_a",
      "type": "terms",
      "letter": "A",
      "pack": "felt",
      "room": 0.08,
      "desc": "One felt note — just so you know.",
      "seconds": 0.606,
      "lufs": -17.6,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "terms_b",
      "type": "terms",
      "letter": "B",
      "pack": "glass",
      "room": 0.1,
      "desc": "One soft glass bell.",
      "seconds": 0.706,
      "lufs": -17.65,
      "truePeak": -1.1,
      "clipped": 0
    },
    {
      "id": "sync_problem_a",
      "type": "sync_problem",
      "letter": "A",
      "pack": "felt",
      "room": 0.08,
      "desc": "Felt, a low falling fourth, A to E — \"hm, something’s off\".",
      "seconds": 0.866,
      "lufs": -16,
      "truePeak": -3.34,
      "clipped": 0
    },
    {
      "id": "sync_problem_b",
      "type": "sync_problem",
      "letter": "B",
      "pack": "glass",
      "room": 0.08,
      "desc": "Glass, the same low note twice — knock, knock.",
      "seconds": 0.836,
      "lufs": -16,
      "truePeak": -2.89,
      "clipped": 0
    },
    {
      "id": "sync_problem_c",
      "type": "sync_problem",
      "letter": "C",
      "pack": "felt",
      "room": 0.08,
      "desc": "Felt, three notes stepping down A–G–E.",
      "seconds": 0.846,
      "lufs": -16,
      "truePeak": -3.37,
      "clipped": 0
    }
  ]
}
