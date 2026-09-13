import { describe, test, expect } from 'vitest'
import {
  ownershipToGrid,
  ownershipSize,
  ownershipMarks,
  OWNERSHIP_MIN_CONFIDENCE,
  OWNERSHIP_MAX_SIZE,
} from './ownership.ts'

describe('ownershipToGrid', () => {
  test('converts a flat array to a [y][x] grid', () => {
    const flat = [1, -1, 0, 0.5, -0.5, 0, 0, 0, 0]
    const grid = ownershipToGrid(flat, 3)
    expect(grid).toEqual([
      [1, -1, 0],
      [0.5, -0.5, 0],
      [0, 0, 0],
    ])
  })

  test('returns empty grid when length does not match boardSize^2', () => {
    expect(ownershipToGrid([1, 2, 3], 3)).toEqual([])
    expect(ownershipToGrid([], 0)).toEqual([])
  })
})

describe('ownershipSize', () => {
  test('scales with confidence', () => {
    expect(ownershipSize(1)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(-1)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(0.5)).toBeGreaterThan(ownershipSize(0.2))
  })

  test('clamps to [MIN_SIZE, MAX_SIZE] for out-of-range values', () => {
    expect(ownershipSize(2)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(-3)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(0)).toBe(0.18)
  })
})

describe('ownershipMarks', () => {
  const signMap3 = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 0],
  ] as const
  test('emits marks only for empty intersections with confident ownership', () => {
    const flat = [0.8, 1, -0.6, -1, 0.4, 0, 0, 0, 0.05]
    const marks = ownershipMarks(flat, signMap3, 3)
    // signMap3: (1,0) black stone and (0,1) white stone are skipped.
    // (0,0)=0.8 black, (2,0)=-0.6 white, (1,1)=0.4 black pass;
    // (2,2)=0.05 filtered as noise.
    expect(marks).toHaveLength(3)
    expect(marks[0]).toMatchObject({ cx: 0.5, cy: 0.5, sign: 1 })
    expect(marks[1]).toMatchObject({ cx: 2.5, cy: 0.5, sign: -1 })
    expect(marks[2]).toMatchObject({ cx: 1.5, cy: 1.5, sign: 1 })
    expect(marks[0]!.size).toBeGreaterThan(marks[2]!.size)
  })

  test('filters sub-threshold ownership as visual noise', () => {
    const flat = [0, OWNERSHIP_MIN_CONFIDENCE / 2, 0, 0, 0, 0, 0, 0, 0]
    expect(ownershipMarks(flat, signMap3, 3)).toEqual([])
  })

  test('returns empty when ownership length mismatches boardSize', () => {
    expect(ownershipMarks([1, 2], signMap3, 3)).toEqual([])
  })

  test('skips occupied intersections', () => {
    const flat = new Array(9).fill(1)
    const marks = ownershipMarks(flat, signMap3, 3)
    // Only the 7 empty cells get marks; (1,0) and (0,1) are occupied.
    expect(marks).toHaveLength(7)
    expect(marks.every((m) => !(m.cx === 1.5 && m.cy === 0.5))).toBe(true)
    expect(marks.every((m) => !(m.cx === 0.5 && m.cy === 1.5))).toBe(true)
  })
})
