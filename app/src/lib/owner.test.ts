import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOW_NAME, DEFAULT_WORKSPACE, flowName, workspaceName } from './owner'

describe('flowName', () => {
  it("names the app after the person who onboarded", () => {
    expect(flowName('Mira')).toBe("Mira's Flow")
  })

  it("falls back to Kai's Flow when no name was given", () => {
    expect(flowName(null)).toBe("Kai's Flow")
    expect(flowName(undefined)).toBe(DEFAULT_FLOW_NAME)
    expect(flowName('')).toBe(DEFAULT_FLOW_NAME)
    expect(flowName('   ')).toBe(DEFAULT_FLOW_NAME)
  })

  it('trims and collapses whitespace the way it was typed', () => {
    expect(flowName('  Mira  ')).toBe("Mira's Flow")
    expect(flowName('Mira\n  Rose')).toBe("Mira Rose's Flow")
  })

  it("keeps Kai's own answer looking exactly like the old header", () => {
    expect(flowName('Kai')).toBe(DEFAULT_FLOW_NAME)
  })
})

describe('workspaceName', () => {
  it('uses the workspace from onboarding', () => {
    expect(workspaceName('Nile Studio')).toBe('Nile Studio')
  })

  it('falls back to Personal (the column default) when unset or blank', () => {
    expect(workspaceName(null)).toBe('Personal')
    expect(workspaceName(undefined)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceName(' ')).toBe(DEFAULT_WORKSPACE)
  })

  it('trims and collapses whitespace', () => {
    expect(workspaceName('  Nile   Studio ')).toBe('Nile Studio')
  })
})
