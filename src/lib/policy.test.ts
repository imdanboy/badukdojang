import { describe, expect, test } from 'vitest'
import type { SignMap } from '@kaya/goboard'
import { policyMarks } from './policy.ts'

const signMap2: SignMap = [
  [0, 0],
  [0, 0],
]

describe('policyMarks', () => {
  test('maps KataGo row order to UI coordinates', () => {
    const marks = policyMarks([0.1, 0.2, 0.3, 0.4], signMap2, 2)

    expect(marks.map((mark) => [mark.vertex, mark.probability])).toEqual([
      [[0, 0], 0.3],
      [[1, 0], 0.4],
      [[0, 1], 0.1],
      [[1, 1], 0.2],
    ])
  })

  test('omits occupied vertices and malformed arrays', () => {
    const occupied: SignMap = [
      [1, 0],
      [0, -1],
    ]

    expect(policyMarks([0.1, 0.2, 0.3, 0.4], occupied, 2)).toEqual([
      { vertex: [1, 0], cx: 1.5, cy: 0.5, probability: 0.4 },
      { vertex: [0, 1], cx: 0.5, cy: 1.5, probability: 0.1 },
    ])
    expect(policyMarks([0.1, 0.2], signMap2, 2)).toEqual([])
  })

  test('omits zero and near-zero probability vertices', () => {
    expect(policyMarks([0, 0.0009, 0.001, 0.4], signMap2, 2)).toHaveLength(2)
  })
})
