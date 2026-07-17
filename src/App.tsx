/*
 * badukdojang - T6: Control Bar Integration
 * ControlBar (above board) + Shudan Goban rendering + go-board game logic.
 * Clicking an empty intersection places a stone. Illegal moves flash red border.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { SignMap } from '@sabaki/go-board'
import type { Map, Marker, Vertex } from '@sabaki/shudan'
import { Board, type ThemeName } from './components/Board.tsx'
import { ControlBar, type BoardSize } from './components/ControlBar.tsx'
import { createGameState } from './lib/gameState.ts'
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

export function App() {
  const [boardSize, setBoardSize] = useState<BoardSize>(19)
  const [gameState, setGameState] = useState(() => createGameState(19))
  const [signMap, setSignMap] = useState<SignMap>(() => gameState.getSignMap())
  const [flashTrigger, setFlashTrigger] = useState(0)
  const [showCoordinates, setShowCoordinates] = useState(true)
  const [themeName, setThemeName] = useState<ThemeName>('shinkaya')
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled())

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
      row[lx] = { type: 'circle' }
    }
    return map
  }, [signMap, gameState.lastMove])

  const handleVertexClick = (_evt: MouseEvent, vertex: Vertex) => {
    const oldCaptures = gameState.board.getCaptures(1) + gameState.board.getCaptures(-1)
    const success = gameState.makeMove(vertex)
    if (!success) {
      setFlashTrigger((prev) => prev + 1)
      return
    }
    const newCaptures = gameState.board.getCaptures(1) + gameState.board.getCaptures(-1)
    if (newCaptures > oldCaptures) {
      playCaptureSound(newCaptures - oldCaptures)
    } else {
      playStoneSound()
    }
    setSignMap(gameState.getSignMap())
  }

  const handleNewGame = () => {
    const newGameState = createGameState(boardSize)
    setGameState(newGameState)
    setSignMap(newGameState.getSignMap())
  }

  const handlePass = () => {
    gameState.pass()
    setSignMap(gameState.getSignMap())
  }

  const handleUndo = () => {
    const success = gameState.undo()
    if (success) {
      setSignMap(gameState.getSignMap())
    }
  }

  const handleRedo = () => {
    const success = gameState.redo()
    if (success) {
      setSignMap(gameState.getSignMap())
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
      />
      <Board
        signMap={signMap}
        boardSize={boardSize}
        markerMap={markerMap}
        onVertexClick={handleVertexClick}
        flashTrigger={flashTrigger}
        showCoordinates={showCoordinates}
        themeName={themeName}
        currentPlayer={gameState.currentPlayer}
      />
    </div>
  )
}