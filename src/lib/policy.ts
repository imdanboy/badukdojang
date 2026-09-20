import type { SignMap, Vertex } from '@kaya/goboard'

export interface PolicyMark {
  readonly vertex: Vertex
  readonly cx: number
  readonly cy: number
  readonly probability: number
}

/** Hide values that would only render as visual noise at one decimal percent. */
export const POLICY_DISPLAY_THRESHOLD = 0.001

/**
 * Convert KataGo's flat policy array into marks for empty board vertices.
 * KataGo stores rows from the opposite vertical direction to the UI.
 * The final policy entry is pass and is intentionally not rendered.
 */
export function policyMarks(
  policy: readonly number[],
  signMap: SignMap,
  boardSize: number,
): PolicyMark[] {
  if (policy.length < boardSize * boardSize) return []

  const marks: PolicyMark[] = []
  for (let y = 0; y < boardSize; y++) {
    const row = signMap[y]
    if (row === undefined) continue
    const kataY = boardSize - 1 - y
    for (let x = 0; x < boardSize; x++) {
      if (row[x] !== 0) continue
      const probability = policy[kataY * boardSize + x]
      if (
        probability === undefined ||
        !Number.isFinite(probability) ||
        probability < POLICY_DISPLAY_THRESHOLD
      ) {
        continue
      }
      marks.push({
        vertex: [x, y],
        cx: x + 0.5,
        cy: y + 0.5,
        probability,
      })
    }
  }
  return marks
}
