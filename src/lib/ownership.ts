// ============================================================================
// src/lib/ownership.ts
// KataGo ownership overlay utilities.
//
// KataGo's analysis engine returns `ownership` as a flat `number[]` of length
// `boardYSize * boardXSize`, row-major (`y * boardXSize + x`), with each value
// in [-1, 1]:
//   positive  → Black owns the point
//   negative  → White owns the point
//   magnitude → confidence (0 = nobody, 1 = fully owned)
//
// The overlay follows the OGS score-estimator convention: a single solid
// square centered on the intersection. The square's side scales linearly with
// confidence, and it is drawn on empty points and on stones whose predicted
// owner differs from the stone colour (e.g. dead stones).
//
// Reference: KataGo Analysis_Engine.md (`ownership` field).
// ============================================================================

/**
 * Convert a flat ownership array into a 2D grid indexed `[y][x]`.
 *
 * Returns an empty grid when the flat array length does not match
 * `boardSize ** 2`, so callers can render safely even when the engine
 * returns a truncated or missing payload.
 */
export function ownershipToGrid(
  ownership: readonly number[],
  boardSize: number,
): number[][] {
  const grid: number[][] = []
  if (ownership.length !== boardSize * boardSize) return grid
  for (let y = 0; y < boardSize; y++) {
    const row: number[] = []
    for (let x = 0; x < boardSize; x++) {
      row.push(ownership[y * boardSize + x] ?? 0)
    }
    grid.push(row)
  }
  return grid
}

/** Minimum |ownership| for a mark to be drawn (below this is visual noise). */
export const OWNERSHIP_MIN_CONFIDENCE = 0.08

/** Square side in fraction of a cell, at full confidence (|value| = 1). */
export const OWNERSHIP_MAX_SIZE = 0.5

/**
 * Square side as a fraction of one cell for a given ownership value.
 *
 * Confidence (`|value|`) maps linearly to size, clamped to
 * [0, OWNERSHIP_MAX_SIZE] so malformed engine values cannot overflow the cell.
 */
export function ownershipSize(value: number): number {
  const confidence = Math.min(1, Math.max(0, Math.abs(value)))
  return OWNERSHIP_MAX_SIZE * confidence
}

/**
 * A single renderable ownership mark.
 * `cx`/`cy` are in SVG coordinates — intersection `[x, y]` maps to
 * `(x + 0.5, y + 0.5)`, matching Shudan's Grid component which draws
 * lines at `(x + 0.5) * vertexSize` in the content area. `size` is the
 * outer square side in the same units, so the overlay SVG can simply use
 * `boardSize` as its viewBox scale.
 */
export interface OwnershipMark {
  readonly cx: number
  readonly cy: number
  readonly size: number
  /** `1` black-owned, `-1` white-owned. */
  readonly sign: 1 | -1
}

/**
 * Build the list of ownership marks to render on the overlay.
 *
 * Following OGS, marks are drawn on empty intersections and on stones whose
 * predicted owner differs from the stone colour (indicating a likely dead or
 * wrongly-coloured stone). When the owner matches an existing stone, the stone
 * itself already conveys the information and no extra mark is drawn.
 *
 * `signMap` is Shudan's board state: `0` empty, `1` black, `-1` white.
 */
export function ownershipMarks(
  ownership: readonly number[],
  signMap: ReadonlyArray<ReadonlyArray<0 | 1 | -1>>,
  boardSize: number,
): readonly OwnershipMark[] {
  const grid = ownershipToGrid(ownership, boardSize)
  if (grid.length === 0) return []
  const marks: OwnershipMark[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const value = grid[y]![x]!
      if (Math.abs(value) < OWNERSHIP_MIN_CONFIDENCE) continue
      const stoneSign = signMap[y]?.[x] ?? 0
      const ownerSign = value > 0 ? 1 : -1
      // OGS: skip if the owner matches the existing stone colour.
      if (stoneSign !== 0 && stoneSign === ownerSign) continue
      marks.push({
        cx: x + 0.5,
        cy: y + 0.5,
        size: ownershipSize(value),
        sign: ownerSign,
      })
    }
  }
  return marks
}

