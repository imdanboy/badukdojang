/*
 * GameSidebar — core game controls beside the board (OGS right-col style).
 * Player card (turn + captures), gameplay actions, and analysis results.
 * Game/session setup and SGF actions live in the left rail. Only what the
 * active game needs; all configuration lives in SettingsModal.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { AnalysisSummary } from './AnalysisSummary.tsx'
import { AiAnalysisPanel } from './AiAnalysisPanel.tsx'
import type { AiMoveStats } from './AiAnalysisPanel.tsx'
import { CandidateMoves } from './CandidateMoves.tsx'
import type { CandidateMove } from './CandidateMoves.tsx'
import type { AnalyzeResponse } from '../lib/engine/types.ts'
import type { AnalysisSettings } from '../lib/engineSettings.ts'
import type { AnalysisMetadata } from '../lib/analysisSgf.ts'
import type { GameState } from '../lib/gameState.ts'
import type { GameMode } from '../lib/types.ts'
import type { Vertex } from '@kaya/goboard'

export interface GameSidebarProps {
  gameState: GameState
  playbackBar: ReactNode
  reviewPanel: ReactNode
  /** Bumped by the parent on every move/navigation to refresh derived state. */
  moveVersion: number
  gameMode: GameMode
  isAiThinking: boolean
  onAiMove: () => void
  onPass: () => void
  onUndo: () => void
  onRedo: () => void
  canScore: boolean
  isScoring: boolean
  onScore: () => void
  showCandidates: boolean
  showSummary: boolean
  showAiAnalysis: boolean
  onToggleAiAnalysis: () => void
  aiMoveStats: AiMoveStats | null
  analysis: AnalyzeResponse | null
  analysisLoading: boolean
  analysisError: string | null
  analysisDurationMs: number | null
  analysisSettings: AnalysisSettings
  /** Provenance of an SGF-embedded analysis run (KAM), if loaded. */
  analysisMetadata?: AnalysisMetadata | null | undefined
  /** Top candidate moves (self-play study hints). */
  candidates: readonly CandidateMove[]
  /** Play a candidate move from the sidebar rows. */
  onSelectCandidate: (vertex: Vertex | 'pass') => void
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  opacity: disabled ? 0.5 : 1,
  background: '#3b3b5c',
  color: '#e0e0e0',
  flex: 1,
})

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  ...btnStyle(disabled),
  background: '#5a7fb5',
  color: '#fff',
  fontWeight: 600,
})

const smallBtnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '12px',
  opacity: disabled ? 0.5 : 1,
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

const YINYANG_BLACK_PATH =
  'M32 2A30 30 0 0 1 32 62A15 15 0 0 1 32 32A15 15 0 0 0 32 2Z'

