// Botanical nav icons, extracted from the Today v3.dc.html design handoff.
// Each tab keeps its own fixed flower species/colors regardless of active state —
// only the surrounding nav-row chrome (paper-card background) changes on active.

export function TodayIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21c.2-3.4-.4-6-2.6-8" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 12.2C10.9 8.9 7.6 8 5.9 9.6c-1.6 1.5-1 4.4 1.7 5 1.9.5 3.6-.6 4.4-2.4Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c-1-3.3.7-6.2 3-6.2 2.2 0 3.5 2.6 2 4.8-1 1.6-3.1 2.1-5 1.4Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c3.4-.8 6 1.4 5.6 3.6-.4 2.2-3.3 2.9-4.9 1.1-1.2-1.3-1.3-3.1-.7-4.7Z"
        fill="#7A946E"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InboxIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5c0-3-.4-5-1.6-6.8" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <g stroke="#5C5140" strokeWidth="1.2" strokeLinejoin="round">
        <path
          d="M9.2 7.2c1-1.4 3-1.4 3.8.2 1.7-.6 3.2.8 2.8 2.4 1.5.9 1.3 3-.3 3.6.2 1.7-1.5 2.9-3 2.2-1 1.3-3 1-3.6-.6-1.7 0-2.7-1.8-1.8-3.2-1.2-1.2-.6-3.2 1-3.5 0-.4.4-.9 1.1-1.1Z"
          fill="#9AB4BE"
        />
      </g>
      <circle cx="10.6" cy="9.6" r="1" fill="#F2EEDF" />
      <circle cx="13.8" cy="10.8" r="1" fill="#F2EEDF" />
      <circle cx="11.6" cy="12.8" r="1" fill="#F2EEDF" />
    </svg>
  )
}

export function TasksIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5c.3-3.2-.2-5.6-1.4-7.6" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <g stroke="#5C5140" strokeWidth="1.3" strokeLinejoin="round">
        <ellipse cx="12" cy="6.2" rx="1.9" ry="2.4" fill="#E5B8C0" transform="rotate(-8 12 6.2)" />
        <ellipse cx="15.6" cy="8.2" rx="1.9" ry="2.4" fill="#D4A8B0" transform="rotate(58 15.6 8.2)" />
        <ellipse cx="14.4" cy="12.1" rx="1.9" ry="2.4" fill="#E5B8C0" transform="rotate(128 14.4 12.1)" />
        <ellipse cx="9.6" cy="12.1" rx="1.9" ry="2.4" fill="#D4A8B0" transform="rotate(-128 9.6 12.1)" />
        <ellipse cx="8.4" cy="8.2" rx="1.9" ry="2.4" fill="#E5B8C0" transform="rotate(-58 8.4 8.2)" />
      </g>
      <circle cx="12" cy="9.4" r="1.7" fill="#C98A4B" stroke="#5C5140" strokeWidth="1.2" />
    </svg>
  )
}

export function CalendarIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5c0-3.4-.3-6-1-8.4" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <g stroke="#5C5140" strokeWidth="1.2" strokeLinejoin="round" fill="#F3EEDC">
        <ellipse cx="11" cy="4.9" rx="1.3" ry="2.6" />
        <ellipse cx="11" cy="12.1" rx="1.3" ry="2.6" />
        <ellipse cx="7.4" cy="8.5" rx="2.6" ry="1.3" />
        <ellipse cx="14.6" cy="8.5" rx="2.6" ry="1.3" />
        <ellipse cx="8.5" cy="6" rx="1.2" ry="2.2" transform="rotate(-45 8.5 6)" />
        <ellipse cx="13.5" cy="6" rx="1.2" ry="2.2" transform="rotate(45 13.5 6)" />
        <ellipse cx="13.5" cy="11" rx="1.2" ry="2.2" transform="rotate(-45 13.5 11)" />
        <ellipse cx="8.5" cy="11" rx="1.2" ry="2.2" transform="rotate(45 8.5 11)" />
      </g>
      <circle cx="11" cy="8.5" r="2.2" fill="#D9B65C" stroke="#5C5140" strokeWidth="1.2" />
    </svg>
  )
}

export function RoutinesIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path
        d="M10.5 21.5C10.5 17 13.5 15 13 11.5 12.5 8 9.5 7.5 10 4.5"
        stroke="#5C5140"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M13 12c2.6-.9 3.9-2.9 3.8-5.1-2.3.3-3.7 2.3-3.8 5.1Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M11.4 8.4C8.9 8 7.5 6.2 7.3 4c2.3 0 3.8 1.8 4.1 4.4Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12.6 16.6c2.4-.4 3.8.4 4.4 2-2 .8-3.7 0-4.4-2Z"
        fill="#7A946E"
        stroke="#5C5140"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="3.6" r="1.6" fill="#D4A8B0" stroke="#5C5140" strokeWidth="1.2" />
    </svg>
  )
}

export function ReviewIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M11 21.5c0-6 .4-10.5 3.6-14.4" stroke="#5C5140" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path
        d="M14.9 6.5c1.4-.3 2.3-1.3 2.4-2.7-1.5 0-2.4 1.1-2.4 2.7Z"
        fill="#7A946E"
        stroke="#5C5140"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 9.1c-1.5.2-2.8-.5-3.3-1.9 1.6-.4 2.9.5 3.3 1.9Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M12.2 11.7c1.5.3 2.9-.3 3.5-1.6-1.5-.5-2.9.2-3.5 1.6Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M11.4 14.6c-1.6.2-2.9-.5-3.5-2 1.7-.4 3 .5 3.5 2Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M11 17.4c1.6.3 3-.3 3.7-1.7-1.6-.5-3 .2-3.7 1.7Z"
        fill="#7A946E"
        stroke="#5C5140"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5V10.5" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 12.8C11.5 9.3 9 7.7 6.3 8.2c.3 3 2.7 4.9 5.7 4.6Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M12 10.6c.3-3.5 2.7-5.3 5.5-5-.2 3.1-2.6 5.2-5.5 5Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <ellipse cx="12" cy="20.6" rx="4.6" ry="1.4" fill="#C9B98F" stroke="#5C5140" strokeWidth="1.1" />
    </svg>
  )
}

