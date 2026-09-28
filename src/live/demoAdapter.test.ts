import { describe, expect, it } from 'vitest'
import { adapters } from './adapters'
import './demoAdapter'

describe('Agentic 501 proof adapters', () => {
  const expected = ['scale-baseline', 'scale-sustained', 'scale-pressure', 'scale-recovery']

  it('registers every stage of the measured journey', () => {
    expect([...adapters.keys()]).toEqual(expect.arrayContaining(expected))
  })

  it.each(expected)('%s has an explicitly source-labeled rehearsal fixture', (id) => {
    const adapter = adapters.get(id)
    expect(adapter?.rehearsal).toBeDefined()
    expect(adapter?.rehearsal?.collectedAt).toBeTruthy()
    expect(JSON.stringify(adapter?.rehearsal?.data)).toMatch(/rehearsal/i)
  })
})
