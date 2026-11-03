// Browser side of shots.mjs: runs a widget the way Übersicht does (initialState -> updateState on each command
// result -> render({ ...state, output, dispatch })).
import { createRoot } from 'react-dom/client'
import * as core from '../src/core.jsx'

window.KFH = {
  core,
  mount(kind, output, host) {
    const w = core.makeWidget(kind)
    const root = createRoot(host)
    let state = w.initialState
    const draw = () => root.render(w.render({ ...state, output, dispatch }))
    const dispatch = (e) => { state = w.updateState(e, state); draw() }
    state = w.updateState({ type: 'UB/COMMAND_RAN', output }, state)
    draw()
    return { get state() { return state }, dispatch }
  },
}
