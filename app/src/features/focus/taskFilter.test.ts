import { describe, expect, it } from 'vitest'
import { filterFocusTasks } from './taskFilter'

const t = (title: string, status = 'todo') => ({ title, status: status as 'todo' | 'done' })
const TASKS = [t('Call the tyre supplier'), t('Send the Q3 numbers to Priya'), t('Fix your portfolio', 'done'), t('Call the bank about the mortgage')]

describe('filterFocusTasks', () => {
  it('offers every open task, in order, before anything is typed', () => {
    expect(filterFocusTasks(TASKS, '').map((x) => x.title)).toEqual(['Call the tyre supplier', 'Send the Q3 numbers to Priya', 'Call the bank about the mortgage'])
  })
  it('matches every typed word, any order, any case', () => {
    expect(filterFocusTasks(TASKS, 'CALL').map((x) => x.title)).toEqual(['Call the tyre supplier', 'Call the bank about the mortgage'])
    expect(filterFocusTasks(TASKS, 'bank call').map((x) => x.title)).toEqual(['Call the bank about the mortgage'])
  })
  it('never offers a done task, and finds nothing for a miss', () => {
    expect(filterFocusTasks(TASKS, 'portfolio')).toEqual([])
    expect(filterFocusTasks(TASKS, 'zebra')).toEqual([])
  })
})
