import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Floating UI renders on <body>, out of any ancestor whose transform would become the
// containing block for its position:fixed — a hovered .kf-lift row did exactly that to the
// row menus (J-6). Nested floats (a submenu inside a menu) stay in the parent's DOM so the
// parent's outside-click check still counts clicks in them as "inside".
const InFloat = createContext(false)

export function Float({ children }: { children: ReactNode }) {
  const nested = useContext(InFloat)
  if (nested) return <>{children}</>
  return createPortal(<InFloat.Provider value>{children}</InFloat.Provider>, document.body)
}
