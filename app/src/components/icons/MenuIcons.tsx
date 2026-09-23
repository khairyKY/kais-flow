// Subtle line icons for the ContextMenu action rows — monochrome, inherit `currentColor`,
// deliberately plain (not the botanical illustrations in NavIcons.tsx) so a dense menu list stays calm.
const base = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', style: { flex: 'none' } as const }

export function CheckMenuIcon() {
  return (
    <svg {...base}>
      <path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SelectMenuIcon() {
  return (
    <svg {...base}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function UndoMenuIcon() {
  return (
    <svg {...base}>
      <path d="M4 5.5h6a4 4 0 1 1-3.6 5.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ClockMenuIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3.3l2.2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ScheduleMenuIcon() {
  return (
    <svg {...base}>
      <rect x="2.5" y="3.5" width="11" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function FolderMenuIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 5V4a1 1 0 0 1 1-1h2.6l1.2 1.4H12.5a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashMenuIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 5h9M6.3 5V3.6a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 5 5 12.2a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9L11.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RepeatMenuIcon() {
  return (
    <svg {...base}>
      <path d="M3 8a5 5 0 0 1 8.5-3.5M13 8a5 5 0 0 1-8.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 2.3v2.3h-2.3M5 13.7v-2.3h2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BellMenuIcon() {
  return (
    <svg {...base}>
      <path d="M8 3a3 3 0 0 0-3 3v1.4c0 1-0.4 2-1 2.7h8c-0.6-0.7-1-1.7-1-2.7V6a3 3 0 0 0-3-3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.6 12a1.4 1.4 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
export function DurationMenuIcon() {
  return (
    <svg {...base}>
      <path d="M4 2.5h8M4 13.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.8 2.5c0 3 2 3.5 2 5.5s-2 2.5-2 5.5M11.2 2.5c0 3-2 3.5-2 5.5s2 2.5 2 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
