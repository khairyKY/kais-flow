# TaskRow

The universal task line. Same row shape appears on Today, Tasks, Routines and Inbox — differences are all in the `chips`, `status`, and `note` slots.

```jsx
<TaskRow title="Call Nadia about the transfer" chips={[{label:'Home',dot:'#8A9A7E'},{label:'Call'}]} status="Overdue 3d" />
<TaskRow title="Water the balcony plants" done />
<TaskRow title="Write field notes" note="leaves up — someone wrote" />
<TaskRow flower={{species:'cherry',state:'opening'}} title="Rooftop lease renewal" status="↻ weekly" />
```

Rules
- Rows are separated by a dashed hairline, never a solid one.
- Done rows drop opacity to 55% and strike through the title with `--ink-hairline`.
- Overdue status is terra; every other status is faint mono.
- At most one `note` — Caveat is a whisper, not a texture.
