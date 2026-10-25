import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTreeAnalysis } from './useTreeAnalysis.ts'
import { createGameState } from '../lib/gameState.ts'
import {
  appendMove,
  createGameTree,
  navigateToNode,
} from '../lib/gameTree.ts'
import type { GameTree, GameTreeNode } from '../lib/gameTree.ts'
import { buildWinratePoints } from '../lib/treeLayout.ts'
import type { SgfAnalysisEntry } from '../lib/sgfIo.ts'

// Mock the engine adapter — the hook must never touch the network.
vi.mock('../lib/engine/katagoAdapter.ts', () => ({
  requestAnalysisForPath: vi.fn(),
  abortOngoing: vi.fn(() => Promise.resolve()),
}))

import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
const requestAnalysisForPath = katagoAdapter.requestAnalysisForPath as ReturnType<typeof vi.fn>
const abortOngoing = katagoAdapter.abortOngoing as ReturnType<typeof vi.fn>

/** Game with 3 main-line moves and one variation after move 2 → 4 targets. */
function buildGameTree(): { tree: GameTree; ids: [string, string, string, string, string] } {
  let tree = createGameTree(9)
  tree = appendMove(tree, [0, 0], 1) // m1
  tree = appendMove(tree, [1, 1], -1) // m2
  tree = appendMove(tree, [2, 2], 1) // m3 (main tip)
  const m3Main = String(tree.currentId!)
  const atM2 = navigateToNode(tree, tree.get(tree.currentId!)!.parentId!)
  tree = appendMove(atM2!, [5, 5], 1) // m3' (variation tip)
  const m3Var = String(tree.currentId!)
  return {
    tree,
    ids: [
      'root',
      String(tree.root.children[0]!.id),
      String(tree.root.children[0]!.children[0]!.id),
      m3Main,
      m3Var,
    ],
  }
}

function analysisFor(tag: string): SgfAnalysisEntry {
  return {
    analysis: { id: tag, winrate: 0.5, scoreLead: 0 },
    durationMs: 10,
  }
}

/** Stamp a KA property (player-perspective winrate 0.55) on every move node. */
function stampKaEverywhere(tree: GameTree): GameTree {
  const ka = JSON.stringify({ w: 0.55, s: 1.5, v: 80 })
  const visit = (node: GameTreeNode): void => {
    const data = node.data as { B?: unknown[]; W?: unknown[] }
    if (node.id !== 'root' && (data.B !== undefined || data.W !== undefined)) {
      ;(node.data as Record<string, unknown>).KA = [ka]
    }
    node.children.forEach(visit)
  }
  visit(tree.root)
  return tree
}

