/*
 * useTreeAnalysis — full game-tree batch analysis (Feature B).
 *
 * Walks EVERY variation branch of the current tree (not just the selected
 * line), analyzing the position after each move, one request at a time.
 * Results land in the SAME node-id-keyed cache the live analysis uses, so:
 *   - cached positions are never re-analyzed (resume/reuse for free),
 *   - the live winrate panel and SGF save embedding pick the results up.
 *
 * The cache is only valid within one run context (game + analysis model +
 * settings) — the same triggers useAnalysis uses. A context change resets
 * run state and invalidates any in-flight loop so results can never leak
 * across games (node ids are per-tree, not globally unique).
 *
 * The run is additionally bound to the tree's STRUCTURE (hash of ids and
 * shape): moves or branches added mid-run make the target snapshot stale,
 * so the run is invalidated instead of finishing as "complete" for a tree
 * that no longer exists. Cursor navigation keeps the structure hash
 * unchanged and never cancels a run. Completed results always survive in
 * the shared cache — running again resumes/reuses them.
 *
 * SGF-embedded per-node KA results are primed into the cache before the
 * run decides what to analyze: a loaded file's embedded analysis must not
 * cost engine calls, and it becomes plottable like fresh results.
 *
 * Cancellation stops scheduling further work, aborts the in-flight request,
 * and asks the bridge to terminate the ongoing search. Completed results
 * are kept — running again resumes where it left off.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import type { EngineSettings } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'
import { findNodeById } from '../lib/gameTree.ts'
import { analysisFromKa } from '../lib/analysisSgf.ts'
import { collectAnalysisTargets } from '../lib/treeLayout.ts'
import type { SgfAnalysisEntry } from '../lib/sgfIo.ts'

export type TreeAnalysisStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'cancelled'
  | 'error'

export interface TreeAnalysisState {
  readonly status: TreeAnalysisStatus
  readonly completed: number
  readonly total: number
  readonly error: string | null
}

const IDLE: TreeAnalysisState = { status: 'idle', completed: 0, total: 0, error: null }

interface UseTreeAnalysisOptions {
  gameState: GameState
  engineEnabled: boolean
  getLightAnalysisSettings: () => EngineSettings
  /** Current analysis-engine model path — part of the run context. */
  analysisModelPath: string | null
  /** Shared node-id-keyed analysis cache (same map useAnalysis writes). */
  analysisCacheRef: { current: Map<string, SgfAnalysisEntry> }
  timeoutMs: number
}

