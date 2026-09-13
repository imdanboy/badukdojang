/*
 * useAnalysis — race-guarded lightweight position analysis polling.
 * Re-fetches after every board change while the engine and the analysis
 * toggle are on; exposes winrate/scoreLead/ownership for the sidebar.
 */
import { useEffect, useRef, useState } from 'react'
import type { SignMap } from '@kaya/goboard'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import type { AnalyzeResponse, EngineSettings } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'

interface UseAnalysisOptions {
  engineEnabled: boolean
  analysisEnabled: boolean
  signMap: SignMap
  gameState: GameState
  getLightAnalysisSettings: () => EngineSettings
  timeoutMs: number
}

export function useAnalysis({
  engineEnabled,
  analysisEnabled,
  signMap,
  gameState,
  getLightAnalysisSettings,
  timeoutMs,
}: UseAnalysisOptions) {
  const [winrateAnalysis, setWinrateAnalysis] = useState<AnalyzeResponse | null>(null)
  const [winrateLoading, setWinrateLoading] = useState(false)
  const [winrateError, setWinrateError] = useState<string | null>(null)
  const [ownership, setOwnership] = useState<readonly number[] | null>(null)
  const winrateReqRef = useRef(0)

  // Stale ownership must not survive a board change.
  useEffect(() => {
    setOwnership(null)
  }, [signMap])

  // Race-guarded: only the latest fetch's result is applied.
  // Cancels in-flight request on re-fire to prevent bridge-side
  // concurrency on the single katago analysis process stdout.
  useEffect(() => {
    if (!engineEnabled || !analysisEnabled) {
      setWinrateAnalysis(null)
      setWinrateError(null)
      setWinrateLoading(false)
      return
    }

    const hasAnyStone = signMap.some((row) => row.some((cell) => cell !== 0))
    if (!hasAnyStone) {
      setWinrateAnalysis(null)
      setWinrateError(null)
      setWinrateLoading(false)
      return
    }

    const reqId = ++winrateReqRef.current
    setWinrateLoading(true)
    setWinrateError(null)

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
  }, [signMap, engineEnabled, analysisEnabled, gameState, getLightAnalysisSettings, timeoutMs])

  return {
    winrateAnalysis,
    winrateLoading,
    winrateError,
    ownership,
  }
}
