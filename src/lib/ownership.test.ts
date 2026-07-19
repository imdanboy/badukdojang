import { describe, test, expect } from 'vitest'
import {
  ownershipToGrid,
  ownershipColor,
  ownershipCircles,
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

describe('ownershipColor', () => {
  test('positive value → black rgba with magnitude as alpha (max 0.5)', () => {
    expect(ownershipColor(1)).toBe('rgba(0, 0, 0, 0.5)')
    expect(ownershipColor(0.5)).toBe('rgba(0, 0, 0, 0.5)')
    expect(ownershipColor(0.3)).toBe('rgba(0, 0, 0, 0.3)')
  })

  test('negative value → white rgba with magnitude as alpha (max 0.5)', () => {
    expect(ownershipColor(-1)).toBe('rgba(255, 255, 255, 0.5)')
    expect(ownershipColor(-0.25)).toBe('rgba(255, 255, 255, 0.25)')
  })

  test('zero → transparent', () => {
    expect(ownershipColor(0)).toBe('rgba(0, 0, 0, 0)')
  })

  test('clamps out-of-range magnitude to [0, 0.5]', () => {
    expect(ownershipColor(2)).toBe('rgba(0, 0, 0, 0.5)')
    expect(ownershipColor(-2)).toBe('rgba(255, 255, 255, 0.5)')
  })
})

describe('ownershipCircles', () => {
  const signMap3 = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 0],
  ] as const

  test('emits circles only for empty intersections with non-zero ownership', () => {
    const flat = [0.8, 1, -0.6, -1, 0.4, 0, 0, 0, 0]
    const circles = ownershipCircles(flat, signMap3 as never, 3)
    // empty cells: (0,0)=0.8, (2,0)=-0.6, (1,1)=0.4, (2,1),(0,2),(1,2),(2,2)=0
    expect(circles).toHaveLength(3)
    expect(circles[0]).toEqual({ cx: 0.5, cy: 0.5, fill: 'rgba(0, 0, 0, 0.5)' })
    expect(circles[1]).toEqual({ cx: 2.5, cy: 0.5, fill: 'rgba(255, 255, 255, 0.5)' })
    expect(circles[2]).toEqual({ cx: 1.5, cy: 1.5, fill: 'rgba(0, 0, 0, 0.4)' })
  })

  test('returns empty when ownership length mismatches boardSize', () => {
    expect(ownershipCircles([1, 2], signMap3 as never, 3)).toEqual([])
  })

  test('skips zero-ownership empty points', () => {
    const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(ownershipCircles(flat, signMap3 as never, 3)).toEqual([])
  })
})