# FlowerBadge

The workspace's living icon. Every top-level surface is represented by one plant, and every plant has multiple growth states so the badge can *say something* — not just identify.

```jsx
<FlowerBadge species="cherry" state="bloom" size={24} label="Tasks" />
<FlowerBadge species="wisteria" state="p60" size={32} />
<FlowerBadge species="daisy" state="evening" size={20} />
```

Species → surface
- **clover** → Chat
- **hydrangea** → Inbox (states scale with unread count)
- **daisy** → Calendar (states track time-of-day)
- **cherry** → Tasks (bud → opening → bloom → fallen)
- **wisteria** → Projects (states are % progress)
- **fern** → Docs
- **vine** → Streaks / habits

Never invent a species. Use `state` semantically: hydrangea `heavy` for an overflowing inbox, cherry `fallen` for a completed task, wisteria `p20` for early progress.
