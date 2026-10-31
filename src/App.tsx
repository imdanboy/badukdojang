/*
 * badukdojang — game screen composition.
 *
 * Layout (OGS-inspired): top bar + three columns — a reserved left rail
 * (board-aligned winrate meter), the board as the dominant center column,
 * and the right column with playback controls + core game controls
 * (GameSidebar). Non-core configuration (engine tuning, board theme)
 * lives in SettingsModal; per-game setup (size, mode, difficulty) in
 * NewGameModal. Zen mode hides everything but the board.
 *
 * ONE-SCREEN shell: `#app-root` is exactly one dynamic viewport tall and
 * never scrolls at page level. The game-tree visualization (GameTreePanel)
 * is hidden by default and toggled from the ReviewPanel; while visible it
 * docks at the BOTTOM of the shell (.tree-dock) with a fixed pixel height,
 * so the .stage above flex-shrinks by exactly that amount and Board.tsx
 * re-measures the smaller slot — board and tree share the same viewport.
 * The dock is vertically resizable via a pointer/touch/keyboard separator
 * (.tree-resizer); the tree panel scrolls internally on both axes. The
 * tree is the ONE tree view in the app; the ReviewPanel keeps analysis
 * runs, 수-번호 buttons, and the winrate graph.
 *
 * Game flow state lives here; engine lifecycle in useEngine, analysis
 * polling in useAnalysis, scoring flow in useScoring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SignMap, Vertex } from '@kaya/goboard'
import type { BoardMap, Marker } from '@kaya/shudan'
import { BoardThemeProvider } from '@kaya/themes'
import { Board } from './components/Board.tsx'
import { AnalysisPanel } from './components/AnalysisPanel.tsx'
import { TopBar } from './components/TopBar.tsx'
import { GameSidebar } from './components/GameSidebar.tsx'
import { PlaybackBar } from './components/PlaybackBar.tsx'
import { ReviewPanel } from './components/ReviewPanel.tsx'
import { GameTreePanel } from './components/GameTreePanel.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import { NewGameModal } from './components/NewGameModal.tsx'
import type { NewGameConfig } from './components/NewGameModal.tsx'
import { ScreenshotImportModal } from './components/ScreenshotImportModal.tsx'
import { Toast } from './components/Toast.tsx'
import { EngineErrorModal } from './components/EngineErrorModal.tsx'
import { ScoringModal } from './components/ScoringModal.tsx'
import type { CandidateMove } from './components/CandidateMoves.tsx'
import type { AiMoveStats } from './components/AiAnalysisPanel.tsx'
import { useEngine } from './hooks/useEngine.ts'
import { useAnalysis } from './hooks/useAnalysis.ts'
import { useTreeAnalysis } from './hooks/useTreeAnalysis.ts'
import { useScoring } from './hooks/useScoring.ts'
import type { BoardSize, GameMode, MoveNumberMode } from './lib/types.ts'
import { createGameState } from './lib/gameState.ts'
import type { GameState } from './lib/gameState.ts'
import { getMoveList, getMoveNumberMap } from './lib/gameTree.ts'
import { buildWinratePoints } from './lib/treeLayout.ts'
import type { WinratePoint } from './lib/treeLayout.ts'
import {
  downloadSGF,
  getBoardSizeFromTree,
  getAnalysisMetadataFromTree,
  loadSGFFile,
  sgfToTree,
} from './lib/sgfIo.ts'
import type { SgfAnalysisEmbed, SgfAnalysisEntry } from './lib/sgfIo.ts'
import { withPlayerToPlay } from './lib/screenshotRecognition.ts'
import type { AnalysisMetadata } from './lib/analysisSgf.ts'
import {
  playStoneSound,
  playCaptureSound,
  setSoundEnabled,
  isSoundEnabled,
} from './lib/sound.ts'
import { applyDifficulty, applyPlayStyle } from './lib/engineSettings.ts'
import {
  clearActiveGame,
  isBlankGame,
  restoreActiveGame,
  saveActiveGame,
} from './lib/autosave.ts'
import * as katagoAdapter from './lib/engine/katagoAdapter.ts'
import { EngineError } from './lib/engine/types.ts'

// --- One-screen tree dock sizing ---------------------------------------------
// The dock is a fixed-pixel bottom region; the stage above flex-shrinks by
// the same amount (flex: 1 1 auto + min-height: 0), so board and tree always
// share one viewport without page-level scroll. Bounds keep a useful board
// even on short viewports; window.innerHeight (dynamic viewport height, incl.
// mobile URL-bar changes) is read at drag time and re-clamped on resize.
const TREE_DOCK_MIN = 120
// Desktop: top bar + a minimal usable board slot + paddings/gaps.
const MIN_STAGE_RESERVE_DESKTOP = 300
// Below the 1024px breakpoint the controls stack UNDER the board and keep a
// scrollable floor of their own, so the stage reserve grows accordingly.
const MIN_STAGE_RESERVE_STACKED = 440

function minTreeDockHeight(): number {
  // Very short viewports (e.g. landscape phones) may lower the floor so the
  // dock can stay open without starving the board entirely.
  return Math.min(TREE_DOCK_MIN, Math.round(window.innerHeight * 0.25))
}

function stageReserve(): number {
  return window.innerWidth < 1024
    ? MIN_STAGE_RESERVE_STACKED
    : MIN_STAGE_RESERVE_DESKTOP
}

function maxTreeDockHeight(): number {
  return Math.max(minTreeDockHeight(), window.innerHeight - stageReserve())
}

function clampTreeDockHeight(height: number): number {
  return Math.round(Math.min(Math.max(height, minTreeDockHeight()), maxTreeDockHeight()))
}

export function App() {
  // --- Game state -----------------------------------------------------------
  // Boot restores the active-game recovery draft synchronously (sleep/tab
  // reload keeps the game). The useState initializers run once during the
  // first render, so the first autosave effect already sees the restored
  // game and can never overwrite a valid draft with a blank board.
  const [boot] = useState(() => restoreActiveGame())
  const [boardSize, setBoardSize] = useState<BoardSize>(boot?.boardSize ?? 19)
  const [gameState, setGameState] = useState<GameState>(() =>
    boot?.gameState ?? createGameState(19),
  )
  const [signMap, setSignMap] = useState<SignMap>(() => gameState.getSignMap())
  const [flashTrigger, setFlashTrigger] = useState(0)
  const [moveVersion, setMoveVersion] = useState(0)

  // --- View state -----------------------------------------------------------
  const [showCoordinates, setShowCoordinates] = useState(true)
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled())
  // Analysis display toggles — independent UI layers fed by ONE shared
  // analysis response (rootInfo.winrate, moveInfos, ownership). Any of
  // them being on gates the engine fetch (compute runs once).
  const [showWinrate, setShowWinrate] = useState(false)
  const [showCandidates, setShowCandidates] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showOwnership, setShowOwnership] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const [showAiAnalysis, setShowAiAnalysis] = useState(false)
  const [aiMoveStats, setAiMoveStats] = useState<AiMoveStats | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [screenshotImportOpen, setScreenshotImportOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  // --- Game-tree dock (one-screen layout) ------------------------------------
  // Hidden by default; toggled from the ReviewPanel. While visible it docks
  // at the bottom of the shell and the stage shrinks by its height, so the
  // tree fits the same viewport. The height is user-resizable (drag or
  // keyboard on .tree-resizer) and re-clamped when the viewport resizes.
  const [treeVisible, setTreeVisible] = useState(false)
  const [treeDockHeight, setTreeDockHeight] = useState(() =>
    clampTreeDockHeight(Math.round(window.innerHeight * 0.35)),
  )
  const [treeDockDragging, setTreeDockDragging] = useState(false)
  const treeDragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)

  // Rotation / window resize: keep the dock inside the (possibly smaller)
  // dynamic viewport so it never overflows the one-screen shell. The resize
  // listener runs only while visible, so re-opening after the window shrank
  // while hidden re-clamps the stored height once on becoming visible.
  useEffect(() => {
    if (!treeVisible) return
    setTreeDockHeight((h) => clampTreeDockHeight(h))
    const onViewportResize = () => setTreeDockHeight((h) => clampTreeDockHeight(h))
    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [treeVisible])

  // --- AI game mode ---------------------------------------------------------
  const [gameMode, setGameMode] = useState<GameMode>(boot?.gameMode ?? 'selfplay')
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
    analysisSettings,
    setAnalysisSettings,
    humanModelAvailable,
    engineVersion,
    engineError,
    setEngineError,
    isRestarting,
    handleRestartEngine,
    getAnalysisSettings,
    getLightAnalysisSettings,
    ANALYSIS_TIMEOUT,
  } = useEngine({ boardSize, showToast })

  // --- Analysis model identity ------------------------------------------------
  // Names of the loaded play/analysis models (from the bridge). Used for the
  // analysis cache context and for KAM provenance metadata on SGF save.
  const [playModelPath, setPlayModelPath] = useState<string | null>(null)
  const [analysisModelPath, setAnalysisModelPath] = useState<string | null>(null)
  // Provenance metadata read from a loaded SGF's KAM property (or null).
  const [analysisMetadata, setAnalysisMetadata] = useState<AnalysisMetadata | null>(null)

  const refreshModelPaths = useCallback(async () => {
    try {
      const result = await katagoAdapter.listModels()
      setPlayModelPath(result.currentModelPath)
      setAnalysisModelPath(result.currentAnalysisModelPath)
    } catch {
      // Bridge offline — cache keys just lack model identity until it's up.
    }
  }, [])

  useEffect(() => {
    void refreshModelPaths()
  }, [refreshModelPaths])

  // --- Analysis polling -----------------------------------------------------
  // Shared node-id-keyed cache: the live per-position analysis AND the
  // full-tree batch analysis read/write the same results (SGF save embeds
  // the whole map). The cache clears when the run context changes.
  const analysisCacheRef = useRef(new Map<string, SgfAnalysisEntry>())

  // --- Full-tree batch analysis (Feature B) ---------------------------------
  const treeAnalysis = useTreeAnalysis({
    gameState,
    engineEnabled: engineSettings.enabled,
    getLightAnalysisSettings,
    analysisModelPath,
    analysisCacheRef,
    timeoutMs: ANALYSIS_TIMEOUT,
  })

  // While the batch run owns the engine, the live per-position fetch pauses
  // (the panel keeps showing cached results; it resumes after the batch).
  const analysisEnabled =
    !treeAnalysis.isActive &&
    (showWinrate ||
      showOwnership ||
      showPolicy ||
      (gameMode === 'selfplay' && showCandidates))
  const {
    winrateAnalysis,
    winrateLoading,
    winrateError,
    ownership,
    policy,
    analysisDurationMs,
  } = useAnalysis({
    engineEnabled: engineSettings.enabled,
    enabled: analysisEnabled,
    signMap,
    gameState,
    getLightAnalysisSettings,
    analysisModelPath,
    timeoutMs: ANALYSIS_TIMEOUT,
    analysisCacheRef,
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

  // --- Review/놓아보기 수 번호 모드 --------------------------------------------
  // 'hidden'(기본) / 'all'(현재 경로 전체 1부터) / 'fromCurrent'(선택 노드
  // "이후"의 착수만 1부터 — 누른 순간 이미 놓인 돌은 무번호). 선택 시작점
  // (anchor)은 트리 노드 id — 새 대국/SGF 불러오기 시 반드시 초기화해
  // stale id가 새 트리에 잘못 적용되지 않게 한다.
  const [moveNumberMode, setMoveNumberMode] = useState<MoveNumberMode>('hidden')
  const [moveNumberAnchorId, setMoveNumberAnchorId] = useState<string | null>(null)

  const resetMoveNumbering = useCallback(() => {
    setMoveNumberMode('hidden')
    setMoveNumberAnchorId(null)
  }, [])

  // NOTE: a boardSize change never re-initializes the game by itself — every
  // setBoardSize caller (SGF load, screenshot import, new game) already
  // replaces gameState with a matching tree. A blank reset here would wipe
  // non-19x19 SGF loads (SZ[9]/SZ[13]) right after they were set.

  // --- Active-game autosave ---------------------------------------------------
  // Persist the draft after every tree change (move/pass/undo/redo/navigate)
  // so a sleep-induced tab reload never loses the game. Blank games are
  // skipped: booting with nothing to restore must not overwrite a valid
  // saved draft with the initial empty state.
  useEffect(() => {
    if (isBlankGame(gameState.gameTree)) return
    saveActiveGame(gameState.gameTree, { boardSize, gameMode })
  }, [gameState.gameTree, gameState, boardSize, gameMode])

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

  /**
   * 번호 토글 클릭: 활성 토글을 다시 누르면 끄고(라벨/anchor 모두 해제),
   * 다른 토글로 전환한다. '번호 표시'는 현재 선택 노드를 시작점(anchor)으로
   * 삼되 그 "이후" 착수만 번호를 매긴다. '전체 수순'이 켜진 동안에는
   * '번호 표시' 버튼이 비활성이라 이 핸들러로 fromCurrent 전환은 오지 않는다.
   */
  const handleMoveNumberMode = useCallback(
    (mode: Exclude<MoveNumberMode, 'hidden'>) => {
      if (moveNumberMode === mode) {
        // Toggle off — labels disappear immediately.
        setMoveNumberMode('hidden')
        setMoveNumberAnchorId(null)
        return
      }
      setMoveNumberMode(mode)
      setMoveNumberAnchorId(
        mode === 'fromCurrent'
          ? String(gameState.gameTree.currentId ?? gameState.gameTree.root.id)
          : null,
      )
    },
    [gameState, moveNumberMode],
  )

  // --- Marker maps (last-move circle + scoring crosses) ----------------------

  // Review/놓아보기 move numbers: "전체 수순"/"번호 표시" 모드에서만 표시한다.
  // Selfplay(놓아보기) 전용 — AI 모드로 전환하면 번호가 사라진다.
  const moveNumberMap = useMemo(() => {
    if (gameMode !== 'selfplay') return undefined
    if (moveNumberMode === 'hidden') return undefined
    if (moveNumberMode === 'fromCurrent') {
      if (moveNumberAnchorId === null) return undefined
      return getMoveNumberMap(gameState.gameTree, boardSize, {
        fromNodeId: moveNumberAnchorId,
      })
    }
    return getMoveNumberMap(gameState.gameTree, boardSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameMode,
    moveNumberMode,
    moveNumberAnchorId,
    gameState.gameTree,
    boardSize,
    moveVersion,
  ])

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
    if (
      gameState.lastMove === null &&
      scoringMarkerMap === undefined &&
      moveNumberMap == null
    ) {
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
    // Move-number labels take precedence over the last-move circle.
    if (moveNumberMap != null) {
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y]!.length; x++) {
          const n = moveNumberMap[y]?.[x]
          if (n != null) {
            map[y]![x] = { type: 'label', label: String(n) }
          }
        }
      }
    }
    // Scoring crosses win over everything (dead-stone marking).
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
  }, [signMap, gameState.lastMove, scoringMarkerMap, moveNumberMap])

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
        visits: bm.visits,
        winrate: gameState.currentPlayer === 1 ? bm.winrate : 1 - bm.winrate,
        scoreDelta:
          gameState.currentPlayer * (bm.scoreLead - (winrateAnalysis.scoreLead ?? 0)),
        pv: bm.pv ?? [],
      })
    }
    return result
  }, [winrateAnalysis, gameMode, boardSize, gameState.currentPlayer])

  const candidateMarkers = useMemo(
    () =>
      candidates
        .filter((c): c is CandidateMove & { vertex: Vertex } => c.vertex !== 'pass')
        .map((c) => ({
          vertex: c.vertex,
          scoreDelta: c.scoreDelta,
          visits: c.visits,
        })),
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

    const aiSettings = getAnalysisSettings()
    const aiMoveStart = performance.now()

    try {
      const response = await katagoAdapter.requestMove(
        gameState.gameTree,
        gameState.currentPlayer,
        aiSettings,
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

      setAiMoveStats({
        durationMs: performance.now() - aiMoveStart,
        settings: {
          maxVisits: aiSettings.maxVisits ?? 0,
          maxTime: aiSettings.maxTime ?? 0,
          numSearchThreads: aiSettings.numSearchThreads ?? 1,
        },
        moveNumber: getMoveList(gameState.gameTree).length,
      })
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

  /** New-game modal confirm: apply config, reset the board. */
  const handleStartNewGame = useCallback(
    (config: NewGameConfig) => {
    // Never silently discard a non-empty active game — confirm first.
    if (!isBlankGame(gameState.gameTree)) {
      const confirmed = window.confirm(
        '새 대국을 시작하면 현재 진행 중인 대국이 삭제됩니다. 계속하시겠습니까?',
      )
      if (!confirmed) return
    }
    setEngineSettings((prev) =>
      applyPlayStyle(applyDifficulty(prev, config.difficulty), config.playStyle),
    )
    abortAiAndReset()
    // A fresh game intentionally replaces the recovery draft.
    clearActiveGame()
    setAiMoveStats(null)
    setAnalysisMetadata(null)
    resetMoveNumbering()
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
    [abortAiAndReset, gameState, resetMoveNumbering, setEngineSettings, engineSettings.enabled, showToast],
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

  // --- Review (tree navigation + winrate graph) --------------------------------

  /** Tree-view node click / graph point click: jump the board to that state. */
  const handleNavigateToNode = (nodeId: string) => {
    navigate(() => gameState.navigateToNode(nodeId))
  }

  /** Winrate graph series for the currently selected branch (Black view). */
  const winratePoints = useMemo<readonly WinratePoint[]>(() => {
    return buildWinratePoints(gameState.gameTree, analysisCacheRef.current)
    // treeAnalysis.completed re-computes the series as batch results land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameTree, moveVersion, treeAnalysis.completed, analysisCacheRef])

  // --- SGF ---------------------------------------------------------------------

  const handleSaveSGF = () => {
    const filename = `game-${Date.now()}.sgf`
    const basename = (p: string | null): string =>
      p === null ? '' : (p.split('/').pop() ?? p)
    // Embed whatever analysis this session holds (or preserves a loaded
    // file's own KA/KAM) so saved games reopen with their analysis intact.
    const embed: SgfAnalysisEmbed | undefined =
      analysisCacheRef.current.size > 0 || analysisMetadata !== null
        ? {
            analysisByNodeId: analysisCacheRef.current,
            metadata: analysisMetadata ?? {
              engine: engineVersion ?? '',
              model: basename(playModelPath),
              analysisModel: basename(analysisModelPath),
              maxVisits: analysisSettings.maxVisits,
              maxTime: analysisSettings.maxTime,
              numSearchThreads: analysisSettings.numSearchThreads,
              komi: engineSettings.rules === 'chinese' ? 7.5 : 6.5,
              rules: engineSettings.rules,
              date: new Date().toISOString(),
            },
          }
        : undefined
    downloadSGF(gameState.gameTree, filename, boardSize, embed)
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
      setAnalysisMetadata(getAnalysisMetadataFromTree(newGameState.gameTree))
      // SGF node ids are regenerated by the parser — drop any numbering anchor.
      resetMoveNumbering()
    } catch (error) {
      console.error('Failed to load SGF:', error)
    } finally {
      input.value = ''
    }
  }

  /** 스크린샷 인식 국면을 현재 대국 자리에 교체한다. */
  const handleScreenshotImport = (sgf: string, size: number, nextTurn: 'B' | 'W') => {
    const finalSgf = withPlayerToPlay(sgf, nextTurn)
    try {
      const loadedTree = sgfToTree(finalSgf)
      const validSize: BoardSize = [9, 13, 19].includes(size) ? (size as BoardSize) : 19

      if (!isBlankGame(gameState.gameTree)) {
        const confirmed = window.confirm(
          '진행 중인 대국을 스크린샷 국면으로 교체합니다. 계속하시겠습니까?',
        )
        if (!confirmed) return
      }

      if (validSize !== boardSize) {
        setBoardSize(validSize)
      }
      const newGameState = createGameState(validSize, loadedTree)
      setGameState(newGameState)
      setSignMap(newGameState.getSignMap())
      setMoveVersion((v) => v + 1)
      setAnalysisMetadata(getAnalysisMetadataFromTree(newGameState.gameTree))
      resetMoveNumbering()
      setScreenshotImportOpen(false)
      showToast('스크린샷에서 국면을 이어받았습니다.')
    } catch (error) {
      console.error('Failed to import screenshot:', error)
      showToast('이어하기에 실패했습니다.')
    }
  }

  // --- Top bar handlers ---------------------------------------------------------

  const handleToggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    setSoundEnabledState(next)
  }

  /** Main-model switch: re-init engine params, then refresh model identity. */
  const handleMainModelChanged = useCallback(async () => {
    await handleRestartEngine()
    await refreshModelPaths()
  }, [handleRestartEngine, refreshModelPaths])

  /**
   * Mode switch keeps the exact game (tree/cursor/board) — only the play
   * mode changes. Any in-flight AI request is aborted and invalidated (via
   * a generation bump) so a late AI move cannot land after the switch; the
   * last committed position is retained. Autosave keeps persisting the
   * same tree with the new mode.
   *
   * AI convention: the user plays Black and the AI plays White. When
   * entering AI mode on a White-to-play position the AI moves immediately;
   * on a Black-to-play position it waits for the user's move.
   */
  const handleGameModeChange = (mode: GameMode) => {
    if (mode === gameMode) return
    if (isAiThinkingRef.current) {
      void katagoAdapter.abortOngoing().catch(() => {})
    }
    // Invalidate any in-flight AI request (late responses are ignored).
    gameGenerationRef.current += 1
    isAiThinkingRef.current = false
    setIsAiThinking(false)
    setAiGhostVertex(null)
    setAiFlashVertex(null)
    setGameMode(mode)
    if (mode === 'ai') {
      if (!engineSettings.enabled) {
        showToast('엔진이 꺼져 있습니다. AI 대국을 위해 엔진을 켜주세요.')
      } else if (gameState.currentPlayer === -1) {
        void triggerAiMove()
      }
    }
  }

  const handleAiMove = () => {
    if (gameMode !== 'ai' || isAiThinkingRef.current) return
    void triggerAiMove()
  }

  // --- Tree dock resizer (pointer/touch/keyboard) ------------------------------

  const handleResizerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    treeDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: treeDockHeight,
    }
    setTreeDockDragging(true)
    // Capture the pointer so drags keep tracking outside the 14px handle
    // (also covers touch, with touch-action: none in CSS).
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleResizerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = treeDragRef.current
    if (drag === null || drag.pointerId !== e.pointerId) return
    // Dragging UP grows the tree; the stage above shrinks by the same
    // amount (flex layout), clamped so a useful board always remains.
    const delta = drag.startY - e.clientY
    setTreeDockHeight(clampTreeDockHeight(drag.startHeight + delta))
  }

  const endTreeDockDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = treeDragRef.current
    if (drag === null || drag.pointerId !== e.pointerId) return
    treeDragRef.current = null
    setTreeDockDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleResizerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 24
    let next: number | null = null
    if (e.key === 'ArrowUp') next = treeDockHeight + step
    else if (e.key === 'ArrowDown') next = treeDockHeight - step
    else if (e.key === 'Home') next = Number.POSITIVE_INFINITY
    else if (e.key === 'End') next = Number.NEGATIVE_INFINITY
    else return
    e.preventDefault()
    setTreeDockHeight(clampTreeDockHeight(next))
  }

  // --- Render --------------------------------------------------------------------

  return (
    <BoardThemeProvider>
      <div
        id="app-root"
        className={zenMode ? 'zen-mode' : undefined}
      >
        {/* Fixed-height (desktop) board-first stage: top bar + 3 columns.
            When the tree dock is open the stage flex-shrinks by the dock
            height so both fit the same viewport. */}
        <div className="stage">
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
          {!zenMode && <aside className="board-rail" aria-hidden="true" />}
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
              policy={policy}
              showPolicy={showPolicy}
              candidateMoves={showCandidates ? candidateMarkers : undefined}
              dimmedVertices={isScoring ? effectiveDeadStones : undefined}
              hoverGhostDisabled={isAiThinking}
              winrateOverlay={
                showWinrate && !zenMode ? (
                  <AnalysisPanel
                    analysis={winrateAnalysis}
                    loading={winrateLoading}
                    error={winrateError}
                    engineEnabled={engineSettings.enabled}
                    orientation="vertical"
                  />
                ) : undefined
              }
            />
          </div>

          {!zenMode && (
            <div className="side-col">
              <PlaybackBar
                gameState={gameState}
                moveVersion={moveVersion}
                onFirst={() => navigate(() => gameState.jumpToStart())}
                onPrev={() => navigate(() => gameState.undo())}
                onNext={() => navigate(() => gameState.redo())}
                onLast={() => navigate(() => gameState.jumpToEnd())}
              />
               <ReviewPanel
                 gameState={gameState}
                 gameMode={gameMode}
                 engineEnabled={engineSettings.enabled}
                 treeAnalysis={treeAnalysis}
                 winratePoints={winratePoints}
                 moveNumberMode={moveNumberMode}
                 moveNumberLabelsVisible={moveNumberMap != null}
                 onMoveNumberModeSelect={handleMoveNumberMode}
                 onGraphNodeClick={handleNavigateToNode}
                 treeVisible={treeVisible}
                 onToggleTree={() => setTreeVisible((v) => !v)}
               />
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
                onOpenScreenshot={() => setScreenshotImportOpen(true)}
                canScore={canScore}
                isScoring={isScoring}
                onScore={handleScore}
                onSaveSGF={handleSaveSGF}
                onFileChange={handleFileChange}
                showWinrate={showWinrate}
                onToggleWinrate={() => setShowWinrate((prev) => !prev)}
                showPolicy={showPolicy}
                onTogglePolicy={() => setShowPolicy((prev) => !prev)}
                showOwnership={showOwnership}
                onToggleOwnership={() => setShowOwnership((prev) => !prev)}
                showCandidates={showCandidates}
                onToggleCandidates={() => setShowCandidates((prev) => !prev)}
                showSummary={showSummary}
                onToggleSummary={() => setShowSummary((prev) => !prev)}
                showAiAnalysis={showAiAnalysis}
                onToggleAiAnalysis={() => setShowAiAnalysis((prev) => !prev)}
                aiMoveStats={aiMoveStats}
                analysis={winrateAnalysis}
                analysisLoading={winrateLoading}
                analysisError={winrateError}
                engineEnabled={engineSettings.enabled}
                analysisDurationMs={analysisDurationMs}
                analysisSettings={analysisSettings}
                analysisMetadata={analysisMetadata}
                candidates={candidates}
                 onSelectCandidate={handleSelectCandidate}
                 />
               </div>
             )}
          </div>
        </div>

        {/* Game-tree dock at the bottom: hidden until toggled on from the
            ReviewPanel. Its fixed pixel height shrinks the stage above by
            the same amount; the resizer on top is pointer/touch/keyboard
            resizable; the tree scrolls internally on both axes. Zen mode
            hides the dock entirely (board-first). */}
        {!zenMode && treeVisible && (
          <section
            className="tree-dock"
            data-testid="tree-dock"
            aria-label="기보 트리"
            style={{ height: `${treeDockHeight}px` }}
          >
            <div
              className="tree-resizer"
              role="separator"
              aria-orientation="horizontal"
              aria-label="기보 트리 높이 조절"
              aria-valuemin={minTreeDockHeight()}
              aria-valuemax={maxTreeDockHeight()}
              aria-valuenow={treeDockHeight}
              tabIndex={0}
              data-dragging={treeDockDragging ? 'true' : undefined}
              onPointerDown={handleResizerPointerDown}
              onPointerMove={handleResizerPointerMove}
              onPointerUp={endTreeDockDrag}
              onPointerCancel={endTreeDockDrag}
              onKeyDown={handleResizerKeyDown}
            />
            <div className="tree-section">
              <GameTreePanel
                tree={gameState.gameTree}
                moveVersion={moveVersion}
                onNodeClick={handleNavigateToNode}
                fill
              />
            </div>
          </section>
        )}

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          engineSettings={engineSettings}
          onEngineSettingsChange={setEngineSettings}
          analysisSettings={analysisSettings}
          onAnalysisSettingsChange={setAnalysisSettings}
          humanModelAvailable={humanModelAvailable}
          onModelChanged={handleMainModelChanged}
          onAnalysisModelChanged={refreshModelPaths}
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

        {screenshotImportOpen && (
          <ScreenshotImportModal
            title="스크린샷 이어하기"
            onClose={() => setScreenshotImportOpen(false)}
            onImport={handleScreenshotImport}
          />
        )}

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
