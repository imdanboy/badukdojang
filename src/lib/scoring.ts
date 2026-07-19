import type { Vertex } from '@sabaki/go-board'
import type { SignMap } from '@sabaki/go-board'
import { parseGTPVertex } from './engine/katagoAdapter.ts'

export interface ScoringResult {
  /** Raw final_score string, e.g. "B+3.5" or "W+2.5" */
  readonly rawScore: string
  /** Dead stone vertices (engine classification) */
  readonly dead: readonly Vertex[]
  /** Alive stone vertices (engine classification) */
  readonly alive: readonly Vertex[]
  /** White territory vertices */
  readonly whiteTerritory: readonly Vertex[]
  /** Black territory vertices */
  readonly blackTerritory: readonly Vertex[]
  /** Komi value used */
  readonly komi: number
}

export interface ComputedScore {
  blackTerritory: number
  whiteTerritory: number
  blackCaptures: number
  whiteCaptures: number
  blackStonesOnBoard: number
  whiteStonesOnBoard: number
  komi: number
  /** Positive = Black wins, negative = White wins */
  margin: number
  /** Human-readable result string */
  resultText: string
}

/**
 * Parse a `final_score` GTP response.
 * Expected formats: "B+3.5", "W+2.5", "0", "B+0.5", etc.
 */
export function parseFinalScore(response: string): { winner: 'B' | 'W' | null; margin: number } {
  const trimmed = response.trim()
  if (trimmed === '0' || trimmed === '0.0') {
    return { winner: null, margin: 0 }
  }
  const match = trimmed.match(/^([BW])\+([0-9.]+)$/)
  if (match) {
    const winner = match[1] as 'B' | 'W'
    const margin = parseFloat(match[2]!)
    return { winner, margin }
  }
  return { winner: null, margin: 0 }
}

/**
 * Parse a `final_status_list <category>` GTP response.
 * Each line is a GTP vertex like "D4" or "pass" (passes are ignored).
 */
export function parseFinalStatusList(response: string, boardSize: number): Vertex[] {
  const trimmed = response.trim()
  if (trimmed === '') return []
  const lines = trimmed.split('\n')
  const result: Vertex[] = []
  for (const line of lines) {
    const v = line.trim()
    if (v === '' || v.toLowerCase() === 'pass') continue
    try {
      const parsed = parseGTPVertex(v, boardSize)
      if (parsed !== 'pass' && parsed !== 'resign') {
        result.push(parsed)
      }
    } catch {
      // Ignore unparseable lines
    }
  }
  return result
}

/**
 * Simple flood-fill territory calculator.
 * Removes dead stones from the board, then finds connected empty regions.
 * A region is territory for a color if all adjacent stones (after removing dead)
 * are of that color and the region is fully enclosed.
 * Regions touching the edge without full enclosure are neutral.
 */
export function calculateTerritory(
  signMap: SignMap,
  deadStones: readonly Vertex[],
): { blackTerritory: readonly Vertex[]; whiteTerritory: readonly Vertex[] } {
  const size = signMap.length
  if (size === 0) return { blackTerritory: [], whiteTerritory: [] }

  // Create a mutable copy with dead stones removed
  const board: (0 | 1 | -1)[][] = signMap.map((row) => [...row] as (0 | 1 | -1)[])
  for (const [x, y] of deadStones) {
    if (y >= 0 && y < size && x >= 0 && x < board[y]!.length) {
      board[y]![x] = 0
    }
  }

  const visited = Array.from({ length: size }, () => Array(size).fill(false))
  const blackTerritory: Vertex[] = []
  const whiteTerritory: Vertex[] = []

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y]![x] !== 0 || visited[y]![x]) continue

      const region: Vertex[] = []
      const queue: Vertex[] = [[x, y]]
      visited[y]![x] = true
      let touchesEdge = false
      const adjacentColors = new Set<1 | -1>()

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!
        region.push([cx, cy])
        if (cx === 0 || cx === size - 1 || cy === 0 || cy === size - 1) {
          touchesEdge = true
        }

        const neighbors: Vertex[] = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue
          if (board[ny]![nx] === 0) {
            if (!visited[ny]![nx]) {
              visited[ny]![nx] = true
              queue.push([nx, ny])
            }
          } else {
            const sign = board[ny]![nx]
            if (sign !== undefined) {
              adjacentColors.add(sign)
            }
          }
        }
      }

      // Territory assignment:
      // - If region touches edge and isn't fully enclosed by one color → neutral
      // - If adjacent to exactly one color → territory for that color
      // - If adjacent to both or none → neutral
      if (!touchesEdge && adjacentColors.size === 1) {
        const color = adjacentColors.values().next().value as 1 | -1
        if (color === 1) {
          blackTerritory.push(...region)
        } else {
          whiteTerritory.push(...region)
        }
      }
    }
  }

  return { blackTerritory, whiteTerritory }
}

/**
 * Compute the final score from a board position, dead stones, and komi.
 * Uses area scoring (Chinese-style): territory + stones on board.
 */
export function computeScore(
  signMap: SignMap,
  deadStones: readonly Vertex[],
  komi: number,
): ComputedScore {
  const size = signMap.length
  let blackStonesOnBoard = 0
  let whiteStonesOnBoard = 0
  let blackCaptures = 0
  let whiteCaptures = 0

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sign = signMap[y]![x]
      if (sign === 1) blackStonesOnBoard++
      else if (sign === -1) whiteStonesOnBoard++
    }
  }

  // Dead stones are treated as captures
  for (const [x, y] of deadStones) {
    const sign = signMap[y]?.[x]
    if (sign === 1) {
      blackStonesOnBoard--
      whiteCaptures++
    } else if (sign === -1) {
      whiteStonesOnBoard--
      blackCaptures++
    }
  }

  const { blackTerritory, whiteTerritory } = calculateTerritory(signMap, deadStones)

  const blackTotal = blackStonesOnBoard + blackTerritory.length
  const whiteTotal = whiteStonesOnBoard + whiteTerritory.length
  const margin = blackTotal - whiteTotal - komi

  let resultText: string
  if (margin > 0) {
    resultText = `흑 ${margin.toFixed(1)}집 승`
  } else if (margin < 0) {
    resultText = `백 ${Math.abs(margin).toFixed(1)}집 승`
  } else {
    resultText = '무승부'
  }

  return {
    blackTerritory: blackTerritory.length,
    whiteTerritory: whiteTerritory.length,
    blackCaptures,
    whiteCaptures,
    blackStonesOnBoard,
    whiteStonesOnBoard,
    komi,
    margin,
    resultText,
  }
}
