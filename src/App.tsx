/*
 * badukdojang - T6: Control Bar Integration + T7: AI Game Mode
 * ControlBar (above board) + Shudan Goban rendering + go-board game logic.
 * Clicking an empty intersection places a stone. Illegal moves flash red border.
 * AI mode: after human plays, engine auto-generates a response.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { SignMap } from '@sabaki/go-board'
import type { Map, Marker, Vertex } from '@sabaki/shudan'
import { Board, type ThemeName } from './components/Board.tsx'
import { ControlBar, type BoardSize } from './components/ControlBar.tsx'
import {
  EngineSettings,
  loadSettings,
  normalizeSettings,
} from './components/EngineSettings.tsx'
import type { EngineSettings as EngineSettingsType } from './components/EngineSettings.tsx'
import { AnalysisPanel } from './components/AnalysisPanel.tsx'
import { CandidateMoves, type CandidateMove } from './components/CandidateMoves.tsx'
import { ScoringModal } from './components/ScoringModal.tsx'
import type { AnalyzeResponse } from './lib/engine/types.ts'
import { createGameState } from './lib/gameState.ts'
import type { GameState } from './lib/gameState.ts'
import { getMoveList } from './lib/gameTree.ts'
import type { ScoringResult, ComputedScore } from './lib/scoring.ts'
import { computeScore } from './lib/scoring.ts'
import {
  downloadSGF,
  getBoardSizeFromTree,
  loadSGFFile,
} from './lib/sgfIo.ts'
import {
  playStoneSound,
  playCaptureSound,
  setSoundEnabled,
  isSoundEnabled,
} from './lib/sound.ts'
import * as katagoAdapter from './lib/engine/katagoAdapter.ts'
import { EngineError } from './lib/engine/types.ts'
import type { EngineSettings as EngineEngineSettings } from './lib/engine/types.ts'

export type GameMode = 'selfplay' | 'ai'

export function App() {
  const [boardSize, setBoardSize] = useState<BoardSize>(19)
  const [gameState, setGameState] = useState(() => createGameState(19))
  const [signMap, setSignMap] = useState<SignMap>(() => gameState.getSignMap())
  const [flashTrigger, setFlashTrigger] = useState(0)
  const [showCoordinates, setShowCoordinates] = useState(true)
  const [themeName, setThemeName] = useState<ThemeName>('shinkaya')
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled())
  const [engineSettings, setEngineSettings] = useState<EngineSettingsType>(() =>
    normalizeSettings(loadSettings()),
  )
  const [gameMode, setGameMode] = useState<GameMode>('selfplay')
  const [isAiThinking, setIsAiThinking] = useState(false)
  const isAiThinkingRef = useRef(false)
  const gameGenerationRef = useRef(0)
  const [aiGhostVertex, setAiGhostVertex] = useState<Vertex | null>(null)
  const [aiFlashVertex, setAiFlashVertex] = useState<Vertex | null>(null)
  const [ownership, setOwnership] = useState<readonly number[] | null>(null)
  const [showOwnership, setShowOwnership] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const [winrateAnalysis, setWinrateAnalysis] = useState<AnalyzeResponse | null>(null)
  const [winrateLoading, setWinrateLoading] = useState(false)
  const [winrateError, setWinrateError] = useState<string | null>(null)
  const winrateReqRef = useRef(0)
  const [engineError, setEngineError] = useState<EngineError | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)

  const [isScoring, setIsScoring] = useState(false)
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null)
  const [manualOverrides, setManualOverrides] = useState(new Map<string, 'dead' | 'alive'>())
  const [computedScore, setComputedScore] = useState<ComputedScore | null>(null)
  const [humanModelAvailable, setHumanModelAvailable] = useState<boolean | null>(null)
  const engineInitializedRef = useRef(false)
  const [moveVersion, setMoveVersion] = useState(0)
  const [analysisEnabled, setAnalysisEnabled] = useState(true)

  // Re-initialize game state whenever the size changes.
  useEffect(() => {
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
    setOwnership(null)
  }, [boardSize])

  useEffect(() => {
    setOwnership(null)
  }, [signMap])

  // Auto-dismiss toast after 3 seconds.
  useEffect(() => {
    if (toast === null) return
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3000)
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [toast])

  const showToast = useCallback((message: string) => {
    setToast(message)
  }, [])

  const canScore = useMemo(() => {
    return getMoveList(gameState.gameTree).length >= 2
  }, [gameState.gameTree, moveVersion])

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

  const scoringMarkerMap = useMemo<Map<Marker | null> | undefined>(() => {
    if (!isScoring || effectiveDeadStones.length === 0) return undefined
    const map: Map<Marker | null> = signMap.map((row) => row.map(() => null))
    for (const [x, y] of effectiveDeadStones) {
      const row = map[y]
      if (row !== undefined && x >= 0 && x < row.length) {
        row[x] = { type: 'cross' }
      }
    }
    return map
  }, [signMap, isScoring, effectiveDeadStones])

  // Build markerMap: a 2D array (indexed [y][x]) with a single 'point'
  // marker at the last-move position, null everywhere else.
  const markerMap = useMemo<Map<Marker | null> | undefined>(() => {
    if (gameState.lastMove === null) return undefined
    const [lx, ly] = gameState.lastMove
    const map: Map<Marker | null> = signMap.map((row) =>
      row.map(() => null),
    )
    const row = map[ly]
    if (row !== undefined) {
      row[lx] = { type: 'circle' }
    }
    return map
  }, [signMap, gameState.lastMove])

  const combinedMarkerMap = useMemo<Map<Marker | null> | undefined>(() => {
    if (scoringMarkerMap === undefined && markerMap === undefined) return undefined
    const map: Map<Marker | null> = signMap.map((row) => row.map(() => null))
    if (markerMap !== undefined) {
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y]!.length; x++) {
          const m = markerMap[y]?.[x]
          if (m !== undefined && m !== null) {
            map[y]![x] = m
          }
        }
      }
    }
    if (scoringMarkerMap !== undefined) {
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y]!.length; x++) {
          const m = scoringMarkerMap[y]?.[x]
          if (m !== undefined && m !== null) {
            map[y]![x] = m
          }
        }
      }
    }
    return map
  }, [signMap, markerMap, scoringMarkerMap])

  // Derive top-3 candidate moves from the latest analysis response.
  // Only shown in self-play mode (study/hint); hidden in AI mode and
  // while the AI is thinking. 'resign' moves are filtered out.
  const candidates = useMemo<CandidateMove[]>(() => {
    if (gameMode !== 'selfplay') return []
    if (winrateAnalysis === null) return []
    const bestMoves = winrateAnalysis.bestMoves
    if (bestMoves === undefined) return []

    const result: CandidateMove[] = []
    for (const bm of bestMoves) {
      if (result.length >= 3) break
      if (bm.move === 'resign') continue
      let parsed: Vertex | 'pass' | 'resign'
      try {
        parsed = katagoAdapter.parseGTPVertex(bm.move, boardSize)
      } catch {
        continue
      }
      if (parsed === 'resign') continue
      result.push({
        vertex: parsed,
        winrate: bm.winrate,
        scoreLead: bm.scoreLead,
        pv: bm.pv ?? [],
      })
    }
    return result
  }, [winrateAnalysis, gameMode])

  const candidateVertices = useMemo<Vertex[]>(
    () =>
      candidates
        .map((c) => (c.vertex === 'pass' ? null : c.vertex))
        .filter((v): v is Vertex => v !== null),
    [candidates],
  )

  /**
   * Apply a move (vertex or pass) to the game state, update the sign map,
   * and play sounds. Mirrors the existing human handleVertexClick flow.
   */
  const applyMove = useCallback(
    (move: Vertex | 'pass', gs: GameState = gameState): boolean => {
      const oldCaptures =
        gs.board.getCaptures(1) + gs.board.getCaptures(-1)
      let success: boolean
      if (move === 'pass') {
        gs.pass()
        success = true
      } else {
        success = gs.makeMove(move)
      }
      if (!success) {
        setFlashTrigger((prev) => prev + 1)
        return false
      }
      const newCaptures =
        gs.board.getCaptures(1) + gs.board.getCaptures(-1)
      if (newCaptures > oldCaptures) {
        playCaptureSound(newCaptures - oldCaptures)
      } else {
        playStoneSound()
      }
      setSignMap(gs.getSignMap())
      setMoveVersion((v) => v + 1)
      return true
    },
    [gameState],
  )

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
      boardSize,
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
      boardSize,
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
        if (err instanceof EngineError) {
          setEngineError(err)
        }
      })
  }, [engineSettings.thinkingTime, engineSettings.enabled])

  useEffect(() => {
    if (
      engineSettings.playStyle === 'human' &&
      humanModelAvailable === false
    ) {
      showToast('Human-SL 모델이 설정되지 않았습니다.')
    }
  }, [engineSettings.playStyle, humanModelAvailable, showToast])

  // Race-guarded: only the latest fetch's result is applied.
  // Cancels in-flight request on re-fire to prevent bridge-side
  // concurrency on the single katago analysis process stdout.
  useEffect(() => {
    if (!engineSettings.enabled || !analysisEnabled) {
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
          ANALYSIS_TIMEOUT,
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
  }, [signMap, engineSettings.enabled, analysisEnabled, gameState, getLightAnalysisSettings])

  const triggerAiMove = useCallback(async () => {
    if (isAiThinkingRef.current) return
    if (!engineSettings.enabled) {
      showToast('엔진이 꺼져 있습니다.')
      return
    }
    isAiThinkingRef.current = true
    setIsAiThinking(true)
    const generation = gameGenerationRef.current

    try {
      const response = await katagoAdapter.requestMove(
        gameState.gameTree,
        gameState.currentPlayer,
        getAnalysisSettings(),
      )

      if (generation !== gameGenerationRef.current) return

      if (response === 'resign') {
        showToast('AI 항복')
      } else if (response === 'pass') {
        gameState.pass()
        setSignMap(gameState.getSignMap())
        playStoneSound()
      } else {
        const oldCaptures =
          gameState.board.getCaptures(1) + gameState.board.getCaptures(-1)
        const success = gameState.makeMove(response)
        if (!success) {
          console.error('AI returned invalid move:', response)
          showToast('AI 오류')
        } else {
          const newCaptures =
            gameState.board.getCaptures(1) + gameState.board.getCaptures(-1)
          if (newCaptures > oldCaptures) {
            playCaptureSound(newCaptures - oldCaptures)
          } else {
            playStoneSound()
          }
          setSignMap(gameState.getSignMap())
          setAiFlashVertex(response)
        }
      }
    } catch (error) {
      if (generation !== gameGenerationRef.current) return
      if (error instanceof EngineError) {
        setEngineError(error)
        if (error.code === 'INVALID_RESPONSE') {
          console.error('AI returned invalid move:', error.message)
          showToast('AI 오류')
        } else {
          showToast(
            '엔진 오류: ' + error.message,
          )
        }
      } else {
        showToast(
          'Engine error: ' +
            (error instanceof Error ? error.message : String(error)),
        )
      }
    } finally {
      if (generation === gameGenerationRef.current) {
        isAiThinkingRef.current = false
        setIsAiThinking(false)
        setAiGhostVertex(null)
      }
    }
  }, [gameState, showToast, getAnalysisSettings, engineSettings.enabled])

  const handleVertexClick = (_evt: MouseEvent, vertex: Vertex) => {
    if (isAiThinkingRef.current) return
    if (isScoring) {
      handleToggleDead(vertex)
      return
    }
    const success = applyMove(vertex)
    if (!success) return
    if (gameMode === 'ai') {
      void triggerAiMove()
    }
  }

  const handleSelectCandidate = (vertex: Vertex | 'pass') => {
    if (isAiThinkingRef.current) return
    if (gameMode !== 'selfplay') return
    applyMove(vertex)
  }

  const handleNewGame = () => {
    if (isAiThinkingRef.current) {
      void katagoAdapter.abortOngoing().catch(() => {})
    }
    isAiThinkingRef.current = false
    setIsAiThinking(false)
    setAiGhostVertex(null)
    setAiFlashVertex(null)
    setOwnership(null)
    gameGenerationRef.current += 1
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
  }

  const handlePass = () => {
    if (isAiThinkingRef.current) return
    gameState.pass()
    setSignMap(gameState.getSignMap())
    setMoveVersion((v) => v + 1)
    if (gameMode === 'ai') {
      void triggerAiMove()
    }
  }

  const handleUndo = () => {
    if (isAiThinkingRef.current) return
    const success = gameState.undo()
    if (success) {
      setSignMap(gameState.getSignMap())
      setMoveVersion((v) => v + 1)
    }
  }

  const handleRedo = () => {
    if (isAiThinkingRef.current) return
    const success = gameState.redo()
    if (success) {
      setSignMap(gameState.getSignMap())
      setMoveVersion((v) => v + 1)
    }
  }

  const handleSaveSGF = () => {
    const filename = `game-${Date.now()}.sgf`
    downloadSGF(gameState.gameTree, filename, boardSize)
  }

  const handleFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      const loadedTree = await loadSGFFile(file)
      const loadedSize = getBoardSizeFromTree(loadedTree)
      const validSize: BoardSize = [9, 13, 19].includes(loadedSize)
        ? (loadedSize as BoardSize)
        : 19

      if (validSize !== boardSize) {
        setBoardSize(validSize)
      }

      const newGameState = createGameState(validSize, loadedTree)
      setGameState(newGameState)
      setSignMap(newGameState.getSignMap())
    } catch (error) {
      console.error('Failed to load SGF:', error)
    } finally {
      input.value = ''
    }
  }

  const handleToggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    setSoundEnabledState(next)
  }

  const handleGameModeChange = (mode: GameMode) => {
    if (mode === gameMode) return
    if (isAiThinkingRef.current) {
      void katagoAdapter.abortOngoing().catch(() => {})
    }
    isAiThinkingRef.current = false
    setIsAiThinking(false)
    setAiGhostVertex(null)
    setAiFlashVertex(null)
    const moveCount = getMoveList(gameState.gameTree).length
    if (moveCount > 0) {
      const confirmed = window.confirm(
        '게임을 변경하면 현재 진행 중인 대국이 초기화됩니다. 계속하시겠습니까?',
      )
      if (!confirmed) return
      handleNewGame()
    }
    setGameMode(mode)
    if (mode === 'ai' && !engineSettings.enabled) {
      showToast('엔진이 꺼져 있습니다. AI 대국을 위해 엔진을 켜주세요.')
    }
  }

  const handleAiMove = () => {
    if (gameMode !== 'ai' || isAiThinkingRef.current) return
    void triggerAiMove()
  }

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
  }, [canScore, gameState.gameTree, getAnalysisSettings, signMap, showToast])

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

  return (
    <div
      id="app-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '100svh',
        padding: '1rem',
        gap: '1rem',
      }}
    >
      <ControlBar
        gameState={gameState}
        boardSize={boardSize}
        onBoardSizeChange={setBoardSize}
        onNewGame={handleNewGame}
        onPass={handlePass}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveSGF={handleSaveSGF}
        onFileChange={handleFileChange}
        showCoordinates={showCoordinates}
        onToggleCoordinates={() => setShowCoordinates((prev) => !prev)}
        themeName={themeName}
        onThemeChange={setThemeName}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        gameMode={gameMode}
        onGameModeChange={handleGameModeChange}
        isAiThinking={isAiThinking}
        onAiMove={handleAiMove}
        showOwnership={showOwnership}
        hasOwnership={ownership !== null}
        onToggleOwnership={() => setShowOwnership((prev) => !prev)}
        onScore={handleScore}
        canScore={canScore}
        isScoring={isScoring}
        analysisEnabled={analysisEnabled}
        onToggleAnalysis={() => setAnalysisEnabled((prev) => !prev)}
      />
      <EngineSettings
        settings={engineSettings}
        onChange={setEngineSettings}
        humanModelAvailable={humanModelAvailable}
      />
      <Board
        signMap={signMap}
        boardSize={boardSize}
        markerMap={combinedMarkerMap}
        onVertexClick={handleVertexClick}
        flashTrigger={flashTrigger}
        showCoordinates={showCoordinates}
        themeName={themeName}
        currentPlayer={gameState.currentPlayer}
        aiGhostVertex={aiGhostVertex}
        aiFlashVertex={aiFlashVertex}
        ownership={ownership}
        showOwnership={showOwnership}
        candidateMoves={candidateVertices}
      />
      <AnalysisPanel
        analysis={winrateAnalysis}
        loading={winrateLoading}
        error={winrateError}
        engineEnabled={engineSettings.enabled}
      />
      {gameMode === 'selfplay' && (
        <CandidateMoves
          candidates={candidates}
          onSelectMove={handleSelectCandidate}
          disabled={isAiThinking}
        />
      )}
      {computedScore !== null && (
        <ScoringModal
          score={computedScore}
          onAccept={handleAcceptScore}
          onCancel={handleCancelScore}
        />
      )}
      {/* Toast notification */}
      {toast !== null && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2a2a4e',
            color: '#e0e0e0',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid #3b3b5c',
          }}
        >
          {toast}
        </div>
      )}

      {engineError !== null && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: '#1e1e2e',
              color: '#e0e0e0',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              border: '1px solid #3b3b5c',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>
              엔진 오류
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.5 }}>
              {engineError.code === 'ENGINE_OFFLINE'
                ? '엔진 연결 실패'
                : engineError.code === 'TIMEOUT'
                  ? '엔진 응답 시간 초과'
                  : '엔진 응답 오류'}
              <br />
              <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
                {engineError.message}
              </span>
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEngineError(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #3b3b5c',
                  background: 'transparent',
                  color: '#e0e0e0',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                닫기
              </button>
              <button
                onClick={handleRestartEngine}
                disabled={isRestarting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#4a9eff',
                  color: '#fff',
                  cursor: isRestarting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: isRestarting ? 0.6 : 1,
                }}
              >
                {isRestarting ? '재시작 중...' : '재시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
