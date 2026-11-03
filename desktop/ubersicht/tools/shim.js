// A stand-in for Übersicht's own `uebersicht` module, for the checks and the screenshots: run() records the shell
// command a widget asks for and answers it from globalThis.__runResult (if a test set one).
export function run(command) {
  ;(globalThis.__runs ||= []).push(command)
  return Promise.resolve(globalThis.__runResult ? globalThis.__runResult(command) : '')
}
