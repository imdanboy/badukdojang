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
  test('scales linearly with confidence', () => {
    expect(ownershipSize(1)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(-1)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(0.5)).toBe(OWNERSHIP_MAX_SIZE * 0.5)
    expect(ownershipSize(0.2)).toBe(OWNERSHIP_MAX_SIZE * 0.2)
    expect(ownershipSize(0.5)).toBeGreaterThan(ownershipSize(0.2))
  })

  test('clamps to [0, MAX_SIZE] for out-of-range values', () => {
    expect(ownershipSize(2)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(-3)).toBe(OWNERSHIP_MAX_SIZE)
    expect(ownershipSize(0)).toBe(0)
  })
})

describe('ownershipMarks', () => {
  const signMap3 = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 0],
  ] as const
  test('emits marks for empty intersections with confident ownership', () => {
    const flat = [0.8, 1, -0.6, -1, 0.4, 0, 0, 0, 0.05]
    const marks = ownershipMarks(flat, signMap3, 3)
    // (0,0)=0.8 black, (2,0)=-0.6 white, (1,1)=0.4 black pass;
    // (2,2)=0.05 filtered as noise.
    // (1,0) black stone with black ownership is skipped (owner matches stone).
    // (0,1) white stone with white ownership is skipped (owner matches stone).
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

  test('skips stones whose owner matches the stone colour', () => {
    const flat = new Array(9).fill(1)
    const marks = ownershipMarks(flat, signMap3, 3)
    // Black ownership everywhere. The black stone at (1,0) is skipped;
    // the white stone at (0,1) gets a mark because the owner differs.
    expect(marks).toHaveLength(8)
    expect(marks.some((m) => m.cx === 1.5 && m.cy === 0.5)).toBe(false)
    expect(marks.some((m) => m.cx === 0.5 && m.cy === 1.5)).toBe(true)
  })

  test('marks stones whose predicted owner differs from the stone colour', () => {
    const flat = new Array(9).fill(-1)
    const marks = ownershipMarks(flat, signMap3, 3)
    // White ownership everywhere. The white stone at (0,1) is skipped;
    // the black stone at (1,0) gets a mark because the owner differs.
    expect(marks).toHaveLength(8)
    expect(marks.some((m) => m.cx === 0.5 && m.cy === 1.5)).toBe(false)
    expect(marks.some((m) => m.cx === 1.5 && m.cy === 0.5)).toBe(true)
  })
})
