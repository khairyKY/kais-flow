// P0-B: what the sign-out prompt says when changes on this device haven't reached the server.
// Calm, no "error", no server text — house rule. Pure so it's unit-tested.
export function unsyncedSignOutCopy(n: number) {
  return {
    title: n === 1 ? '1 change hasn’t synced yet' : `${n} changes haven’t synced yet`,
    body:
      (n === 1 ? 'It’s' : 'They’re') +
      ' kept on this device and will sync once you’re connected. Signing out now would discard ' +
      (n === 1 ? 'it.' : 'them.'),
    // Polish E: short enough that both labels sit on one line in the 300px ConfirmCard. The body
    // above already says what gets discarded, so the button needn't repeat "it"/"them".
    confirmLabel: 'Discard & sign out',
    cancelLabel: 'Stay signed in',
  }
}
