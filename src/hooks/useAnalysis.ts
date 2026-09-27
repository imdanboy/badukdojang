/*
 * useAnalysis — on-demand lightweight position analysis.
 * Fetches only while the caller's `enabled` gate is on (the Ownership
 * toggle): turning it on analyses the current position, and subsequent
 * board changes re-fetch to keep the overlay live. When off, zero engine
 * requests are made so the full compute budget stays with gameplay.
 * Exposes winrate/scoreLead/ownership for the sidebar.
 */
import { useEffect, useRef, useState } from 'react'
import type { SignMap } from '@kaya/goboard'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import type { AnalyzeResponse, EngineSettings } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'

interface UseAnalysisOptions {
  engineEnabled: boolean
  /** Master gate: analysis runs only while this is true (Ownership toggle). */
  enabled: boolean
  signMap: SignMap
  gameState: GameState
  getLightAnalysisSettings: () => EngineSettings
  timeoutMs: number
}

export function useAnalysis({
  engineEnabled,
  enabled,
  signMap,
  gameState,
  getLightAnalysisSettings,
  timeoutMs,
}: UseAnalysisOptions) {
  const [winrateAnalysis, setWinrateAnalysis] = useState<AnalyzeResponse | null>(null)
  const [winrateLoading, setWinrateLoading] = useState(false)
  const [winrateError, setWinrateError] = useState<string | null>(null)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const [ownership, setOwnership] = useState<readonly number[] | null>(null)
  const winrateReqRef = useRef(0)
  const lastAnalysisKeyRef = useRef<string | null>(null)

  // Stale ownership must not survive a board change.
  useEffect(() => {
    setOwnership(null)
  }, [signMap])

  // Race-guarded: only the latest fetch's result is applied.
  // Cancels in-flight request on re-fire to prevent bridge-side
  // concurrency on the single katago analysis process stdout.
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

    const requestKey = JSON.stringify({
      signMap,
      settings: getLightAnalysisSettings(),
    })
    if (lastAnalysisKeyRef.current === requestKey && winrateAnalysis !== null) {
      return
    }

    const reqId = ++winrateReqRef.current
    setWinrateLoading(true)
    setWinrateError(null)
    const startedAt = performance.now()

    const controller = new AbortController()
    let cancelled = false
    void (async () => {
      try {
        const analysis = await katagoAdapter.requestAnalysis(
          gameState.gameTree,
          gameState.currentPlayer,
          getLightAnalysisSettings(),
          controller.signal,
          timeoutMs,
        )
        if (cancelled || reqId !== winrateReqRef.current) return
        setWinrateAnalysis(analysis)
        lastAnalysisKeyRef.current = requestKey
        setAnalysisDurationMs(performance.now() - startedAt)
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

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    signMap,
    engineEnabled,
    enabled,
    gameState,
    getLightAnalysisSettings,
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
  }
}
