/*
 * badukdojang - T3: Game Rules Integration
 * Board size selector (9/13/19) + Shudan Goban rendering + go-board game logic.
 * Clicking an empty intersection places a stone. Illegal moves flash red border.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { SignMap } from '@sabaki/go-board'
import type { Map, Marker, Vertex } from '@sabaki/shudan'
import { Board } from './components/Board.tsx'
import { createGameState } from './lib/gameState.ts'

type BoardSize = 9 | 13 | 19

export function App() {
  const [boardSize, setBoardSize] = useState<BoardSize>(19)
  const [gameState, setGameState] = useState(() => createGameState(19))
  const [signMap, setSignMap] = useState<SignMap>(() => gameState.getSignMap())
  const [flashTrigger, setFlashTrigger] = useState(0)

  // Re-initialize game state whenever the size changes.
  useEffect(() => {
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
  }, [boardSize])

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
      row[lx] = { type: 'point' }
    }
    return map
  }, [signMap, gameState.lastMove])

  const handleVertexClick = (_evt: MouseEvent, vertex: Vertex) => {
    const success = gameState.makeMove(vertex)
    if (!success) {
      setFlashTrigger((prev) => prev + 1)
      return
    }
    setSignMap(gameState.getSignMap())
  }

  const handlePass = () => {
    gameState.pass()
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
        signMap={signMap}
        boardSize={boardSize}
        markerMap={markerMap}
        onVertexClick={handleVertexClick}
        flashTrigger={flashTrigger}
      />
      <button
        onClick={handlePass}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        Pass
      </button>
    </div>
  )
}