export function useTreeAnalysis({
  gameState,
  engineEnabled,
  getLightAnalysisSettings,
  analysisModelPath,
  analysisCacheRef,
  timeoutMs,
}: UseTreeAnalysisOptions) {
  const [state, setState] = useState<TreeAnalysisState>(IDLE)
  const runningRef = useRef(false)
  const cancelRequestedRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  // A run is invalidated by ANY of these triggers (effect refires → runId
  // bump → the loop's next await-check exits silently):
  //   - gameState identity: new game / SGF load (cache context changed).
  //   - analysis model / settings: run-context change (same triggers
  //     useAnalysis clears the shared cache on).
  //   - engine disable: nothing left to analyze with.
  //   - tree structure hash: moves/branches added mid-run make the target
  //     snapshot stale — the run must not finish "complete" for a tree that
  //     no longer exists. Cursor navigation over an unchanged tree keeps
  //     the hash identical, so it never cancels a run.
  // Progress resets to idle; completed cache results are preserved so a
  // rerun resumes/reuses them.
  const structureHash = gameState.gameTree.getStructureHash()
  useEffect(() => {
    const wasRunning = runningRef.current
    runIdRef.current += 1
    runningRef.current = false
    cancelRequestedRef.current = false
    controllerRef.current?.abort()
    controllerRef.current = null
    if (wasRunning) {
      // Terminate the engine's ongoing search too — same pattern as
      // cancel() and the AI-move abort. Fire-and-forget: a dead bridge
      // must never break invalidation.
      void katagoAdapter.abortOngoing().catch(() => {})
    }
    setState(IDLE)
  }, [gameState, structureHash, engineEnabled, analysisModelPath, getLightAnalysisSettings])

  const start = useCallback(() => {
    if (runningRef.current || !engineEnabled) return

    const tree = gameState.gameTree
    const boardSize = gameState.board.width
    const targets = collectAnalysisTargets(tree, boardSize)
    if (targets.length === 0) {
      setState({ status: 'complete', completed: 0, total: 0, error: null })
      return
    }

    // Prime the shared cache with SGF-embedded per-node KA results BEFORE
    // deciding what to analyze. The live analysis only warms the currently
    // selected node (and only while a display toggle is on), so a loaded
    // file's embedded results would otherwise be re-analyzed. Valid KA
    // values are reused with zero engine calls and plotted like fresh ones.
    for (const target of targets) {
      if (analysisCacheRef.current.get(target.nodeId) !== undefined) continue
      // Safe lookup: tree.get compares ids strictly and would poison its
      // node cache on a string lookup of a numeric id (see gameTree.ts).
      const node = findNodeById(tree, target.nodeId)
      const ka = (node?.data as { KA?: string[] } | undefined)?.KA?.[0]
      if (ka === undefined) continue
      const restored = analysisFromKa(ka)
      if (restored !== null) {
        analysisCacheRef.current.set(target.nodeId, { analysis: restored, durationMs: null })
      }
    }

    const runId = ++runIdRef.current
    runningRef.current = true
    cancelRequestedRef.current = false

    // Positions already cached (earlier run, live analysis, or SGF-embedded
    // KA) count as done up front so progress reflects the true total.
    const preCached = new Set(
      targets
        .filter((t) => analysisCacheRef.current.get(t.nodeId) !== undefined)
        .map((t) => t.nodeId),
    )
    let completed = preCached.size

    const finish = (status: TreeAnalysisStatus, error: string | null = null): void => {
      runningRef.current = false
      controllerRef.current = null
      if (runId === runIdRef.current) {
        setState({ status, completed, total: targets.length, error })
      }
    }

    setState({ status: 'running', completed, total: targets.length, error: null })

    void (async () => {
      for (const target of targets) {
        if (runId !== runIdRef.current) return // context changed — stop silently
        if (cancelRequestedRef.current) {
          finish('cancelled')
          return
        }

        // Cached since the snapshot (live analysis may have filled it).
        if (analysisCacheRef.current.get(target.nodeId) !== undefined) {
          if (!preCached.has(target.nodeId)) {
            completed += 1
            setState({ status: 'running', completed, total: targets.length, error: null })
          }
          continue
        }

        const controller = new AbortController()
        controllerRef.current = controller
        try {
          const startedAt = performance.now()
          const analysis = await katagoAdapter.requestAnalysisForPath(
            target.setup,
            target.moves,
            getLightAnalysisSettings(),
            controller.signal,
            timeoutMs,
          )
          if (runId !== runIdRef.current) return
          if (cancelRequestedRef.current) {
            finish('cancelled')
            return
          }
          analysisCacheRef.current.set(target.nodeId, {
            analysis,
            durationMs: performance.now() - startedAt,
          })
          completed += 1
          setState({ status: 'running', completed, total: targets.length, error: null })
        } catch (error) {
          if (runId !== runIdRef.current) return
          if (cancelRequestedRef.current || controller.signal.aborted) {
            finish('cancelled')
            return
          }
          finish(
            'error',
            error instanceof Error ? error.message : String(error),
          )
          return
        } finally {
          if (controllerRef.current === controller) {
            controllerRef.current = null
          }
        }

        // Yield to the event loop so progress paints between positions.
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (runId !== runIdRef.current) return
      }

      finish('complete')
    })()
  }, [gameState, engineEnabled, getLightAnalysisSettings, analysisCacheRef, timeoutMs])

  const cancel = useCallback(() => {
    if (!runningRef.current) return
    cancelRequestedRef.current = true
    controllerRef.current?.abort()
    // Terminate the ongoing engine search (same pattern as AI-move abort).
    void katagoAdapter.abortOngoing().catch(() => {})
  }, [])

  return {
    ...state,
    isActive: state.status === 'running',
    start,
    cancel,
  }
}
