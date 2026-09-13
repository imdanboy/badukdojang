/*
 * GameSidebar — core game controls beside the board (OGS right-col style).
 * Player card (turn + captures), action buttons, SGF I/O, and the
 * analysis section (winrate bar + candidate moves). Only what the
 * active game needs; all configuration lives in SettingsModal.
 */
import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Vertex } from '@kaya/goboard'
import { AnalysisPanel } from './AnalysisPanel.tsx'
import { CandidateMoves } from './CandidateMoves.tsx'
import type { CandidateMove } from './CandidateMoves.tsx'
import type { AnalyzeResponse } from '../lib/engine/types.ts'
import type { GameState } from '../lib/gameState.ts'
import type { GameMode } from '../lib/types.ts'

export interface GameSidebarProps {
  gameState: GameState
  /** Bumped by the parent on every move/navigation to refresh derived state. */
  moveVersion: number
  gameMode: GameMode
  isAiThinking: boolean
  onAiMove: () => void
  onPass: () => void
  onUndo: () => void
  onRedo: () => void
  onNewGameRequest: () => void
  canScore: boolean
  isScoring: boolean
  onScore: () => void
  onSaveSGF: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  showOwnership: boolean
  hasOwnership: boolean
  onToggleOwnership: () => void
  analysisEnabled: boolean
  onToggleAnalysis: () => void
  analysis: AnalyzeResponse | null
  analysisLoading: boolean
  analysisError: string | null
  engineEnabled: boolean
  candidates: readonly CandidateMove[]
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

const linkBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  background: 'transparent',
  color: '#8a8ab0',
  textDecoration: 'underline',
}

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

  return (
    <div
      className="player-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: '#1a1a2e',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '14px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: isBlackTurn ? '#1a1a1a' : '#f0f0f0',
          border: '1px solid #555',
          flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span id="turn-indicator">
          To Play: {isBlackTurn ? 'Black' : 'White'}
        </span>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>
          잡은 돌 — 흑 {blackCaptures} · 백 {whiteCaptures}
        </span>
      </div>
    </div>
  )
}

export function GameSidebar({
  gameState,
  moveVersion,
  gameMode,
  isAiThinking,
  onAiMove,
  onPass,
  onUndo,
  onRedo,
  onNewGameRequest,
  canScore,
  isScoring,
  onScore,
  onSaveSGF,
  onFileChange,
  showOwnership,
  hasOwnership,
  onToggleOwnership,
  analysisEnabled,
  onToggleAnalysis,
  analysis,
  analysisLoading,
  analysisError,
  engineEnabled,
  candidates,
  onSelectCandidate,
}: GameSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleLoadClick = () => {
    fileInputRef.current?.click()
  }

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

      {/* Core game actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px 16px',
          background: '#1a1a2e',
          borderRadius: '8px',
        }}
      >
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
        <button style={primaryBtnStyle(false)} onClick={onNewGameRequest}>
          New Game
        </button>
      </div>

      {/* SGF I/O — quiet, non-core */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          padding: '6px 10px',
          background: '#1a1a2e',
          borderRadius: '8px',
        }}
      >
        <button style={linkBtnStyle} onClick={onSaveSGF}>
          Save SGF
        </button>
        <span style={{ opacity: 0.3 }}>|</span>
        <button style={linkBtnStyle} onClick={handleLoadClick}>
          Load SGF
        </button>
        <input
          ref={fileInputRef as RefObject<HTMLInputElement>}
          type="file"
          accept=".sgf,text/plain"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Analysis section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            id="analysis-toggle"
            onClick={onToggleAnalysis}
            title={analysisEnabled ? 'Analysis on' : 'Analysis off'}
            style={smallBtnStyle(analysisEnabled, false)}
          >
            Analysis
          </button>
          <button
            id="ownership-toggle"
            onClick={onToggleOwnership}
            disabled={!hasOwnership}
            title={
              hasOwnership
                ? showOwnership
                  ? 'Ownership heatmap on'
                  : 'Ownership heatmap off'
                : 'No analysis data yet'
            }
            style={smallBtnStyle(showOwnership, !hasOwnership)}
          >
            Ownership
          </button>
        </div>
        <AnalysisPanel
          analysis={analysis}
          loading={analysisLoading}
          error={analysisError}
          engineEnabled={engineEnabled}
        />
      </div>

      {gameMode === 'selfplay' && (
        <CandidateMoves
          candidates={candidates}
          onSelectMove={onSelectCandidate}
          disabled={isAiThinking}
        />
      )}
    </div>
  )
}
