/*
 * badukdojang - T2: Interactive Goban
 * Board size selector (9/13/19) + Shudan Goban rendering.
 * onVertexClick logs the clicked vertex; stone placement is T3.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import GoBoard from '@sabaki/go-board'
import type { Map, Marker, Vertex } from '@sabaki/shudan'
import { Board } from './components/Board.tsx'

type BoardSize = 9 | 13 | 19

export function App() {
  const [boardSize, setBoardSize] = useState<BoardSize>(19)
  const [board, setBoard] = useState<GoBoard>(
    () => GoBoard.fromDimensions(19, 19),
  )
  const [lastMove, setLastMove] = useState<Vertex | null>(null)

  // Re-initialize an empty board whenever the size changes.
  useEffect(() => {
    setBoard(GoBoard.fromDimensions(boardSize, boardSize))
    setLastMove(null)
  }, [boardSize])

  // Build markerMap: a 2D array (indexed [y][x]) with a single 'point'
  // marker at the last-move position, null everywhere else.
  const markerMap = useMemo<Map<Marker | null> | undefined>(() => {
    if (lastMove === null) return undefined
    const [lx, ly] = lastMove
    const map: Map<Marker | null> = board.signMap.map((row) =>
      row.map(() => null),
    )
    const row = map[ly]
    if (row !== undefined) {
      row[lx] = { type: 'point' }
    }
    return map
  }, [board, lastMove])

  const handleVertexClick = (_evt: MouseEvent, vertex: Vertex) => {
    console.log(`[${vertex[0]}, ${vertex[1]}]`)
  }

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
      <label
        for="board-size-select"
        style={{ fontSize: '0.875rem', opacity: 0.7 }}
      >
        Board Size
      </label>
      <select
        id="board-size-select"
        value={String(boardSize)}
        onChange={(e) => {
          const value = Number(
            (e.currentTarget as HTMLSelectElement).value,
          )
          setBoardSize(value as BoardSize)
        }}
        style={{ padding: '0.25rem 0.5rem' }}
      >
        <option value="9">9 × 9</option>
        <option value="13">13 × 13</option>
        <option value="19">19 × 19</option>
      </select>
      <Board
        signMap={board.signMap}
        boardSize={boardSize}
        markerMap={markerMap}
        onVertexClick={handleVertexClick}
      />
    </div>
  )
}