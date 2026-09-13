/*
 * useEngine — engine settings state + KataGo lifecycle management.
 * Owns: settings persistence, engine initialization, live parameter
 * sync (rules, visits, temperature, ...), health status, restart.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../lib/engineSettings.ts'
import type { EngineSettings } from '../lib/engineSettings.ts'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import { EngineError } from '../lib/engine/types.ts'
import type { EngineSettings as EngineEngineSettings } from '../lib/engine/types.ts'

interface UseEngineOptions {
  boardSize: number
  showToast: (message: string) => void
}

export function useEngine({ boardSize, showToast }: UseEngineOptions) {
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(() =>
    normalizeSettings(loadSettings()),
  )
  const [humanModelAvailable, setHumanModelAvailable] = useState<boolean | null>(null)
  const [engineError, setEngineError] = useState<EngineError | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const engineInitializedRef = useRef(false)

  // Persist to localStorage whenever settings change.
  useEffect(() => {
    saveSettings(engineSettings)
  }, [engineSettings])

  const getAnalysisSettings = useCallback((): EngineEngineSettings => {
    return {
      maxTime: engineSettings.thinkingTime,
      maxVisits: engineSettings.maxVisits,
      numSearchThreads: 2,
      rules: engineSettings.rules,
      komi: engineSettings.rules === 'chinese' ? 7.5 : 6.5,
      humanSLProfile: engineSettings.humanSLProfile,
      chosenMoveTemperature: engineSettings.chosenMoveTemperature,
      wideRootNoise: engineSettings.wideRootNoise,
      playoutDoublingAdvantage: engineSettings.playoutDoublingAdvantage,
      humanSLChosenMoveProp: engineSettings.humanSLChosenMoveProp,
      humanMoveMode: engineSettings.humanMoveMode,
      boardSize,
      difficulty: engineSettings.difficulty,
      playStyle: engineSettings.playStyle,
    }
  }, [engineSettings, boardSize])

  const ANALYSIS_TIMEOUT = 15000
  const LIGHT_MAX_VISITS = 5
  const LIGHT_MAX_TIME = 1
  const getLightAnalysisSettings = useCallback((): EngineEngineSettings => {
    return {
      maxTime: LIGHT_MAX_TIME,
      maxVisits: LIGHT_MAX_VISITS,
      numSearchThreads: 2,
      rules: engineSettings.rules,
      komi: engineSettings.rules === 'chinese' ? 7.5 : 6.5,
      humanSLProfile: engineSettings.humanSLProfile,
      chosenMoveTemperature: engineSettings.chosenMoveTemperature,
      wideRootNoise: engineSettings.wideRootNoise,
      playoutDoublingAdvantage: engineSettings.playoutDoublingAdvantage,
      humanSLChosenMoveProp: engineSettings.humanSLChosenMoveProp,
      humanMoveMode: engineSettings.humanMoveMode,
      boardSize,
      difficulty: engineSettings.difficulty,
      playStyle: engineSettings.playStyle,
    }
  }, [engineSettings, boardSize])

  const handleRestartEngine = useCallback(async () => {
    if (isRestarting) return
    setIsRestarting(true)
    try {
      await katagoAdapter.restartEngine(getAnalysisSettings())
      setEngineError(null)
      showToast('엔진이 재시작되었습니다.')
    } catch (err) {
      showToast(
        '엔진 재시작 실패: ' +
          (err instanceof Error ? err.message : String(err)),
      )
    } finally {
      setIsRestarting(false)
    }
  }, [isRestarting, getAnalysisSettings, showToast])

  // Initial health check + engine bootstrap (mount only).
  useEffect(() => {
    void (async () => {
      try {
        const health = await katagoAdapter.checkHealth()
        setHumanModelAvailable(health.humanModelAvailable ?? false)
        if (engineSettings.enabled && health.status === 'ok') {
          await katagoAdapter.initializeEngine(getAnalysisSettings())
          engineInitializedRef.current = true
        }
      } catch (err) {
        console.error('Engine health check failed:', err)
        setHumanModelAvailable(false)
        if (err instanceof EngineError) {
          setEngineError(err)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initialize the engine when it gets enabled after mount.
  useEffect(() => {
    if (!engineSettings.enabled) {
      engineInitializedRef.current = false
      return
    }
    if (engineInitializedRef.current) return
    void katagoAdapter.initializeEngine(getAnalysisSettings()).catch((err) => {
      console.error('Engine initialization failed:', err)
      if (err instanceof EngineError) {
        setEngineError(err)
      }
    })
    engineInitializedRef.current = true
  }, [engineSettings.enabled, getAnalysisSettings])

  // Live parameter sync — pushed to the running engine on change.
  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    void katagoAdapter.setEngineRules(engineSettings.rules).catch((err) => {
      console.error('Failed to set engine rules:', err)
      if (err instanceof EngineError) {
        setEngineError(err)
      }
    })
  }, [engineSettings.rules, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    if (engineSettings.playStyle !== 'human') return
    if (engineSettings.humanSLProfile === undefined) return
    void katagoAdapter
      .setEngineParam('humanSLProfile', engineSettings.humanSLProfile)
      .catch((err) => {
        console.error('Failed to set humanSLProfile:', err)
        if (err instanceof EngineError) {
          setEngineError(err)
        }
      })
  }, [engineSettings.humanSLProfile, engineSettings.playStyle, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    void katagoAdapter
      .setEngineParam('chosenMoveTemperature', engineSettings.chosenMoveTemperature)
      .catch((err) => {
        console.error('Failed to set chosenMoveTemperature:', err)
      })
  }, [engineSettings.chosenMoveTemperature, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    void katagoAdapter
      .setEngineParam('wideRootNoise', engineSettings.wideRootNoise)
      .catch((err) => {
        console.error('Failed to set wideRootNoise:', err)
      })
  }, [engineSettings.wideRootNoise, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    void katagoAdapter
      .setEngineParam('maxVisits', engineSettings.maxVisits)
      .catch((err) => {
        console.error('Failed to set maxVisits:', err)
        if (err instanceof EngineError) {
          setEngineError(err)
        }
      })
  }, [engineSettings.maxVisits, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    void katagoAdapter
      .setEngineParam('maxTime', engineSettings.thinkingTime)
      .catch((err) => {
        console.error('Failed to set maxTime:', err)
      })
  }, [engineSettings.thinkingTime, engineSettings.enabled])

  useEffect(() => {
    if (!engineSettings.enabled || !engineInitializedRef.current) return
    if (engineSettings.playStyle !== 'human') return
    void katagoAdapter
      .setEngineParam('humanSLChosenMoveProp', engineSettings.humanSLChosenMoveProp)
      .catch((err) => {
        console.error('Failed to set humanSLChosenMoveProp:', err)
      })
  }, [engineSettings.humanSLChosenMoveProp, engineSettings.playStyle, engineSettings.enabled])

  useEffect(() => {
    if (
      engineSettings.playStyle === 'human' &&
      humanModelAvailable === false
    ) {
      showToast('Human-SL 모델이 설정되지 않았습니다.')
    }
  }, [engineSettings.playStyle, humanModelAvailable, showToast])

  return {
    engineSettings,
    setEngineSettings,
    humanModelAvailable,
    engineError,
    setEngineError,
    isRestarting,
    handleRestartEngine,
    getAnalysisSettings,
    getLightAnalysisSettings,
    ANALYSIS_TIMEOUT,
  }
}
