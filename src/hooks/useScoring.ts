/*
 * useScoring — KataGo-driven scoring flow.
 * Requests dead-stone detection, tracks manual dead/alive overrides,
 * and computes the live score as overrides change.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { SignMap, Vertex } from '@kaya/goboard'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import { EngineError } from '../lib/engine/types.ts'
import type { EngineSettings } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'
import { computeScore } from '../lib/scoring.ts'
import type { ScoringResult, ComputedScore } from '../lib/scoring.ts'

interface UseScoringOptions {
  signMap: SignMap
  gameState: GameState
  canScore: boolean
  isAiThinkingRef: RefObject<boolean>
  getAnalysisSettings: () => EngineSettings
  showToast: (message: string) => void
  setEngineError: (error: EngineError | null) => void
}

export function useScoring({
  signMap,
  gameState,
  canScore,
  isAiThinkingRef,
  getAnalysisSettings,
  showToast,
  setEngineError,
}: UseScoringOptions) {
  const [isScoring, setIsScoring] = useState(false)
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null)
  const [manualOverrides, setManualOverrides] = useState(
    new Map<string, 'dead' | 'alive'>(),
  )
  const [computedScore, setComputedScore] = useState<ComputedScore | null>(null)

  const effectiveDeadStones = useMemo(() => {
    if (scoringResult === null) return []
    const result: [number, number][] = []
    const overrideSet = new Set<string>()
    for (const [key, status] of manualOverrides.entries()) {
      if (status === 'dead') {
        const [x, y] = key.split(',').map(Number) as [number, number]
        result.push([x, y])
      }
      overrideSet.add(key)
    }
    for (const v of scoringResult.dead) {
      const key = `${v[0]},${v[1]}`
      if (!overrideSet.has(key)) {
        result.push(v)
      }
    }
    return result
  }, [scoringResult, manualOverrides])

  const handleScore = useCallback(async () => {
    if (!canScore || isAiThinkingRef.current) return
    setIsScoring(true)
    setManualOverrides(new Map())
    try {
      const result = await katagoAdapter.requestScoring(
        gameState.gameTree,
        getAnalysisSettings(),
      )
      setScoringResult(result)
      const score = computeScore(signMap, result.dead, result.komi)
      setComputedScore(score)
    } catch (err) {
      showToast(
        '계가 오류: ' + (err instanceof Error ? err.message : String(err)),
      )
      setIsScoring(false)
      if (err instanceof EngineError) {
        setEngineError(err)
      }
    }
  }, [canScore, gameState.gameTree, getAnalysisSettings, signMap, showToast, isAiThinkingRef, setEngineError])

  const handleToggleDead = useCallback(
    (vertex: Vertex) => {
      if (!isScoring || scoringResult === null) return
      const key = `${vertex[0]},${vertex[1]}`
      const currentSign = signMap[vertex[1]]?.[vertex[0]]
      if (currentSign === 0) return

      setManualOverrides((prev: globalThis.Map<string, 'dead' | 'alive'>) => {
        const next = new globalThis.Map(prev)
        const current = next.get(key)
        const engineDead = scoringResult.dead.some(
          (v) => v[0] === vertex[0] && v[1] === vertex[1],
        )
        if (current === 'dead') {
          next.set(key, 'alive')
        } else if (current === 'alive') {
          next.delete(key)
        } else {
          next.set(key, engineDead ? 'alive' : 'dead')
        }
        return next
      })
    },
    [isScoring, scoringResult, signMap],
  )

  // Recompute the score as manual dead/alive overrides change.
  useEffect(() => {
    if (scoringResult === null) return
    const effective = effectiveDeadStones
    const score = computeScore(signMap, effective, scoringResult.komi)
    setComputedScore(score)
  }, [effectiveDeadStones, scoringResult, signMap])

  const handleAcceptScore = useCallback(() => {
    setIsScoring(false)
    setScoringResult(null)
    setManualOverrides(new Map())
    setComputedScore(null)
  }, [])

  const handleCancelScore = useCallback(() => {
    setIsScoring(false)
    setScoringResult(null)
    setManualOverrides(new Map())
    setComputedScore(null)
  }, [])

  return {
    isScoring,
    scoringResult,
    effectiveDeadStones,
    computedScore,
    handleScore,
    handleToggleDead,
    handleAcceptScore,
    handleCancelScore,
  }
}
