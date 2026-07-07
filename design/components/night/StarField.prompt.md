# StarField

The Night theme's ground plane. Deep-navy radial gradient + soft twinkling stars concentrated in the upper half of the screen (the "sky"), with an optional moon glow.

```jsx
<div style={{ position: 'relative', minHeight: '100vh' }} data-theme="night">
  <StarField count={80} moon={{ x: '78%', y: '10%' }} />
  <FireflyField count={14} />
  {/* content */}
</div>
```

Stars are stronger toward the top so the horizon is still readable, and cards below still float on the near-black lower half.
