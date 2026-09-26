// P0-B: what the sign-out prompt says when changes on this device haven't reached the server.
// Calm, no "error", no server text — house rule. Pure so it's unit-tested.
export function unsyncedSignOutCopy(n: number) {
  return {
    title: n === 1 ? '1 change hasn’t synced yet' : `${n} changes haven’t synced yet`,
    body:
      (n === 1 ? 'It’s' : 'They’re') +
      ' kept on this device and will sync once you’re connected. Signing out now would discard ' +
      (n === 1 ? 'it.' : 'them.'),
    confirmLabel: n === 1 ? 'Sign out anyway (discard it)' : 'Sign out anyway (discard them)',
    cancelLabel: 'Stay signed in',
  }
}