describe('useTreeAnalysis', () => {
  beforeEach(() => {
    requestAnalysisForPath.mockReset()
    abortOngoing.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function setup(tree: GameTree) {
    const gameState = createGameState(9, tree)
    const cacheRef = { current: new Map<string, SgfAnalysisEntry>() }
    const getLightAnalysisSettings = vi.fn(() => ({
      maxTime: 2,
      maxVisits: 80,
      numSearchThreads: 2,
      rules: 'korean' as const,
      komi: 6.5,
      boardSize: 9,
    }))
    const rendered = renderHook(
      (props: {
        gameState: typeof gameState
        engineEnabled: boolean
      }) =>
        useTreeAnalysis({
          gameState: props.gameState,
          engineEnabled: props.engineEnabled,
          getLightAnalysisSettings,
          analysisModelPath: '/models/b18.bin.gz',
          analysisCacheRef: cacheRef,
          timeoutMs: 5000,
        }),
      { initialProps: { gameState, engineEnabled: true } },
    )
    return { rendered, cacheRef, gameState, getLightAnalysisSettings }
  }

  test('analyzes every branch position and reports progress + completion', async () => {
    requestAnalysisForPath.mockImplementation(
      (_setup, moves: Array<{ vertex: unknown; sign: number }>) =>
        Promise.resolve(analysisFor(`wr-${moves.length}`)),
    )
    const { rendered, cacheRef } = setup(buildGameTree().tree)

    act(() => {
      rendered.result.current.start()
    })

    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.total).toBe(4)
    expect(rendered.result.current.completed).toBe(4)
    expect(rendered.result.current.error).toBeNull()
    // All four results landed in the shared cache, keyed by node id.
    expect(cacheRef.current.size).toBe(4)
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(4)
    // Each request carries the full replay path for its own branch.
    const thirdCallMoves = requestAnalysisForPath.mock.calls[2]![1] as unknown[]
    expect(thirdCallMoves).toHaveLength(3)
  })

  test('cached results are not re-analyzed (resume/reuse)', async () => {
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve(analysisFor('fresh')),
    )
    const { tree, ids } = buildGameTree()
    const { rendered, cacheRef } = setup(tree)
    // Pre-fill two positions (as a previous partial run would have).
    cacheRef.current.set(ids[3], analysisFor('cached-main'))
    cacheRef.current.set(ids[4], analysisFor('cached-var'))

    act(() => {
      rendered.result.current.start()
    })

    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    // Only the two uncached positions hit the engine.
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(2)
    expect(rendered.result.current.total).toBe(4)
    expect(rendered.result.current.completed).toBe(4)
    // Pre-cached results survived untouched.
    expect(cacheRef.current.get(ids[3])?.analysis.id).toBe('cached-main')
  })

  test('cancel stops scheduling, aborts in-flight work, and keeps results', async () => {
    let calls = 0
    requestAnalysisForPath.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) => {
        calls += 1
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      },
    )
    const { rendered, cacheRef } = setup(buildGameTree().tree)

    act(() => {
      rendered.result.current.start()
    })
    // First request is in-flight; cancel now.
    await waitFor(() => {
      expect(calls).toBe(1)
    })
    act(() => {
      rendered.result.current.cancel()
    })

    await waitFor(() => {
      expect(rendered.result.current.status).toBe('cancelled')
    })
    // No further requests were scheduled after the in-flight one.
    expect(calls).toBe(1)
    expect(abortOngoing).toHaveBeenCalled()
    // Nothing was cached (the in-flight request never completed).
    expect(cacheRef.current.size).toBe(0)
  })

  test('completed results survive cancellation and a rerun resumes', async () => {
    // First position resolves; second hangs until aborted.
    let calls = 0
    requestAnalysisForPath.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) => {
        calls += 1
        if (calls <= 1) return Promise.resolve(analysisFor('first'))
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      },
    )
    const { tree, ids } = buildGameTree()
    const { rendered, cacheRef } = setup(tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.completed).toBe(1)
    })
    act(() => {
      rendered.result.current.cancel()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('cancelled')
    })
    expect(cacheRef.current.get(ids[1])).toBeDefined()

    // Rerun: the completed result is reused, remaining positions analyzed.
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve(analysisFor('fresh')),
    )
    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.completed).toBe(4)
    // 2 requests in the first run (1 done + 1 cancelled in-flight), then 3
    // fresh in the rerun (ids[2], ids[3], ids[4] — ids[1] reused).
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(5)
  })

  test('engine error surfaces and stops the run', async () => {
    requestAnalysisForPath.mockRejectedValue(new Error('engine offline'))
    const { rendered } = setup(buildGameTree().tree)

    act(() => {
      rendered.result.current.start()
    })

    await waitFor(() => {
      expect(rendered.result.current.status).toBe('error')
    })
    expect(rendered.result.current.error).toContain('engine offline')
    expect(rendered.result.current.completed).toBe(0)
  })

  test('game change (new context) resets run state and stops a running batch', async () => {
    let calls = 0
    requestAnalysisForPath.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) => {
        calls += 1
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      },
    )
    const { rendered, cacheRef } = setup(buildGameTree().tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(calls).toBe(1)
    })

    // New game — a fresh GameState identity, exactly like load/new-game.
    act(() => {
      rendered.rerender({ gameState: createGameState(9), engineEnabled: true })
    })

    expect(rendered.result.current.status).toBe('idle')
    // The stale loop must never write into the (new context) cache.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(cacheRef.current.size).toBe(0)
    // No further scheduling for the old game.
    expect(calls).toBe(1)
  })

  test('idle start with zero targets completes immediately', async () => {
    const empty = createGameState(9)
    const { rendered } = setup(empty.gameTree)
    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.total).toBe(0)
    expect(requestAnalysisForPath).not.toHaveBeenCalled()
  })

  test('start is a no-op when the engine is disabled', () => {
    const gameState = createGameState(9, buildGameTree().tree)
    const cacheRef = { current: new Map<string, SgfAnalysisEntry>() }
    const getLightAnalysisSettings = vi.fn(() => ({
      maxTime: 2,
      maxVisits: 80,
      numSearchThreads: 2,
      rules: 'korean' as const,
      komi: 6.5,
      boardSize: 9,
    }))
    const rendered = renderHook(() =>
      useTreeAnalysis({
        gameState,
        engineEnabled: false,
        getLightAnalysisSettings,
        analysisModelPath: null,
        analysisCacheRef: cacheRef,
        timeoutMs: 5000,
      }),
    )
    act(() => {
      rendered.result.current.start()
    })
    expect(rendered.result.current.status).toBe('idle')
    expect(requestAnalysisForPath).not.toHaveBeenCalled()
  })

  test('SGF-embedded KA targets are primed, reused with zero engine calls, and plotted', async () => {
    const { tree, ids } = buildGameTree()
    const kaTree = stampKaEverywhere(tree)
    const { rendered, cacheRef } = setup(kaTree)

    act(() => {
      rendered.result.current.start()
    })

    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    // Zero engine calls: every target was primed from its node's KA.
    expect(requestAnalysisForPath).not.toHaveBeenCalled()
    expect(rendered.result.current.total).toBe(4)
    expect(rendered.result.current.completed).toBe(4)
    expect(rendered.result.current.error).toBeNull()
    // Primed entries landed in the shared cache (reused by the live panel
    // and SGF save embedding too).
    expect(cacheRef.current.size).toBe(4)
    expect(cacheRef.current.get(ids[1])?.analysis.winrate).toBe(0.55)

    // Plotted: the current path (variation tip) charts its 3 moves, with
    // the KA winrate converted to the Black perspective (player-to-play:
    // after move 1 White → 1-0.55; after move 2 Black → 0.55; after move 3
    // White → 1-0.55).
    const points = buildWinratePoints(kaTree, cacheRef.current)
    expect(points.map((p) => p.nodeId)).toEqual([ids[1], ids[2], ids[4]])
    expect(points[0]!.winrate).toBeCloseTo(0.45)
    expect(points[1]!.winrate).toBeCloseTo(0.55)
    expect(points[2]!.winrate).toBeCloseTo(0.45)
  })

  test('invalid KA values are ignored and analyzed by the engine', async () => {
    const { tree, ids } = buildGameTree()
    // Corrupt KA on the first move node only.
    const first = tree.root.children[0]!
    ;(first.data as Record<string, unknown>).KA = ['not-json']
    // Mocks resolve the RAW AnalyzeResponse (the hook wraps it in a cache
    // entry itself).
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve({ id: 'engine', winrate: 0.5, scoreLead: 0 }),
    )
    const { rendered, cacheRef } = setup(tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(4)
    expect(cacheRef.current.get(ids[1])?.analysis.id).toBe('engine')
  })

  test('engine disable mid-run invalidates the run and keeps completed results', async () => {
    let calls = 0
    requestAnalysisForPath.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) => {
        calls += 1
        if (calls === 1) {
          return Promise.resolve({ id: 'first', winrate: 0.5, scoreLead: 0 })
        }
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      },
    )
    const { tree, ids } = buildGameTree()
    const { rendered, gameState, cacheRef } = setup(tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.completed).toBe(1)
    })
    await waitFor(() => {
      expect(calls).toBe(2) // second request in-flight
    })

    // Engine turned off mid-run.
    act(() => {
      rendered.rerender({ gameState, engineEnabled: false })
    })

    expect(rendered.result.current.status).toBe('idle')
    await new Promise((resolve) => setTimeout(resolve, 30))
    // No further scheduling after invalidation; in-flight work aborted.
    expect(calls).toBe(2)
    expect(abortOngoing).toHaveBeenCalled()
    // Completed results survive for a resume run.
    expect(cacheRef.current.get(ids[1])?.analysis.id).toBe('first')

    // Re-enabling and rerunning resumes from the cache.
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve({ id: 'rest', winrate: 0.5, scoreLead: 0 }),
    )
    act(() => {
      rendered.rerender({ gameState, engineEnabled: true })
    })
    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.completed).toBe(4)
    // 2 calls in the first run + 3 fresh (ids[2..4]; ids[1] reused).
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(5)
  })

  test('a structural tree change mid-run invalidates the stale snapshot', async () => {
    let calls = 0
    requestAnalysisForPath.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) => {
        calls += 1
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      },
    )
    const { tree } = buildGameTree()
    const { rendered, gameState, cacheRef } = setup(tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(calls).toBe(1)
    })

    // The user plays a new move mid-run: the tree grows a new branch, so
    // the running snapshot is stale. (undo → different move replaces the
    // tip; a third branch appears under m2.)
    act(() => {
      gameState.undo()
      gameState.makeMove([7, 7])
      rendered.rerender({ gameState, engineEnabled: true })
    })

    // Must NOT finish "complete" for the stale snapshot: reset to idle.
    expect(rendered.result.current.status).toBe('idle')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(calls).toBe(1) // no further scheduling
    expect(abortOngoing).toHaveBeenCalled()

    // A rerun analyzes the FRESH snapshot (5 targets now) and completes.
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve({ id: 'fresh', winrate: 0.5, scoreLead: 0 }),
    )
    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.total).toBe(5)
    expect(rendered.result.current.completed).toBe(5)
    expect(cacheRef.current.size).toBe(5)
  })

  test('cursor navigation during a run does not cancel it', async () => {
    requestAnalysisForPath.mockImplementation(() =>
      Promise.resolve({ id: 'nav', winrate: 0.5, scoreLead: 0 }),
    )
    const { rendered, gameState } = setup(buildGameTree().tree)

    act(() => {
      rendered.result.current.start()
    })
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('running')
    })

    // Navigate (undo changes the gameTree identity but NOT its structure).
    act(() => {
      gameState.undo()
      rendered.rerender({ gameState, engineEnabled: true })
    })

    // The run continues over the unchanged structure and completes.
    await waitFor(() => {
      expect(rendered.result.current.status).toBe('complete')
    })
    expect(rendered.result.current.completed).toBe(4)
    expect(requestAnalysisForPath).toHaveBeenCalledTimes(4)
    expect(abortOngoing).not.toHaveBeenCalled()
  })
})
