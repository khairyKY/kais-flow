import { useMotionEnabled } from '../lib/motion'

// Suspense fallback while a lazily-loaded route chunk arrives. Split out of
// Stub.tsx so AppLayout's static import doesn't drag Stub into the eager
// bundle and defeat App.tsx's dynamic import of it for the Notifications route.
export function PageFallback() {
  // WB-1: the twinkle is decorative and ran forever regardless of the Effects toggle.
  // Reduced-motion was already neutralized in CSS; the app toggle was not.
  const motion = useMotionEnabled()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <span
        style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--acc-sage)', opacity: 0.6, animation: motion ? 'twinkle 1.1s var(--ease-natural) infinite' : undefined }}
      />
    </div>
  )
}