function PlayerCard({
  gameState,
  moveVersion,
}: {
  gameState: GameState
  moveVersion: number
}) {
  const { isBlackTurn, blackCaptures, whiteCaptures } = useMemo(() => {
    return {
      isBlackTurn: gameState.currentPlayer === 1,
      blackCaptures: gameState.board.getCaptures(1),
      whiteCaptures: gameState.board.getCaptures(-1),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, moveVersion])

  const blackCountSize = blackCaptures >= 100 ? 7 : blackCaptures >= 10 ? 9 : 11
  const whiteCountSize = whiteCaptures >= 100 ? 7 : whiteCaptures >= 10 ? 9 : 11

  return (
    <div
      className="player-card"
    >
      <svg
        className="player-turn-yinyang"
        viewBox="0 0 64 64"
        data-current-player={isBlackTurn ? 'black' : 'white'}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="player-turn-yinyang-base"
          cx="32"
          cy="32"
          r="30"
          opacity={isBlackTurn ? 0.38 : 1}
        />
        <path
          className="player-turn-yinyang-black"
          d={YINYANG_BLACK_PATH}
          transform="translate(0 64) scale(1 -1)"
          opacity={isBlackTurn ? 1 : 0.35}
        />
        <circle className="player-turn-yinyang-outline" cx="32" cy="32" r="30" />
        <path
          className="player-turn-active-lobe"
          d={YINYANG_BLACK_PATH}
          transform={
            isBlackTurn
              ? 'translate(0 64) scale(1 -1)'
              : 'translate(64 0) scale(-1 1)'
          }
          data-active-lobe={isBlackTurn ? 'black' : 'white'}
        />
        {/* Each player's captures sit on their lobe's opposite-color dot. */}
        <circle
          className="player-turn-count-dot player-turn-count-dot-white"
          cx="32"
          cy="17"
          r="10"
        />
        <text
          className="player-turn-count player-turn-count-white"
          x="32"
          y="17"
          fontSize={whiteCountSize}
        >
          {blackCaptures}
        </text>
        <circle
          className="player-turn-count-dot player-turn-count-dot-black"
          cx="32"
          cy="47"
          r="10"
        />
        <text
          className="player-turn-count player-turn-count-black"
          x="32"
          y="47"
          fontSize={blackCountSize}
        >
          {whiteCaptures}
        </text>
      </svg>
      <span id="turn-indicator" className="visually-hidden" aria-live="polite" aria-atomic="true">
        To Play: {isBlackTurn ? 'Black' : 'White'}. 흑 잡은 돌 {blackCaptures}개. 백 잡은 돌 {whiteCaptures}개.
      </span>
    </div>
  )
}

export function GameSidebar({
  gameState,
  playbackBar,
  reviewPanel,
  moveVersion,
  gameMode,
  isAiThinking,
  onAiMove,
  onPass,
  onUndo,
  onRedo,
  canScore,
  isScoring,
  onScore,
  showCandidates,
  showSummary,
  showAiAnalysis,
  onToggleAiAnalysis,
  aiMoveStats,
  analysis,
  analysisLoading,
  analysisError,
  analysisDurationMs,
  analysisSettings,
  analysisMetadata,
  candidates,
  onSelectCandidate,
}: GameSidebarProps) {
  const { isAtRoot, isAtLeaf } = useMemo(() => {
    const tree = gameState.gameTree
    const currentId = tree.currentId ?? tree.root.id
    const currentNode = tree.get(currentId)
    return {
      isAtRoot: currentId === tree.root.id,
      isAtLeaf: currentNode == null || currentNode.children.length === 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, moveVersion])

  return (
    <div
      className="game-sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minWidth: 0,
      }}
    >
      <section className="sidebar-group game-progress-section" aria-label="대국 진행">
        <h2 className="sidebar-group-title">대국 진행</h2>
        {playbackBar}
        <PlayerCard gameState={gameState} moveVersion={moveVersion} />

        {gameMode === 'ai' && (
          <button
            id="ai-move-btn"
            style={primaryBtnStyle(isAiThinking)}
            disabled={isAiThinking}
            onClick={onAiMove}
          >
            {isAiThinking ? 'AI 생각중...' : 'AI Move'}
          </button>
        )}

        <div className="sidebar-game-actions">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={btnStyle(false)} onClick={onPass}>
              Pass
            </button>
            <button
              id="score-btn"
              style={btnStyle(!canScore || isScoring)}
              disabled={!canScore || isScoring}
              onClick={onScore}
            >
              {isScoring ? '계가 중...' : '계가'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={btnStyle(isAtRoot)}
              disabled={isAtRoot}
              onClick={onUndo}
            >
              Undo
            </button>
            <button
              style={btnStyle(isAtLeaf)}
              disabled={isAtLeaf}
              onClick={onRedo}
            >
              Redo
            </button>
          </div>
        </div>
      </section>

      {reviewPanel}

      {(gameMode === 'selfplay' && showCandidates && candidates.length > 0) ||
      showSummary ||
      gameMode === 'ai' ? (
        <section className="sidebar-group analysis-results-section" aria-label="분석 결과">
          <h2 className="sidebar-group-title">분석 결과</h2>
          {gameMode === 'selfplay' && showCandidates && (
            <CandidateMoves
              candidates={candidates}
              onSelectMove={onSelectCandidate}
              disabled={isAiThinking}
            />
          )}
          {showSummary && (
            <AnalysisSummary
              analysis={analysis}
              loading={analysisLoading}
              error={analysisError}
              durationMs={analysisDurationMs}
              settings={analysisSettings}
              metadata={analysisMetadata}
            />
          )}
          {gameMode === 'ai' && (
            <button
              id="ai-analysis-toggle"
              onClick={onToggleAiAnalysis}
              title={showAiAnalysis ? 'AI 분석 정보 끔' : 'AI 분석 정보 표시'}
              style={smallBtnStyle(showAiAnalysis, false)}
            >
              AI 분석
            </button>
          )}
          {gameMode === 'ai' && showAiAnalysis && (
            <AiAnalysisPanel stats={aiMoveStats} isThinking={isAiThinking} />
          )}
        </section>
      ) : null}
    </div>
  )
}