export function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flex: 'none', opacity: 0.85 }}>
      <path d="M12 21c.2-3.4-.4-6-2.6-8" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 12.2C10.9 8.9 7.6 8 5.9 9.6c-1.6 1.5-1 4.4 1.7 5 1.9.5 3.6-.6 4.4-2.4Z"
        fill="none"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c-1-3.3.7-6.2 3-6.2 2.2 0 3.5 2.6 2 4.8-1 1.6-3.1 2.1-5 1.4Z"
        fill="none"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c3.4-.8 6 1.4 5.6 3.6-.4 2.2-3.3 2.9-4.9 1.1-1.2-1.3-1.3-3.1-.7-4.7Z"
        fill="none"
        stroke="#5C5140"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BellIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 4.5a6 6 0 0 0-6 6c0 3-.8 5.5-2 7h16c-1.2-1.5-2-4-2-7a6 6 0 0 0-6-6Z" stroke="#5C5140" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 17.5a3 3 0 0 0 6 0" stroke="#5C5140" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function MiniCloverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', opacity: 0.9 }}>
      <path d="M12 21c.2-3.4-.4-6-2.6-8" stroke="#5C5140" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 12.2C10.9 8.9 7.6 8 5.9 9.6c-1.6 1.5-1 4.4 1.7 5 1.9.5 3.6-.6 4.4-2.4Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c-1-3.3.7-6.2 3-6.2 2.2 0 3.5 2.6 2 4.8-1 1.6-3.1 2.1-5 1.4Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c3.4-.8 6 1.4 5.6 3.6-.4 2.2-3.3 2.9-4.9 1.1-1.2-1.3-1.3-3.1-.7-4.7Z"
        fill="#7A946E"
        stroke="#5C5140"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Fern crozier (fiddlehead) — the unhurried "someday" coil. Same fixed-species convention as the
// other nav flowers: its own green regardless of active state.
export function FernCoilIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path
        d="M12 21.5c0-4 .5-7 2.4-9.4 1.6-2 4-2.6 5.1-1.1 1 1.3.3 3.3-1.4 3.8-1.5.4-2.8-.6-2.8-2.1 0-1.7 1.5-3 3.3-2.6"
        stroke="#5C5140"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 16c-2.3-.3-3.8-1.9-4-4.2 2.3 0 3.8 1.7 4 4.2Z" fill="#8A9A7E" stroke="#5C5140" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11.6 11.5c-1.8-1-2.5-3-1.7-5 1.8.9 2.5 3 1.7 5Z" fill="#9DAB8B" stroke="#5C5140" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

// Trellis — the planning board's grid of columns, read as a climbing-vine lattice.
export function PlanningBoardIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5V6.5" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.5 21.5V9" stroke="#5C5140" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
      <path d="M17.5 21.5V9" stroke="#5C5140" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
      <path d="M4.5 12h15M4.5 16.5h15" stroke="#5C5140" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <path d="M12 6.5c-1.6-.2-2.7-1.4-2.8-3.1 1.9.1 2.9 1.4 2.8 3.1Z" fill="#8A9A7E" stroke="#5C5140" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12 6.5c1.6-.2 2.7-1.4 2.8-3.1-1.9.1-2.9 1.4-2.8 3.1Z" fill="#9DAB8B" stroke="#5C5140" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.5 9c-1.3.1-2.2-.7-2.5-2 1.6-.1 2.4.8 2.5 2Z" fill="#D4A8B0" stroke="#5C5140" strokeWidth="1" strokeLinejoin="round" />
      <path d="M17.5 9c1.3.1 2.2-.7 2.5-2-1.6-.1-2.4.8-2.5 2Z" fill="#D4A8B0" stroke="#5C5140" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

// Same plain glyph as the search input's own icon (SearchOverlay.tsx) — reused, not reinvented,
// so the sidebar's Search row finally carries an icon like every other footer/nav row.
export function SearchGlyphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" style={{ flex: 'none' }}>
      <circle cx="7" cy="7" r="5.2" stroke="#5C5140" strokeWidth="1.6" />
      <path d="M11 11l4 4" stroke="#5C5140" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Sprout — the PLAN section header's own icon (a fixed species, same convention as every
// other nav row), distinct from Today's clover: two leaves breaking ground, "the day ahead."
export function SproutIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <path d="M12 21.5V11.5" stroke="#5C5140" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 12.2c-1.6-3-5-3.6-7-1.8 1 2.7 4.5 3.8 7 1.8Z"
        fill="#8A9A7E"
        stroke="#5C5140"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.2c1.6-3.6 5.3-4.2 7.3-2-1 3.1-4.8 4.2-7.3 2Z"
        fill="#9DAB8B"
        stroke="#5C5140"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <ellipse cx="12" cy="20.8" rx="3.4" ry="1.1" fill="#C9B98F" stroke="#5C5140" strokeWidth="1" />
    </svg>
  )
}

export function PetalIcon() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11">
      <path
        d="M4.5 0C6 3 9 4 8 8c-.7 2.6-3.3 3-4.8 2C1 9 0 7 1.2 4 2 5 2.5 5 3 4 3.3 2.5 4 1 4.5 0Z"
        fill="#B5654A"
      />
    </svg>
  )
}
