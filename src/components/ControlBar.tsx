/*
 * ControlBar - Horizontal control bar above the board.
 * Contains: New Game, Pass, Undo, Redo, Save SGF, Load SGF,
 * Coordinates toggle, Board Size select, Move counter, Turn indicator.
 * Dark background (#1a1a2e) to make the wood board pop.
 */
import { useRef } from 'preact/hooks'
import type { RefObject } from 'preact'
import type { GameState } from '../lib/gameState.ts'
import { getMoveList } from '../lib/gameTree.ts'

export type BoardSize = 9 | 13 | 19

export interface ControlBarProps {
  gameState: GameState
  boardSize: BoardSize
  onBoardSizeChange: (size: BoardSize) => void
  onNewGame: () => void
  onPass: () => void
  onUndo: () => void
  onRedo: () => void
  onSaveSGF: () => void
  onFileChange: (e: Event) => void
  showCoordinates: boolean
  onToggleCoordinates: () => void
}

const btnStyle = (disabled: boolean): preact.JSX.CSSProperties => ({
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  opacity: disabled ? 0.5 : 1,
  background: '#3b3b5c',
  color: '#e0e0e0',
})

export function ControlBar({
  gameState,
  boardSize,
  onBoardSizeChange,
  onNewGame,
  onPass,
  onUndo,
  onRedo,
  onSaveSGF,
  onFileChange,
  showCoordinates,
  onToggleCoordinates,
}: ControlBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tree = gameState.gameTree
  const currentId = tree.currentId ?? tree.root.id
  const isAtRoot = currentId === tree.root.id

  const currentNode = tree.get(currentId)
  const isAtLeaf = currentNode == null || currentNode.children.length === 0

  const moveCount = getMoveList(tree).length
  const isBlackTurn = gameState.currentPlayer === 1

  const handleLoadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: '#1a1a2e',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '14px',
        flexWrap: 'wrap',
      }}
    >
      {/* Turn indicator with colored circle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: isBlackTurn ? '#1a1a1a' : '#f0f0f0',
            border: '1px solid #555',
          }}
        />
        To Play: {isBlackTurn ? 'Black' : 'White'}
      </div>

      <div style={{ width: '1px', height: '24px', background: '#3b3b5c' }} />

      {/* Move counter */}
      <div>Move {moveCount}</div>

      <div style={{ width: '1px', height: '24px', background: '#3b3b5c' }} />

      {/* Board Size select */}
      <label for="board-size-select" style={{ opacity: 0.7 }}>
        Board Size
      </label>
      <select
        id="board-size-select"
        value={String(boardSize)}
        onChange={(e) => {
          const value = Number(
            (e.currentTarget as HTMLSelectElement).value,
          )
          onBoardSizeChange(value as BoardSize)
        }}
        style={{
          padding: '6px 8px',
          border: '1px solid #3b3b5c',
          borderRadius: '4px',
          background: '#2a2a4e',
          color: '#e0e0e0',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        <option value="9">9 x 9</option>
        <option value="13">13 x 13</option>
        <option value="19">19 x 19</option>
      </select>

      <div style={{ width: '1px', height: '24px', background: '#3b3b5c' }} />

      {/* Action buttons */}
      <button style={btnStyle(false)} onClick={onNewGame}>
        New Game
      </button>
      <button style={btnStyle(false)} onClick={onPass}>
        Pass
      </button>
      <button
        style={btnStyle(!isAtRoot)}
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
      <button style={btnStyle(false)} onClick={onSaveSGF}>
        Save SGF
      </button>
      <button style={btnStyle(false)} onClick={handleLoadClick}>
        Load SGF
      </button>
      <input
        ref={fileInputRef as RefObject<HTMLInputElement>}
        type="file"
        accept=".sgf,text/plain"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      <div style={{ width: '1px', height: '24px', background: '#3b3b5c' }} />

      {/* Coordinates toggle */}
      <label
        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={showCoordinates}
          onChange={onToggleCoordinates}
          style={{ cursor: 'pointer' }}
        />
        Coordinates
      </label>
    </div>
  )
}