# MoonlitCard

The dark-mode card. Frosted parchment lit from above by moonspill. Use anywhere `<Card>` would be used in the light theme — the surrounding `[data-theme="night"]` swaps aliases so most `Card`s in fact just work; reach for `MoonlitCard` when you want that little extra: the blur, the moonspill, or a perched firefly.

```jsx
<MoonlitCard tilt={-0.4} firefly padding="lg">
  <SectionLabel label="Tonight" />
  …
</MoonlitCard>
```

The panels are quiet and cream — not stark black. Never use pure white text on them.
