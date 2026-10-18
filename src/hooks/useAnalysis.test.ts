/*
 * useAnalysis unit tests — debounce + per-node cache.
 * - Rapid signMap changes must coalesce into a single engine request for
 *   the last settled position.
 * - Navigating back to an analysed node must hit the cache (no re-fetch).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import type { SignMap, Vertex } from '@kaya/goboard'
import { ANALYSIS_DEBOUNCE_MS, useAnalysis } from './useAnalysis.ts'
import { createGameState } from '../lib/gameState.ts'
import type { GameState } from '../lib/gameState.ts'
import type { EngineSettings } from '../lib/engine/types.ts'

vi.mock('../lib/engine/katagoAdapter.ts', () => ({
  requestAnalysis: vi.fn().mockResolvedValue({
    id: 'test',
    winrate: 0.5,
    scoreLead: 0,
    visits: 10,
    ownership: [],
  }),
}))

import { requestAnalysis } from '../lib/engine/katagoAdapter.ts'

const BOARD_SIZE = 19

const settings = { maxTime: 1, maxVisits: 10, numSearchThreads: 1 } as EngineSettings
const getLightAnalysisSettings = (): EngineSettings => settings

function stateWithStones(stones: Vertex[]): GameState {
  const gs = createGameState(BOARD_SIZE)
  for (const v of stones) {
    if (!gs.makeMove(v)) throw new Error(`illegal move ${v}`)
  }
  return gs
}

function Harness({ gameState, signMap }: { gameState: GameState; signMap: SignMap }) {
  useAnalysis({
    engineEnabled: true,
    enabled: true,
    signMap,
    gameState,
    getLightAnalysisSettings,
    analysisModelPath: null,
    timeoutMs: 1000,
  })
  return createElement('div')
}

describe('useAnalysis debounce and cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(requestAnalysis).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches once per position, cached on revisit', async () => {
    const gs = stateWithStones([[3, 3]])

    const { rerender } = render(
      createElement(Harness, { gameState: gs, signMap: gs.getSignMap() }),
    )
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS)
    expect(requestAnalysis).toHaveBeenCalledTimes(1)

    // Navigate deeper — new node, new fetch.
    gs.makeMove([4, 4])
    rerender(createElement(Harness, { gameState: gs, signMap: gs.getSignMap() }))
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS)
    expect(requestAnalysis).toHaveBeenCalledTimes(2)

    // Rewind to the first node — cache hit, no new fetch.
    gs.undo()
    rerender(createElement(Harness, { gameState: gs, signMap: gs.getSignMap() }))
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS)
    expect(requestAnalysis).toHaveBeenCalledTimes(2)
  })

  test('rapid navigation coalesces into one fetch for the last position', async () => {
    const gs = stateWithStones([[3, 3]])

    const { rerender } = render(
      createElement(Harness, { gameState: gs, signMap: gs.getSignMap() }),
    )
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS)
    expect(requestAnalysis).toHaveBeenCalledTimes(1)

    // Rewind spam: three fresh positions within the debounce window.
    for (const v of [[4, 4], [5, 5], [6, 6]] as Vertex[]) {
      const next = stateWithStones([[3, 3], v])
      rerender(createElement(Harness, { gameState: next, signMap: next.getSignMap() }))
      await vi.advanceTimersByTimeAsync(100)
    }

    // Mid-spam: nothing new fetched yet.
    expect(requestAnalysis).toHaveBeenCalledTimes(1)

    // After the board settles, exactly one fetch for the final position.
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS)
    expect(requestAnalysis).toHaveBeenCalledTimes(2)
  })
})
