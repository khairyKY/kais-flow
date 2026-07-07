# NavItem

Sidebar row. Rest state is quiet — flower badge + muted label. Active state adds a bone-colored pill, a hairline border, a two-tone drop shadow, a −0.5° rotation, and a small washi-tape bookmark pinned to the upper-right.

```jsx
<NavItem species="clover" label="Today" active activeTape="terra" />
<NavItem species="hydrangea" label="Inbox" count={3} />
<NavItem species="cherry" label="Tasks" />
```

Only one nav item is active at a time. The tape color pairs with the surface's flower accent (e.g. sage for Today, blossom for Tasks).
