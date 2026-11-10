/*
 * badukdojang — game screen composition.
 *
 * Layout (OGS-inspired): top bar + three columns — a left game/session rail,
 * the board and winrate meter as the dominant center column,
 * and the right column with playback controls + core game controls
 * (GameSidebar). Non-core configuration (engine tuning, board theme)
 * lives in SettingsModal; per-game setup (size, mode, difficulty) in
 * NewGameModal. Zen mode hides everything but the board.
 *
 * ONE-SCREEN shell: `#app-root` is exactly one dynamic viewport tall and
 * never scrolls at page level. Two bottom docks are hidden by default and
 * toggled from the ReviewPanel, both full app-content width:
 *   - .graph-dock — winrate graph + the full-tree batch analysis (전체 분석)
 *     that feeds it (WinrateDock component),
 *   - .tree-dock — the game-tree visualization (GameTreePanel), the ONE
 *     tree view in the app.
 * While visible a dock has a fixed pixel height, so the .stage above
 * flex-shrinks by that amount and Board.tsx re-measures the smaller slot —
 * board and docks share the same viewport. Each dock is vertically
 * resizable via a pointer/touch/keyboard separator (.tree-resizer /
 * .graph-resizer); when BOTH are open their max heights are sandwiched
 * against each other so stage + docks always fit one screen.
 *
 * Game flow state lives here; engine lifecycle in useEngine, analysis
 * polling in useAnalysis, scoring flow in useScoring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SignMap, Vertex } from '@kaya/goboard'
import type { BoardMap, Marker } from '@kaya/shudan'
import { BoardThemeProvider } from '@kaya/themes'
import { Board } from './components/Board.tsx'
import type { BoardWrapBounds } from './components/Board.tsx'
import { GameActionsRail } from './components/GameActionsRail.tsx'
import { AnalysisPanel } from './components/AnalysisPanel.tsx'
import { TopBar } from './components/TopBar.tsx'
import { GameSidebar } from './components/GameSidebar.tsx'
import { PlaybackBar } from './components/PlaybackBar.tsx'
import { ReviewPanel } from './components/ReviewPanel.tsx'
import { WinrateDock } from './components/WinrateDock.tsx'
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
import { useToolbarShortcuts } from './hooks/useToolbarShortcuts.ts'
import type { ToolbarShortcutActions } from './hooks/useToolbarShortcuts.ts'
import type { BoardSize, GameMode, MoveNumberMode, PlacementColor } from './lib/types.ts'
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

// --- One-screen dock sizing ---------------------------------------------------
// Each dock is a fixed-pixel bottom region; the stage above flex-shrinks by
// the total height of the visible docks (flex: 1 1 auto + min-height: 0), so
// board and docks always share one viewport without page-level scroll.
// Bounds keep a useful board even on short viewports; window.innerHeight
// (dynamic viewport height, incl. mobile URL-bar changes) is read at drag
// time and re-clamped on resize. When both docks are open, the OTHER dock's
// height is subtracted from each max so they cannot jointly starve the stage.
// 14px handle + 6px dock gap + about two 32px tree rows.
const TREE_DOCK_MIN = 88
const TREE_DOCK_DEFAULT = 88
// Graph dock: 14px handle + header + progress + about one graph row.
const GRAPH_DOCK_MIN = 120
const GRAPH_DOCK_DEFAULT = 180
// Desktop: top bar + a minimal usable board slot + paddings/gaps.
const MIN_STAGE_RESERVE_DESKTOP = 300
// Below the 1024px breakpoint the controls stack UNDER the board and keep a
// scrollable floor of their own, so the stage reserve grows accordingly.
const MIN_STAGE_RESERVE_STACKED = 440

function minDockHeight(fixedMin: number): number {
  // Very short viewports (e.g. landscape phones) may lower the floor so the
  // dock can stay open without starving the board entirely.
  return Math.min(fixedMin, Math.round(window.innerHeight * 0.25))
}

function maxDockHeight(fixedMin: number, otherDockReserve: number): number {
  return Math.max(
    minDockHeight(fixedMin),
    window.innerHeight - stageReserve() - otherDockReserve,
  )
}

function clampDockHeight(
  height: number,
  fixedMin: number,
  otherDockReserve: number,
): number {
  return Math.round(
    Math.min(Math.max(height, minDockHeight(fixedMin)), maxDockHeight(fixedMin, otherDockReserve)),
  )
}

function stageReserve(): number {
  return window.innerWidth < 1024
    ? MIN_STAGE_RESERVE_STACKED
    : MIN_STAGE_RESERVE_DESKTOP
}

function getWinrateMeterLayout(bounds: BoardWrapBounds) {
  const gap = 6
  const outerSpace = Math.max(0, bounds.left - gap)
  const gridGutterSpace = Math.max(0, bounds.gridLeft - gap)
  const useCoordinateGutter = window.innerWidth < 1024 && outerSpace < 18
  const width = Math.min(36, useCoordinateGutter ? gridGutterSpace : 36)

  return {
    left: useCoordinateGutter
      ? Math.max(0, bounds.gridLeft - width - gap)
      : bounds.left - width - gap,
    top: bounds.top,
    width,
    height: bounds.height,
    fontSize: `${Math.min(11, Math.max(6, width * 0.32))}px`,
  }
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
  const [boardWrapBounds, setBoardWrapBounds] = useState<BoardWrapBounds | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [screenshotImportOpen, setScreenshotImportOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  const handleBoardWrapBoundsChange = useCallback((bounds: BoardWrapBounds) => {
    setBoardWrapBounds((previous) =>
      previous?.left === bounds.left &&
      previous.top === bounds.top &&
      previous.width === bounds.width &&
      previous.height === bounds.height &&
      previous.gridLeft === bounds.gridLeft
        ? previous
        : bounds,
    )
  }, [])

  // --- Bottom docks (one-screen layout) ---------------------------------------
  // Both hidden by default; toggled from the ReviewPanel (기보 트리 /
  // 승률 그래프). While visible each docks at the bottom of the shell and
  // the stage shrinks by its height, so everything fits the same viewport.
  // Each height is user-resizable (drag or keyboard on its separator) and
  // re-clamped when the viewport resizes; the clamp of one dock accounts
  // for the height of the other visible dock.
  const [treeVisible, setTreeVisible] = useState(false)
  const [treeDockHeight, setTreeDockHeight] = useState(() =>
    clampDockHeight(TREE_DOCK_DEFAULT, TREE_DOCK_MIN, 0),
  )
  const [treeDockDragging, setTreeDockDragging] = useState(false)
  const treeDragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)
  const [winrateDockVisible, setWinrateDockVisible] = useState(false)
  const [graphDockHeight, setGraphDockHeight] = useState(() =>
    clampDockHeight(GRAPH_DOCK_DEFAULT, GRAPH_DOCK_MIN, 0),
  )
  const [graphDockDragging, setGraphDockDragging] = useState(false)
  const graphDragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)

  // Rotation / window resize: keep any open dock inside the (possibly
  // smaller) dynamic viewport so it never overflows the one-screen shell.
  // The resize listener runs only while a dock is visible, so re-opening
  // after the window shrank while hidden re-clamps the stored height once
  // on becoming visible.
  useEffect(() => {
    if (!treeVisible && !winrateDockVisible) return
    const clampAll = () => {
      setTreeDockHeight((h) =>
        clampDockHeight(h, TREE_DOCK_MIN, winrateDockVisible ? graphDockHeight : 0),
      )
      setGraphDockHeight((h) =>
        clampDockHeight(h, GRAPH_DOCK_MIN, treeVisible ? treeDockHeight : 0),
      )
    }
    clampAll()
    window.addEventListener('resize', clampAll)
    return () => window.removeEventListener('resize', clampAll)
  }, [treeVisible, winrateDockVisible, treeDockHeight, graphDockHeight])

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

  // --- 놓아보기 착수 색 / 셋업 배치 -------------------------------------------
  // UI 전용 상태 — 대국 설정 저장(autosave)에는 들어가지 않는다. 'auto'는
  // 현재 차례 색(흑백 교대)이고, 흑/백 고정 시 차례 강제 없이 연속 착수가
  // 가능하다. 셋업 모드가 켜지면 착수가 B/W 수순 노드 대신 AB/AW 셋업 노드로
  // 기록되어 차례가 바뀌지 않는다 (AI 모드에서는 항상 일반 착수).
  const [placementColor, setPlacementColor] = useState<PlacementColor>('auto')
  const [setupPlacementMode, setSetupPlacementMode] = useState(false)

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
   * and play sounds. `sign` overrides the turn color (놓아보기 고정 색
   * 착수) — undefined keeps the normal 흑백 교대 behavior.
   */
  const applyMove = useCallback(
    (move: Vertex | 'pass', gs: GameState = gameState, sign?: 1 | -1): boolean => {
      const oldCaptures =
        gs.board.getCaptures(1) + gs.board.getCaptures(-1)
      let success: boolean
      if (move === 'pass') {
        gs.pass()
        success = true
      } else {
        success = gs.makeMove(move, sign)
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

  /**
   * 놓아보기 자유 착수 — 고정 색(흑/백) 수순 착수 또는 셋업(AB/AW) 배치.
   * 색은 선택값('auto'면 현재 차례 색)을 따르고, 셋업 착수는 차례를 바꾸지
   * 않는다. 가드(중복 자리·활로 0) 위반은 일반 착수와 동일하게 flash 로
   * 피드백한다.
   */
  const applyPlacement = useCallback(
    (vertex: Vertex): boolean => {
      const sign: 1 | -1 =
        placementColor === 'black'
          ? 1
          : placementColor === 'white'
            ? -1
            : (gameState.currentPlayer as 1 | -1)
      if (setupPlacementMode) {
        const ok = gameState.placeSetupStone(vertex, sign)
        if (!ok) {
          setFlashTrigger((prev) => prev + 1)
          return false
        }
        // 셋업 배치로 상대 돌이 지워질 수 있으나 캡처 카운트는 그대로
        // 유지된다(getCurrentBoard 규칙) — 단순 착수음만 낸다.
        playStoneSound()
        setSignMap(gameState.getSignMap())
        setMoveVersion((v) => v + 1)
        return true
      }
      return applyMove(vertex, gameState, sign)
    },
    [applyMove, gameState, placementColor, setupPlacementMode],
  )

  // 호버 미리보기 색: 놓아보기에서 고정 색을 고르면 그 색, 아니면 현재 차례 색.
  // applyPlacement 의 착수 색 결정과 동일한 규칙을 써야 미리보기와 실제 착수가 일치한다.
  const previewPlayer: 1 | -1 =
    gameMode === 'selfplay' && placementColor !== 'auto'
      ? placementColor === 'black'
        ? 1
        : -1
      : (gameState.currentPlayer as 1 | -1)

  const handleVertexClick = (_evt: React.MouseEvent, vertex: Vertex) => {
    if (isAiThinkingRef.current) return
    if (isScoring) {
      handleToggleDead(vertex)
      return
    }
    // 자유 착수(고정 색/셋업)는 놓아보기 전용 — AI 대국은 항상 정상 교대.
    if (gameMode === 'selfplay' && (setupPlacementMode || placementColor !== 'auto')) {
      applyPlacement(vertex)
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

  // --- Toolbar keyboard shortcuts (Ctrl+1..5, Ctrl+[, Ctrl+]) ----------------------
  // Analysis order: 후보수(1), 형세(2), 승률(3), 정책망(4), 분석 요약(5).
  // Game modes use Ctrl+[ and Ctrl+]. Contextual controls are honored by
  // omitting their action — 후보수 only exists in selfplay mode and the
  // engine-fed analysis toggles are disabled while the engine is off.
  const shortcutsBlocked =
    zenMode || // toolbar is not rendered in zen mode
    settingsOpen ||
    newGameOpen ||
    screenshotImportOpen ||
    computedScore !== null || // ScoringModal is open
    engineError !== null // EngineErrorModal is open

  const toolbarShortcutActions: ToolbarShortcutActions = {
    selfplay: () => handleGameModeChange('selfplay'),
    ai: () => handleGameModeChange('ai'),
    candidates:
      engineSettings.enabled && gameMode === 'selfplay'
        ? () => setShowCandidates((prev) => !prev)
        : undefined,
    ownership: engineSettings.enabled
      ? () => setShowOwnership((prev) => !prev)
      : undefined,
    winrate: engineSettings.enabled
      ? () => setShowWinrate((prev) => !prev)
      : undefined,
    policy: engineSettings.enabled
      ? () => setShowPolicy((prev) => !prev)
      : undefined,
    summary: () => setShowSummary((prev) => !prev),
  }

  useToolbarShortcuts(toolbarShortcutActions, shortcutsBlocked)

  // --- Dock resizers (pointer/touch/keyboard) ----------------------------------

  const clampTree = (height: number): number =>
    clampDockHeight(height, TREE_DOCK_MIN, winrateDockVisible ? graphDockHeight : 0)

  const clampGraph = (height: number): number =>
    clampDockHeight(height, GRAPH_DOCK_MIN, treeVisible ? treeDockHeight : 0)

  const handleTreeResizerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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

  const handleTreeResizerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = treeDragRef.current
    if (drag === null || drag.pointerId !== e.pointerId) return
    // Dragging UP grows the tree; the stage above shrinks by the same
    // amount (flex layout), clamped so a useful board always remains.
    const delta = drag.startY - e.clientY
    setTreeDockHeight(clampTree(drag.startHeight + delta))
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

  const handleTreeResizerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 24
    let next: number | null = null
    if (e.key === 'ArrowUp') next = treeDockHeight + step
    else if (e.key === 'ArrowDown') next = treeDockHeight - step
    else if (e.key === 'Home') next = Number.POSITIVE_INFINITY
    else if (e.key === 'End') next = Number.NEGATIVE_INFINITY
    else return
    e.preventDefault()
    setTreeDockHeight(clampTree(next))
  }

  const handleGraphResizerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    graphDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: graphDockHeight,
    }
    setGraphDockDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleGraphResizerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = graphDragRef.current
    if (drag === null || drag.pointerId !== e.pointerId) return
    const delta = drag.startY - e.clientY
    setGraphDockHeight(clampGraph(drag.startHeight + delta))
  }

  const endGraphDockDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = graphDragRef.current
    if (drag === null || drag.pointerId !== e.pointerId) return
    graphDragRef.current = null
    setGraphDockDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleGraphResizerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 24
    let next: number | null = null
    if (e.key === 'ArrowUp') next = graphDockHeight + step
    else if (e.key === 'ArrowDown') next = graphDockHeight - step
    else if (e.key === 'Home') next = Number.POSITIVE_INFINITY
    else if (e.key === 'End') next = Number.NEGATIVE_INFINITY
    else return
    e.preventDefault()
    setGraphDockHeight(clampGraph(next))
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
              engineEnabled={engineSettings.enabled}
              showWinrate={showWinrate}
              onToggleWinrate={() => setShowWinrate((prev) => !prev)}
              showCandidates={showCandidates}
              onToggleCandidates={() => setShowCandidates((prev) => !prev)}
              showPolicy={showPolicy}
              onTogglePolicy={() => setShowPolicy((prev) => !prev)}
              showOwnership={showOwnership}
              onToggleOwnership={() => setShowOwnership((prev) => !prev)}
              showSummary={showSummary}
              onToggleSummary={() => setShowSummary((prev) => !prev)}
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
          {!zenMode && (
            <GameActionsRail
              onNewGame={() => setNewGameOpen(true)}
              onSaveSgf={handleSaveSGF}
              onFileChange={handleFileChange}
              onImportScreenshot={() => setScreenshotImportOpen(true)}
            />
          )}
          <div className={`board-col${showWinrate && !zenMode ? ' board-col-with-winrate' : ''}`}>
            {showWinrate && !zenMode && boardWrapBounds !== null && (
              <div
                className="board-winrate-column"
                style={getWinrateMeterLayout(boardWrapBounds)}
              >
                <AnalysisPanel
                  analysis={winrateAnalysis}
                  loading={winrateLoading}
                  error={winrateError}
                  engineEnabled={engineSettings.enabled}
                  orientation="vertical"
                />
              </div>
            )}
            <Board
              signMap={signMap}
              boardSize={boardSize}
              markerMap={combinedMarkerMap}
              onVertexClick={handleVertexClick}
              flashTrigger={flashTrigger}
              showCoordinates={showCoordinates}
              currentPlayer={gameState.currentPlayer}
              previewPlayer={previewPlayer}
              aiGhostVertex={aiGhostVertex}
              aiFlashVertex={aiFlashVertex}
              ownership={ownership}
              showOwnership={showOwnership}
              policy={policy}
              showPolicy={showPolicy}
              candidateMoves={showCandidates ? candidateMarkers : undefined}
              dimmedVertices={isScoring ? effectiveDeadStones : undefined}
              hoverGhostDisabled={isAiThinking}
              onBoardWrapBoundsChange={
                showWinrate && !zenMode ? handleBoardWrapBoundsChange : undefined
              }
            />
          </div>

          {!zenMode && (
            <div className="side-col">
              <GameSidebar
                gameState={gameState}
                moveVersion={moveVersion}
                playbackBar={
                  <PlaybackBar
                    gameState={gameState}
                    moveVersion={moveVersion}
                    onFirst={() => navigate(() => gameState.jumpToStart())}
                    onPrev={() => navigate(() => gameState.undo())}
                    onNext={() => navigate(() => gameState.redo())}
                    onLast={() => navigate(() => gameState.jumpToEnd())}
                  />
                }
                reviewPanel={
                  <ReviewPanel
                    gameMode={gameMode}
                    moveNumberMode={moveNumberMode}
                    moveNumberLabelsVisible={moveNumberMap != null}
                    onMoveNumberModeSelect={handleMoveNumberMode}
                    placementColor={placementColor}
                    onPlacementColorSelect={(color) => {
                      setPlacementColor(color)
                      // 교대 = 일반 수순 착수. 셋업이 켜진 채로 두면 차례가 바뀌지 않는다.
                      if (color === 'auto') setSetupPlacementMode(false)
                    }}
                    setupPlacementMode={setupPlacementMode}
                    onToggleSetupPlacement={() =>
                      setSetupPlacementMode((prev) => !prev)
                    }
                    treeVisible={treeVisible}
                    onToggleTree={() => setTreeVisible((v) => !v)}
                    winrateDockVisible={winrateDockVisible}
                    onToggleWinrateDock={() => setWinrateDockVisible((v) => !v)}
                  />
                }
                gameMode={gameMode}
                onGameModeChange={handleGameModeChange}
                isAiThinking={isAiThinking}
                onAiMove={handleAiMove}
                onPass={handlePass}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canScore={canScore}
                isScoring={isScoring}
                onScore={handleScore}
                showCandidates={showCandidates}
                showSummary={showSummary}
                showAiAnalysis={showAiAnalysis}
                onToggleAiAnalysis={() => setShowAiAnalysis((prev) => !prev)}
                aiMoveStats={aiMoveStats}
                analysis={winrateAnalysis}
                analysisLoading={winrateLoading}
                analysisError={winrateError}
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

        {/* Winrate graph dock at the bottom (above the tree dock): hidden
            until toggled on from the ReviewPanel's 승률 그래프 button. The
            full-tree batch analysis (전체 분석) lives INSIDE the dock; the
            graph plots results only once a run has been started. Its fixed
            pixel height shrinks the stage above; the resizer on top is
            pointer/touch/keyboard resizable. Zen mode hides it entirely. */}
        {!zenMode && winrateDockVisible && (
          <WinrateDock
            gameState={gameState}
            engineEnabled={engineSettings.enabled}
            treeAnalysis={treeAnalysis}
            winratePoints={winratePoints}
            onGraphNodeClick={handleNavigateToNode}
            dockHeight={graphDockHeight}
            dragging={graphDockDragging}
            minHeight={minDockHeight(GRAPH_DOCK_MIN)}
            maxHeight={maxDockHeight(GRAPH_DOCK_MIN, treeVisible ? treeDockHeight : 0)}
            onResizerPointerDown={handleGraphResizerPointerDown}
            onResizerPointerMove={handleGraphResizerPointerMove}
            onResizerPointerUp={endGraphDockDrag}
            onResizerPointerCancel={endGraphDockDrag}
            onResizerKeyDown={handleGraphResizerKeyDown}
          />
        )}

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
              aria-valuemin={minDockHeight(TREE_DOCK_MIN)}
              aria-valuemax={maxDockHeight(TREE_DOCK_MIN, winrateDockVisible ? graphDockHeight : 0)}
              aria-valuenow={treeDockHeight}
              tabIndex={0}
              data-dragging={treeDockDragging ? 'true' : undefined}
              onPointerDown={handleTreeResizerPointerDown}
              onPointerMove={handleTreeResizerPointerMove}
              onPointerUp={endTreeDockDrag}
              onPointerCancel={endTreeDockDrag}
              onKeyDown={handleTreeResizerKeyDown}
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
