# FireflyField

Ambient overlay used in the Night theme. Wraps in a `position: absolute; inset: 0` layer with a dozen drifting warm-yellow points of light. Not decoration — it's how the workspace *breathes* after dark.

```jsx
<div style={{ position: 'relative' }}>
  <FireflyField count={14} />
  {/* rest of the app */}
</div>
```

Rules
- Only ever in `[data-theme="night"]`. Never in the light garden — no daytime fireflies.
- Keep count low (10–18 across a full 1440px screen). Anything more feels like fireworks.
- Prefers-reduced-motion pauses the drift automatically via the shared keyframe.
