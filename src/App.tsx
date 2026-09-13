/*
 * badukdojang — game screen composition.
 *
 * Layout (OGS-inspired): top bar + two columns — board & playback bar in
 * the center, core game controls in the sidebar. Non-core configuration
 * (engine tuning, board theme) lives in SettingsModal; per-game setup
 * (size, mode, difficulty) in NewGameModal. Zen mode hides everything
 * but the board.
 *
 * Game flow state lives here; engine lifecycle in useEngine, analysis
 * polling in useAnalysis, scoring flow in useScoring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SignMap, Vertex } from '@kaya/goboard'
import type { BoardMap, Marker } from '@kaya/shudan'
import { BoardThemeProvider } from '@kaya/themes'
import { Board } from './components/Board.tsx'
import { TopBar } from './components/TopBar.tsx'
import { GameSidebar } from './components/GameSidebar.tsx'
import { PlaybackBar } from './components/PlaybackBar.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import { NewGameModal } from './components/NewGameModal.tsx'
import type { NewGameConfig } from './components/NewGameModal.tsx'
import { Toast } from './components/Toast.tsx'
import { EngineErrorModal } from './components/EngineErrorModal.tsx'
import { ScoringModal } from './components/ScoringModal.tsx'
import type { CandidateMove } from './components/CandidateMoves.tsx'
import { useEngine } from './hooks/useEngine.ts'
import { useAnalysis } from './hooks/useAnalysis.ts'
import { useScoring } from './hooks/useScoring.ts'
import type { BoardSize, GameMode } from './lib/types.ts'
import { createGameState } from './lib/gameState.ts'
import type { GameState } from './lib/gameState.ts'
import { getMoveList } from './lib/gameTree.ts'
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
import { applyDifficulty, applyPlayStyle } from './lib/engineSettings.ts'
import * as katagoAdapter from './lib/engine/katagoAdapter.ts'
import { EngineError } from './lib/engine/types.ts'

export function App() {
  // --- Game state -----------------------------------------------------------
  const [boardSize, setBoardSize] = useState<BoardSize>(19)
  const [gameState, setGameState] = useState<GameState>(() => createGameState(19))
  const [signMap, setSignMap] = useState<SignMap>(() => gameState.getSignMap())
  const [flashTrigger, setFlashTrigger] = useState(0)
  const [moveVersion, setMoveVersion] = useState(0)

  // --- View state -----------------------------------------------------------
  const [showCoordinates, setShowCoordinates] = useState(true)
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled())
  const [showOwnership, setShowOwnership] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  // --- AI game mode ---------------------------------------------------------
  const [gameMode, setGameMode] = useState<GameMode>('selfplay')
  const [isAiThinking, setIsAiThinking] = useState(false)
  const isAiThinkingRef = useRef(false)
  const gameGenerationRef = useRef(0)
  const [aiGhostVertex, setAiGhostVertex] = useState<Vertex | null>(null)
  const [aiFlashVertex, setAiFlashVertex] = useState<Vertex | null>(null)

  // --- Toast ----------------------------------------------------------------
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  // --- Engine (settings + lifecycle) ----------------------------------------
  const showToast = useCallback((message: string) => {
    setToast(message)
  }, [])

  const {
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
  } = useEngine({ boardSize, showToast })

  // --- Analysis polling -----------------------------------------------------
  const {
    winrateAnalysis,
    winrateLoading,
    winrateError,
    ownership,
  } = useAnalysis({
    engineEnabled: engineSettings.enabled,
    enabled: showOwnership,
    signMap,
    gameState,
    getLightAnalysisSettings,
    timeoutMs: ANALYSIS_TIMEOUT,
  })

  // --- Scoring flow ---------------------------------------------------------
  const canScore = useMemo(() => {
    return getMoveList(gameState.gameTree).length >= 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameTree, moveVersion])

  const {
    isScoring,
    effectiveDeadStones,
    computedScore,
    handleScore,
    handleToggleDead,
    handleAcceptScore,
    handleCancelScore,
  } = useScoring({
    signMap,
    gameState,
    canScore,
    isAiThinkingRef,
    getAnalysisSettings,
    showToast,
    setEngineError,
  })

  // Re-initialize game state whenever the size changes (SGF load path).
  useEffect(() => {
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
  }, [boardSize])

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

  // --- Marker maps (last-move circle + scoring crosses) ----------------------

  const scoringMarkerMap = useMemo<BoardMap<Marker | null> | undefined>(() => {
    if (!isScoring || effectiveDeadStones.length === 0) return undefined
    const map: BoardMap<Marker | null> = signMap.map((row) => row.map(() => null))
    for (const [x, y] of effectiveDeadStones) {
      const row = map[y]
      if (row !== undefined && x >= 0 && x < row.length) {
        row[x] = { type: 'cross' }
      }
    }
    return map
  }, [signMap, isScoring, effectiveDeadStones])

  const combinedMarkerMap = useMemo<BoardMap<Marker | null> | undefined>(() => {
    if (gameState.lastMove === null && scoringMarkerMap === undefined) {
      return undefined
    }
    const map: BoardMap<Marker | null> = signMap.map((row) =>
      row.map(() => null),
    )
    if (gameState.lastMove !== null) {
      const [lx, ly] = gameState.lastMove
      const row = map[ly]
      if (row !== undefined) {
        row[lx] = { type: 'circle' }
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
  }, [signMap, gameState.lastMove, scoringMarkerMap])

  // --- Candidates (self-play study hints) ------------------------------------

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
  }, [winrateAnalysis, gameMode, boardSize])

  const candidateVertices = useMemo<Vertex[]>(
    () =>
      candidates
        .map((c) => (c.vertex === 'pass' ? null : c.vertex))
        .filter((v): v is Vertex => v !== null),
    [candidates],
  )

  // --- Move application -------------------------------------------------------

  /**
   * Apply a move (vertex or pass) to the game state, update the sign map,
   * and play sounds.
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
        setMoveVersion((v) => v + 1)
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
          setMoveVersion((v) => v + 1)
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
  }, [gameState, showToast, getAnalysisSettings, engineSettings.enabled, setEngineError])

  const handleVertexClick = (_evt: React.MouseEvent, vertex: Vertex) => {
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

  // --- Game lifecycle ---------------------------------------------------------

  const abortAiAndReset = useCallback(() => {
    if (isAiThinkingRef.current) {
      void katagoAdapter.abortOngoing().catch(() => {})
    }
    isAiThinkingRef.current = false
    setIsAiThinking(false)
    setAiGhostVertex(null)
    setAiFlashVertex(null)
    gameGenerationRef.current += 1
  }, [])

  /** Hard reset to an empty board (keeps current size/mode). */
  const handleNewGame = useCallback(() => {
    abortAiAndReset()
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
    setMoveVersion((v) => v + 1)
  }, [abortAiAndReset, boardSize])

  /** New-game modal confirm: apply config, reset the board. */
  const handleStartNewGame = useCallback(
    (config: NewGameConfig) => {
      setEngineSettings((prev) =>
        applyPlayStyle(applyDifficulty(prev, config.difficulty), config.playStyle),
      )
      abortAiAndReset()
      const newGameState = createGameState(config.size)
      setGameState(newGameState)
      setSignMap(newGameState.getSignMap())
      setMoveVersion((v) => v + 1)
      setBoardSize(config.size)
      setGameMode(config.mode)
      if (config.mode === 'ai' && !engineSettings.enabled) {
        showToast('엔진이 꺼져 있습니다. AI 대국을 위해 엔진을 켜주세요.')
      }
      setNewGameOpen(false)
    },
    [abortAiAndReset, setEngineSettings, engineSettings.enabled, showToast],
  )

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

  const navigate = (fn: () => boolean) => {
    if (isAiThinkingRef.current) return
    if (fn()) {
      setSignMap(gameState.getSignMap())
      setMoveVersion((v) => v + 1)
    }
  }

  // --- SGF ---------------------------------------------------------------------

  const handleSaveSGF = () => {
    const filename = `game-${Date.now()}.sgf`
    downloadSGF(gameState.gameTree, filename, boardSize)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
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
      setMoveVersion((v) => v + 1)
    } catch (error) {
      console.error('Failed to load SGF:', error)
    } finally {
      input.value = ''
    }
  }

  // --- Top bar handlers ---------------------------------------------------------

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

  // --- Render --------------------------------------------------------------------

  return (
    <BoardThemeProvider>
      <div
        id="app-root"
        className={zenMode ? 'zen-mode' : undefined}
      >
        {!zenMode && (
          <TopBar
            gameMode={gameMode}
            onGameModeChange={handleGameModeChange}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
            onToggleZen={() => setZenMode(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {zenMode && (
          <button
            type="button"
            id="zen-exit"
            onClick={() => setZenMode(false)}
            aria-label="집중 모드 끄기"
            title="집중 모드 끄기"
          >
            ✕
          </button>
        )}

        <div className="game-layout">
          <div className="board-col">
            <Board
              signMap={signMap}
              boardSize={boardSize}
              markerMap={combinedMarkerMap}
              onVertexClick={handleVertexClick}
              flashTrigger={flashTrigger}
              showCoordinates={showCoordinates}
              currentPlayer={gameState.currentPlayer}
              aiGhostVertex={aiGhostVertex}
              aiFlashVertex={aiFlashVertex}
              ownership={ownership}
              showOwnership={showOwnership}
              candidateMoves={candidateVertices}
              dimmedVertices={isScoring ? effectiveDeadStones : undefined}
            />
            {!zenMode && (
              <PlaybackBar
                gameState={gameState}
                moveVersion={moveVersion}
                onFirst={() => navigate(() => gameState.jumpToStart())}
                onPrev={() => navigate(() => gameState.undo())}
                onNext={() => navigate(() => gameState.redo())}
                onLast={() => navigate(() => gameState.jumpToEnd())}
              />
            )}
          </div>

          {!zenMode && (
            <GameSidebar
              gameState={gameState}
              moveVersion={moveVersion}
              gameMode={gameMode}
              isAiThinking={isAiThinking}
              onAiMove={handleAiMove}
              onPass={handlePass}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onNewGameRequest={() => setNewGameOpen(true)}
              canScore={canScore}
              isScoring={isScoring}
              onScore={handleScore}
              onSaveSGF={handleSaveSGF}
              onFileChange={handleFileChange}
              showOwnership={showOwnership}
              onToggleOwnership={() => setShowOwnership((prev) => !prev)}
              analysis={winrateAnalysis}
              analysisLoading={winrateLoading}
              analysisError={winrateError}
              engineEnabled={engineSettings.enabled}
              candidates={candidates}
              onSelectCandidate={handleSelectCandidate}
            />
          )}
        </div>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          engineSettings={engineSettings}
          onEngineSettingsChange={setEngineSettings}
          humanModelAvailable={humanModelAvailable}
          showCoordinates={showCoordinates}
          onToggleCoordinates={() => setShowCoordinates((prev) => !prev)}
        />

        <NewGameModal
          open={newGameOpen}
          onClose={() => setNewGameOpen(false)}
          boardSize={boardSize}
          gameMode={gameMode}
          engineEnabled={engineSettings.enabled}
          difficulty={engineSettings.difficulty}
          playStyle={engineSettings.playStyle}
          onStart={handleStartNewGame}
        />

        {computedScore !== null && (
          <ScoringModal
            score={computedScore}
            onAccept={handleAcceptScore}
            onCancel={handleCancelScore}
          />
        )}

        {toast !== null && <Toast message={toast} />}

        {engineError !== null && (
          <EngineErrorModal
            error={engineError}
            isRestarting={isRestarting}
            onRestart={handleRestartEngine}
            onDismiss={() => setEngineError(null)}
          />
        )}
      </div>
    </BoardThemeProvider>
  )
}
