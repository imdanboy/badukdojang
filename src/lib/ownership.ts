// ============================================================================
// src/lib/ownership.ts
// KataGo ownership heatmap utilities.
//
// KataGo's analysis engine returns `ownership` as a flat `number[]` of length
// `boardYSize * boardXSize`, row-major (`y * boardXSize + x`), with each value
// in [-1, 1]:
//   positive  → Black owns the point
//   negative  → White owns the point
//   magnitude → confidence (0 = nobody, 1 = fully owned)
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

/**
 * Map an ownership value in [-1, 1] to an `rgba(...)` fill string.
 *
 *   value > 0  → black tint (Black territory)
 *   value < 0  → white tint (White territory)
 *   |value|    → alpha channel (0 transparent, 0.5 max)
 *
 * The magnitude is clamped to [0, 1] so a malformed engine value cannot
 * produce an out-of-gamut alpha. Max alpha capped at 0.5 so the board
 * remains visible through the overlay.
 */
export function ownershipColor(value: number): string {
  const alpha = Math.min(0.5, Math.max(0, Math.abs(value)))
  if (value > 0) return `rgba(0, 0, 0, ${alpha})`
  if (value < 0) return `rgba(255, 255, 255, ${alpha})`
  return 'rgba(0, 0, 0, 0)'
}

/**
 * A single renderable heatmap circle: SVG-space center + fill.
 * `cx`/`cy` are in SVG coordinates — intersection `[x, y]` maps to
 * `(x + 0.5, y + 0.5)`, matching Shudan's Grid component which draws
 * lines at `(2*i+1) * halfVertexSize`.
 */
export interface OwnershipCircle {
  readonly cx: number
  readonly cy: number
  readonly fill: string
}

/**
 * Build the list of circles to render for the ownership overlay.
 *
 * Only empty intersections (`signMap[y][x] === 0`) emit a circle so that
 * existing stones remain fully visible — the heatmap communicates territory
 * on empty points, which is the conventional Go analysis UI behavior
 * (Lizzie/Katago overlays do the same).
 *
 * `signMap` is Shudan's board state: `0` empty, `1` black, `-1` white.
 */
export function ownershipCircles(
  ownership: readonly number[],
  signMap: ReadonlyArray<ReadonlyArray<0 | 1 | -1>>,
  boardSize: number,
): readonly OwnershipCircle[] {
  const grid = ownershipToGrid(ownership, boardSize)
  if (grid.length === 0) return []
  const circles: OwnershipCircle[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (signMap[y]?.[x] !== 0) continue
      const value = grid[y]![x]!
      if (value === 0) continue
      circles.push({
        cx: x + 0.5,
        cy: y + 0.5,
        fill: ownershipColor(value),
      })
    }
  }
  return circles
}