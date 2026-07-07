# Card

The parchment surface. Sharp 3px corners (not modern rounded), thin border, layered shadow. Give it a small tilt (`tilt={-0.5}`) and pair it with a `<Tape>` for the signature pinned-note feel.

```jsx
<Card tilt={-0.4} tone="goal" padding="lg">
  <Tape color="gold" width={76} />
  <h3>Goal of the day</h3>
  …
</Card>
```

Tones
- `parchment` — default cards
- `bone` — quieter, no bottom shadow (nav pill states, secondary chips)
- `goal` — gold "goal of the day" card, gold shadow
- `flat` — same tones, no shadow (inside a shadowed parent)
