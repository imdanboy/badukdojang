/*
 * PlaybackBar — move navigation under the board (OGS action-bar style).
 * |◀ ◀ ▶ ▶| plus the current move counter. First/prev use undo,
 * next/last use redo semantics from GameState.
 */
import { useMemo } from 'react'
import type { GameState } from '../lib/gameState.ts'
import { getMoveList } from '../lib/gameTree.ts'

export interface PlaybackBarProps {
  gameState: GameState
  /** Bumped by the parent on every move/navigation to refresh derived state. */
  moveVersion: number
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
}

const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  opacity: disabled ? 0.4 : 1,
  background: '#3b3b5c',
  color: '#e0e0e0',
  lineHeight: 1,
})

export function PlaybackBar({
  gameState,
  moveVersion,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: PlaybackBarProps) {
  const { isAtRoot, isAtLeaf, moveCount } = useMemo(() => {
    const tree = gameState.gameTree
    const currentId = tree.currentId ?? tree.root.id
    const currentNode = tree.get(currentId)
    return {
      isAtRoot: currentId === tree.root.id,
      isAtLeaf: currentNode == null || currentNode.children.length === 0,
      moveCount: getMoveList(tree).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, moveVersion])

  return (
    <div
      className="playback-bar"
      role="group"
      aria-label="착수 탐색"
    >
      <button
        id="playback-first"
        style={navBtnStyle(isAtRoot)}
        disabled={isAtRoot}
        onClick={onFirst}
        title="첫 수로"
        aria-label="첫 수로"
      >
        ⏮
      </button>
      <button
        id="playback-prev"
        style={navBtnStyle(isAtRoot)}
        disabled={isAtRoot}
        onClick={onPrev}
        title="이전 수"
        aria-label="이전 수"
      >
        ◀
      </button>
      <span
        className="playback-counter"
        style={{ minWidth: '70px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      >
        Move {moveCount}
      </span>
      <button
        id="playback-next"
        style={navBtnStyle(isAtLeaf)}
        disabled={isAtLeaf}
        onClick={onNext}
        title="다음 수"
        aria-label="다음 수"
      >
        ▶
      </button>
      <button
        id="playback-last"
        style={navBtnStyle(isAtLeaf)}
        disabled={isAtLeaf}
        onClick={onLast}
        title="마지막 수로"
        aria-label="마지막 수로"
      >
        ⏭
      </button>
    </div>
  )
}
