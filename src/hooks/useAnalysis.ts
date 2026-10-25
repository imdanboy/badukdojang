/*
 * useAnalysis — on-demand lightweight position analysis.
 * Fetches only while the caller's `enabled` gate is on (the Ownership
 * toggle): turning it on analyses the current position, and subsequent
 * board changes re-fetch to keep the overlay live. When off, zero engine
 * requests are made so the full compute budget stays with gameplay.
 *
 * Caching: results are keyed by tree node id, so navigating back to an
 * already-analysed position is instant. SGF-embedded KA results (loaded
 * with the file) serve as a read-only cache layer too. The cache resets
 * when the run context changes — new game/load, analysis model switch,
 * or analysis settings change.
 *
 * Rapid navigation (rewind spam) is debounced — the fetch fires once the
 * board has been still for a beat, so intermediate positions cost nothing.
 *
 * Exposes winrate/scoreLead/ownership for the sidebar.
 */
import { useEffect, useRef, useState } from 'react'
import type { SignMap } from '@kaya/goboard'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import type { AnalyzeResponse, EngineSettings } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'
import { analysisFromKa } from '../lib/analysisSgf.ts'
import type { SgfAnalysisEntry } from '../lib/sgfIo.ts'

/** Quiet-period before an analysis request is sent (rapid navigation guard). */
export const ANALYSIS_DEBOUNCE_MS = 300

interface UseAnalysisOptions {
  engineEnabled: boolean
  /** Master gate: analysis runs only while this is true (Ownership toggle). */
  enabled: boolean
  signMap: SignMap
  gameState: GameState
  getLightAnalysisSettings: () => EngineSettings
  /** Current analysis-engine model path — part of the run context (cache key). */
  analysisModelPath: string | null
  timeoutMs: number
  /**
   * Shared node-id-keyed cache. Pass one in when another consumer (the
   * full-tree batch analysis) must read/write the same results; otherwise
   * the hook owns its own map.
   */
  analysisCacheRef?: { current: Map<string, SgfAnalysisEntry> }
}

export function useAnalysis({
  engineEnabled,
  enabled,
  signMap,
  gameState,
  getLightAnalysisSettings,
  analysisModelPath,
  timeoutMs,
  analysisCacheRef: externalCacheRef,
}: UseAnalysisOptions) {
  const [winrateAnalysis, setWinrateAnalysis] = useState<AnalyzeResponse | null>(null)
  const [winrateLoading, setWinrateLoading] = useState(false)
  const [winrateError, setWinrateError] = useState<string | null>(null)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const [ownership, setOwnership] = useState<readonly number[] | null>(null)
  const winrateReqRef = useRef(0)
  /** Node id → analysis result for the current game/settings/model context. */
  const ownedCacheRef = useRef(new Map<string, SgfAnalysisEntry>())
  const analysisCacheRef = externalCacheRef ?? ownedCacheRef

  const gameTree = gameState.gameTree
  const currentNodeId = String(gameTree.currentId ?? gameTree.root.id)

  // The cache is only valid within one run context. A new GameState
  // (new game / SGF load), a different analysis model, or changed
  // settings invalidate every entry.
  useEffect(() => {
    analysisCacheRef.current.clear()
  }, [gameState, analysisModelPath, getLightAnalysisSettings])

  // Stale ownership must not survive a board change.
  useEffect(() => {
    setOwnership(null)
  }, [signMap])

  // Race-guarded: only the latest fetch's result is applied.
  // Debounced: rapid navigation re-fires clear the pending timer before
  // it ever runs, so only the settled position hits the engine.
  useEffect(() => {
    if (!engineEnabled || !enabled) {
      setWinrateError(null)
      setWinrateLoading(false)
      return
    }

    const hasAnyStone = signMap.some((row) => row.some((cell) => cell !== 0))
    if (!hasAnyStone) {
      setWinrateError(null)
      setWinrateLoading(false)
      return
    }

    const apply = (
      analysis: AnalyzeResponse,
      durationMs: number | null,
    ): void => {
      winrateReqRef.current += 1
      setWinrateAnalysis(analysis)
      setAnalysisDurationMs(durationMs)
      setOwnership(analysis.ownership ?? null)
      setWinrateLoading(false)
      setWinrateError(null)
    }

    // 1. Session cache — analysed earlier this session.
    const cached = analysisCacheRef.current.get(currentNodeId)
    if (cached !== undefined) {
      apply(cached.analysis, cached.durationMs)
      return
    }

    // 2. SGF-embedded KA — loaded with the file; warm the cache with it.
    const node = gameTree.get(currentNodeId)
    const ka = (node?.data as { KA?: string[] } | undefined)?.KA?.[0]
    if (ka !== undefined) {
      const restored = analysisFromKa(ka)
      if (restored !== null) {
        analysisCacheRef.current.set(currentNodeId, { analysis: restored, durationMs: null })
        apply(restored, null)
        return
      }
    }

    const reqId = ++winrateReqRef.current
    setWinrateLoading(true)
    setWinrateError(null)

    const controller = new AbortController()
    let cancelled = false
    // 3. Debounced fetch for the settled position.
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const startedAt = performance.now()
          const analysis = await katagoAdapter.requestAnalysis(
            gameState.gameTree,
            gameState.currentPlayer,
            getLightAnalysisSettings(),
            controller.signal,
            timeoutMs,
          )
          if (cancelled || reqId !== winrateReqRef.current) return
          const durationMs = performance.now() - startedAt
          analysisCacheRef.current.set(currentNodeId, { analysis, durationMs })
          setWinrateAnalysis(analysis)
          setAnalysisDurationMs(durationMs)
          setOwnership(analysis.ownership ?? null)
          setWinrateError(null)
        } catch (err) {
          if (cancelled || reqId !== winrateReqRef.current) return
          setWinrateError(err instanceof Error ? err.message : String(err))
        } finally {
          if (!cancelled && reqId === winrateReqRef.current) {
            setWinrateLoading(false)
          }
        }
      })()
    }, ANALYSIS_DEBOUNCE_MS)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    gameTree,
    signMap,
    engineEnabled,
    enabled,
    gameState,
    getLightAnalysisSettings,
    analysisModelPath,
    timeoutMs,
    winrateAnalysis,
  ])

  return {
    winrateAnalysis,
    winrateLoading,
    winrateError,
    ownership,
    policy: winrateAnalysis?.policy ?? null,
    analysisDurationMs,
    /** Read-only view of the session analysis cache (node id → entry). */
    analysisCacheRef,
  }
}
