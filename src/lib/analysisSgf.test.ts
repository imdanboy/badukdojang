import { describe, test, expect } from 'vitest'
import {
  encodeOwnership,
  decodeOwnership,
  analysisToKa,
  analysisFromKa,
  metadataToSgf,
  metadataFromSgf,
} from './analysisSgf.ts'
import type { AnalyzeResponse } from './engine/types.ts'

describe('ownership codec', () => {
  test('round-trips values within quantization error', () => {
    const ownership = [1, -1, 0, 0.5, -0.5, 0.04, -0.96]
    const decoded = decodeOwnership(encodeOwnership(ownership))
    expect(decoded).toHaveLength(ownership.length)
    // Quantization to 19 levels → max error is half a step (1/18).
    for (let i = 0; i < ownership.length; i++) {
      expect(Math.abs(decoded[i]! - ownership[i]!)).toBeLessThanOrEqual(1 / 18 + 1e-9)
    }
  })

  test('clamps out-of-range values', () => {
    const decoded = decodeOwnership(encodeOwnership([2, -3]))
    expect(decoded[0]).toBe(1)
    expect(decoded[1]).toBe(-1)
  })

  test('empty input round-trips to empty', () => {
    expect(decodeOwnership(encodeOwnership([]))).toEqual([])
  })
})

describe('analysisToKa / analysisFromKa', () => {
  const analysis: AnalyzeResponse = {
    id: 'x',
    winrate: 0.54321,
    scoreLead: 2.3456,
    visits: 80,
    ownership: [1, -1, 0, 0.5],
    bestMoves: [
      { move: 'Q16', visits: 50, winrate: 0.55, scoreLead: 2.5 },
      { move: 'D4', visits: 30, winrate: 0.51, scoreLead: 2.1 },
    ],
  }

  test('round-trips winrate, scoreLead, visits, bestMoves, ownership', () => {
    const restored = analysisFromKa(analysisToKa(analysis))
    expect(restored).not.toBeNull()
    expect(restored!.winrate).toBeCloseTo(0.543, 3)
    expect(restored!.scoreLead).toBeCloseTo(2.346, 3)
    expect(restored!.visits).toBe(80)
    expect(restored!.bestMoves).toHaveLength(2)
    expect(restored!.bestMoves![0]).toMatchObject({
      move: 'Q16',
      visits: 50,
      scoreLead: 2.5,
    })
    expect(restored!.ownership).toHaveLength(4)
    expect(restored!.ownership![0]).toBeCloseTo(1, 0.1)
    expect(restored!.ownership![1]).toBeCloseTo(-1, 0.1)
  })

  test('is compact (ownership packed, keys shortened)', () => {
    const ka = analysisToKa({ ...analysis, ownership: new Array(361).fill(0.3) })
    // 361 ownership chars + small JSON — well under a raw-JSON ownership dump.
    expect(ka.length).toBeLessThan(1500)
  })

  test('returns null for garbage', () => {
    expect(analysisFromKa(undefined)).toBeNull()
    expect(analysisFromKa('')).toBeNull()
    expect(analysisFromKa('not json')).toBeNull()
    expect(analysisFromKa('{"nope":1}')).toBeNull()
  })
})

describe('metadataFromSgf', () => {
  const metadata = {
    engine: '1.16.4+b18c384nbt-s6582M',
    model: 'kata1-b18c384nbt.bin.gz',
    analysisModel: 'g170e-b15c192-s1672170752-d466197061.bin.gz',
    maxVisits: 80,
    maxTime: 2,
    numSearchThreads: 2,
    komi: 6.5,
    rules: 'korean',
    date: '2026-10-18T00:00:00.000Z',
  }

  test('round-trips through metadataToSgf', () => {
    expect(metadataFromSgf(metadataToSgf(metadata))).toEqual(metadata)
  })

  test('returns null for garbage', () => {
    expect(metadataFromSgf(undefined)).toBeNull()
    expect(metadataFromSgf('nonsense')).toBeNull()
    expect(metadataFromSgf('{"engine":"x"}')).toBeNull() // missing analysisModel
  })
})
