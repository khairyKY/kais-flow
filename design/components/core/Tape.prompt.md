# Tape

A single strip of washi tape. Pin it to a card that needs to feel *placed* — hero cards, popovers, the sign-in panel. Never on a plain list item.

```jsx
<div style={{ position: 'relative' }}>
  <Tape color="sage" position="top-center" width={78} />
  <div className="my-card">…</div>
</div>
```

Rules
- One or two tapes per card, max. More than that reads as clutter, not craft.
- Rotate the parent card ±0.3–0.8deg to match. The tape by itself on a straight card looks like an afterthought.
- Colors pair with the card's role (sage = Today, blossom = Tasks, gold = Goal of Day).
