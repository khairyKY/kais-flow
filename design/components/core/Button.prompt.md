# Button

Pill-shaped action button. Terra `primary` is the workspace CTA (one per view — voice capture, save, sign in). `secondary` sits on the same surfaces without shouting. `ghost` is a tertiary link-like affordance.

```jsx
<Button variant="primary" showDot>Voice capture</Button>
<Button variant="secondary">Morning ritual</Button>
<Button variant="ghost">Dismiss</Button>
```

Notes
- Buttons are always fully round (pill). Never square-cornered in this system.
- Only one `primary` per view — the terra button is a moment, not a texture.
- The optional `showDot` renders a small filled circle before the label — used for "live" actions like voice capture.
