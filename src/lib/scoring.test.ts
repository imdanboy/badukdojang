import { describe, expect, test } from 'vitest'
import {
  parseFinalScore,
  parseFinalStatusList,
  calculateTerritory,
  computeScore,
} from './scoring.ts'

describe('parseFinalScore', () => {
  test('parses Black win', () => {
    expect(parseFinalScore('B+3.5')).toEqual({ winner: 'B', margin: 3.5 })
  })

  test('parses White win', () => {
    expect(parseFinalScore('W+2.5')).toEqual({ winner: 'W', margin: 2.5 })
  })

  test('parses draw', () => {
    expect(parseFinalScore('0')).toEqual({ winner: null, margin: 0 })
    expect(parseFinalScore('0.0')).toEqual({ winner: null, margin: 0 })
  })

  test('returns null for unknown format', () => {
    expect(parseFinalScore('unknown')).toEqual({ winner: null, margin: 0 })
  })
})

describe('parseFinalStatusList', () => {
  test('parses vertex list (19x19)', () => {
    const response = 'D4\nE4\nF4'
    expect(parseFinalStatusList(response, 19)).toEqual([
      [3, 15],
      [4, 15],
      [5, 15],
    ])
  })

  test('parses vertex list (9x9)', () => {
    const response = 'D4\nE4\nF4'
    expect(parseFinalStatusList(response, 9)).toEqual([
      [3, 5],
      [4, 5],
      [5, 5],
    ])
  })

  test('ignores pass and empty lines', () => {
    const response = 'D4\npass\n\nE4'
    expect(parseFinalStatusList(response, 19)).toEqual([
      [3, 15],
      [4, 15],
    ])
  })

  test('returns empty array for empty response', () => {
    expect(parseFinalStatusList('', 19)).toEqual([])
    expect(parseFinalStatusList('   ', 19)).toEqual([])
  })
})

describe('calculateTerritory', () => {
  test('empty board has no territory', () => {
    const signMap = Array.from({ length: 9 }, () => Array(9).fill(0) as (0 | 1 | -1)[])
    const result = calculateTerritory(signMap, [])
    expect(result.blackTerritory).toEqual([])
    expect(result.whiteTerritory).toEqual([])
  })

  test('fully enclosed territory for Black on small board', () => {
    const signMap = Array.from({ length: 3 }, () => Array(3).fill(0) as (0 | 1 | -1)[])
    signMap[0]![0] = 1
    signMap[0]![1] = 1
    signMap[0]![2] = 1
    signMap[1]![0] = 1
    signMap[1]![2] = 1
    signMap[2]![0] = 1
    signMap[2]![1] = 1
    signMap[2]![2] = 1
    // (1,1) should be black territory
    const result = calculateTerritory(signMap, [])
    expect(result.blackTerritory).toContainEqual([1, 1])
    expect(result.whiteTerritory).toEqual([])
  })

  test('dead stones are removed before territory calc', () => {
    const signMap = Array.from({ length: 5 }, () => Array(5).fill(0) as (0 | 1 | -1)[])
    // Enclose a region at (2,2) with black stones
    signMap[1]![1] = 1
    signMap[1]![2] = 1
    signMap[1]![3] = 1
    signMap[2]![1] = 1
    signMap[2]![3] = 1
    signMap[3]![1] = 1
    signMap[3]![2] = 1
    signMap[3]![3] = 1
    // White stone inside is dead
    signMap[2]![2] = -1
    const result = calculateTerritory(signMap, [[2, 2]])
    expect(result.blackTerritory).toContainEqual([2, 2])
    expect(result.whiteTerritory).toEqual([])
  })
})

describe('computeScore', () => {
  test('computes score for empty board with komi', () => {
    const signMap = Array.from({ length: 9 }, () => Array(9).fill(0) as (0 | 1 | -1)[])
    const score = computeScore(signMap, [], 6.5)
    expect(score.blackTerritory).toBe(0)
    expect(score.whiteTerritory).toBe(0)
    expect(score.komi).toBe(6.5)
    expect(score.margin).toBe(-6.5)
    expect(score.resultText).toBe('백 6.5집 승')
  })

  test('dead stones reduce stone count and become captures', () => {
    const signMap = Array.from({ length: 5 }, () => Array(5).fill(0) as (0 | 1 | -1)[])
    signMap[1]![1] = 1
    signMap[1]![2] = 1
    signMap[1]![3] = 1
    signMap[2]![1] = 1
    signMap[2]![3] = 1
    signMap[3]![1] = 1
    signMap[3]![2] = 1
    signMap[3]![3] = 1
    signMap[2]![2] = 1
    const score = computeScore(signMap, [[2, 2]], 6.5)
    expect(score.blackStonesOnBoard).toBe(8)
    expect(score.whiteCaptures).toBe(1)
    expect(score.blackTerritory).toBe(1)
  })
})
