import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { App } from './App.tsx'
import {
  ACTIVE_GAME_STORAGE_KEY,
  saveActiveGame,
} from './lib/autosave.ts'
import { appendMove, createGameTree } from './lib/gameTree.ts'

// Mock the KataGo adapter so tests don't hit the network.
vi.mock('./lib/engine/katagoAdapter.ts', async () => {
  return {
    requestMove: vi.fn(() => Promise.resolve([4, 4])),
    initializeEngine: vi.fn(() => Promise.resolve()),
    requestAnalysis: vi.fn(() => Promise.resolve({ bestMoves: [] })),
    abortOngoing: vi.fn(() => Promise.resolve()),
    sendCommand: vi.fn(() => Promise.resolve('')),
    setEngineParam: vi.fn(() => Promise.resolve()),
    setEngineRules: vi.fn(() => Promise.resolve()),
    checkHealth: vi.fn(() => Promise.resolve({ status: 'ok', humanModelAvailable: true })),
    restartEngine: vi.fn(() => Promise.resolve()),
    getEngineState: vi.fn(() => 'idle'),
    resetEngineState: vi.fn(),
    parseGTPVertex: vi.fn((gtp: string, boardSize?: number) => {
      if (gtp === 'pass') return 'pass'
      if (gtp === 'resign') return 'resign'
      const col = gtp[0]!.toUpperCase()
      const row = parseInt(gtp.slice(1), 10)
      const bs = boardSize ?? 19
      return [col.charCodeAt(0) - 'A'.charCodeAt(0), bs - row]
    }),
    requestScoring: vi.fn(() => Promise.resolve({
      rawScore: 'B+0.5',
      dead: [],
      alive: [],
      whiteTerritory: [],
      blackTerritory: [],
      komi: 6.5,
    })),
  }
})

// Mock sound module (Web Audio API is unavailable in jsdom).
vi.mock('./lib/sound.ts', () => ({
  playStoneSound: vi.fn(),
  playCaptureSound: vi.fn(),
  setSoundEnabled: vi.fn(),
  isSoundEnabled: vi.fn(() => false),
}))

// Mock Board so we can click vertices without Shudan rendering in jsdom.
vi.mock('./components/Board.tsx', () => {
  return {
    Board: (props: {
      boardSize: number
      onVertexClick?: (evt: MouseEvent, vertex: [number, number]) => void
      currentPlayer: 1 | -1
      aiGhostVertex?: [number, number] | null
      aiFlashVertex?: [number, number] | null
    }) => {
      const size = props.boardSize
      const vertices: React.JSX.Element[] = []
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          vertices.push(
            <button
              key={`${x}-${y}`}
              className="shudan-vertex"
              data-x={x}
              data-y={y}
              onClick={(e) => props.onVertexClick?.(e as unknown as MouseEvent, [x, y])}
            />,
          )
        }
      }
      return <div className="shudan-goban">{vertices}</div>
    },
  }
})

import * as katagoAdapter from './lib/engine/katagoAdapter.ts'

async function clickVertex(x: number, y: number, boardSize: number): Promise<void> {
  const index = y * boardSize + x
  const goban = document.querySelector('.shudan-goban')
  const vertices = goban
    ? goban.querySelectorAll('button')
    : document.querySelectorAll('button')
  const vertex = vertices[index]
  if (!vertex) throw new Error(`Vertex (${x},${y}) not found`)
  fireEvent.click(vertex)
}

/** Engine controls live inside the settings modal — open, toggle, close. */
function enableEngine(): void {
  fireEvent.click(document.getElementById('settings-button')!)
  fireEvent.click(document.getElementById('engine-toggle')!)
  fireEvent.click(document.getElementById('settings-close')!)
}

describe('App', () => {
  let requestMoveMock: ReturnType<typeof vi.fn>
  let requestAnalysisMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    requestMoveMock = katagoAdapter.requestMove as ReturnType<typeof vi.fn>
    requestAnalysisMock = katagoAdapter.requestAnalysis as ReturnType<typeof vi.fn>
    requestMoveMock.mockReset()
    requestAnalysisMock.mockReset()
    // Default: AI analysis suggests D5, then genmove plays at (4,4)
    requestAnalysisMock.mockResolvedValue({
      bestMoves: [{ move: 'D5', visits: 100, winrate: 0.5, scoreLead: 0 }],
    })
    requestMoveMock.mockResolvedValue([4, 4])
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  test('baseline: self-play mode places stones without AI interference', async () => {
    render(<App />)

    // Default mode is self-play
    expect(screen.getByText('놓아보기')).toBeTruthy()

    // Place a black stone at (3,3)
    await clickVertex(3, 3, 19)

    // Turn should flip to White
    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('White')

    // requestMove should NOT have been called
    expect(requestMoveMock).not.toHaveBeenCalled()
  })

  test('AI mode: human move triggers engine response', async () => {
    render(<App />)

    enableEngine()

    // Switch to AI mode
    fireEvent.click(screen.getByText('AI 대국'))

    // Place a black stone at (3,3)
    await clickVertex(3, 3, 19)

    // Wait for AI move to be requested
    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    // AI should have been asked to move as White (-1)
    expect(requestMoveMock).toHaveBeenCalledWith(
      expect.any(Object),
      -1,
      expect.any(Object),
    )

    // Wait for AI stone to appear (turn flips back to Black)
    await waitFor(() => {
      const turnIndicator = screen.getByText(/To Play:/)
      expect(turnIndicator.textContent).toContain('Black')
    })
  })

  test('AI mode: engine returns pass → gameState.pass is called', async () => {
    requestMoveMock.mockResolvedValue('pass')

    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))
    await clickVertex(3, 3, 19)

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    // After human move (Black) + AI pass (White), turn should be Black again
    await waitFor(() => {
      const turnIndicator = screen.getByText(/To Play:/)
      expect(turnIndicator.textContent).toContain('Black')
    })
  })

  test('engine offline: warning toast when switching to AI mode with engine off', async () => {
    render(<App />)

    // Engine is off by default (enabled: false)
    fireEvent.click(screen.getByText('AI 대국'))

    // Toast should appear (the AnalysisPanel disabled state also displays a
    // "엔진이 꺼져 있습니다" message, so query by role=alert to disambiguate).
    await waitFor(() => {
      const toast = screen.getByRole('alert')
      expect(toast.textContent).toContain('엔진이 꺼져 있습니다')
    })
  })

  test('race condition: rapid clicks do not trigger multiple AI moves', async () => {
    // Delay the AI response so we can click rapidly while it's "thinking"
    requestMoveMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([4, 4]), 100)),
    )

    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))

    // Click two different vertices rapidly
    await clickVertex(3, 3, 19)
    await clickVertex(5, 5, 19)

    // Only one AI request should have been made
    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })
  })

  test('mode switch: self-play → AI preserves the game, White to play starts AI immediately', async () => {
    const confirmMock = vi.spyOn(window, 'confirm')

    render(<App />)

    // Place a stone in self-play mode (White to play next)
    await clickVertex(3, 3, 19)
    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('White')

    enableEngine()

    // Switch to AI mode — no confirmation, no reset
    fireEvent.click(screen.getByText('AI 대국'))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByText('Move 1')).toBeTruthy()

    // White to play: the AI must answer immediately
    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })
    expect(requestMoveMock).toHaveBeenCalledWith(
      expect.any(Object),
      -1,
      expect.any(Object),
    )

    // After the AI move, turn is Black again and the board keeps both moves
    await waitFor(() => {
      const turn = screen.getByText(/To Play:/)
      expect(turn.textContent).toContain('Black')
    })
    expect(screen.getByText('Move 2')).toBeTruthy()
    expect(confirmMock).not.toHaveBeenCalled()

    confirmMock.mockRestore()
  })

  test('mode switch: self-play → AI with Black to play waits for the user', async () => {
    render(<App />)

    // Build a non-blank position that is Black to play: place a stone,
    // then undo back to the root (tree stays non-blank).
    await clickVertex(3, 3, 19)
    fireEvent.click(screen.getByText('Undo'))

    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('Black')

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))

    // Black to play: no AI request yet — wait for the user's move.
    expect(requestMoveMock).not.toHaveBeenCalled()
    expect(screen.getByText('Move 0')).toBeTruthy()
  })

  test('mode switch: answering AI then returning to self-play keeps the game and ignores nothing', async () => {
    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))
    await clickVertex(3, 3, 19)

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText(/To Play:/).textContent).toContain('Black')
    })

    // Switch back to self-play — no confirmation, game preserved.
    const confirmMock = vi.spyOn(window, 'confirm')
    fireEvent.click(screen.getByText('놓아보기'))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByText('Move 2')).toBeTruthy()

    // Playing in self-play must not spawn an additional AI request.
    await clickVertex(4, 4, 19)
    await waitFor(() => {
      expect(screen.getByText(/To Play:/).textContent).toContain('Black')
    })
    expect(requestMoveMock).toHaveBeenCalledTimes(1)

    confirmMock.mockRestore()
  })

  test('mode switch: in-flight AI request is abandoned when switching to self-play mid-thinking', async () => {
    const abortMock = katagoAdapter.abortOngoing as ReturnType<typeof vi.fn>
    requestMoveMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([4, 4]), 150)),
    )

    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))
    await clickVertex(3, 3, 19)

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    // Switch to self-play before the AI response lands.
    fireEvent.click(screen.getByText('놓아보기'))
    expect(abortMock).toHaveBeenCalled()

    // Let the pending AI response resolve — it must NOT be applied.
    await waitFor(() => {
      expect(screen.getByText('Move 1')).toBeTruthy()
    })
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Only the human stone exists; turn is still White (AI stone invalidated).
    expect(screen.getByText('Move 1')).toBeTruthy()
    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('White')
  })

  test('AI Move button manually triggers engine move', async () => {
    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))

    // Place human move
    await clickVertex(3, 3, 19)

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    // Reset mock to track the manual trigger
    requestMoveMock.mockClear()

    // Click AI Move button
    fireEvent.click(screen.getByText('AI Move'))

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })
  })

  test('AI mode: engine returns resign → AI 항복 toast', async () => {
    requestMoveMock.mockResolvedValue('resign')

    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))
    await clickVertex(3, 3, 19)

    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      const toast = screen.getByText(/AI 항복/)
      expect(toast).toBeTruthy()
    })
  })

  test('AI mode: engine returns invalid vertex → AI 오류 toast, game continues', async () => {
    // Simulate an illegal move (same spot human just played)
    requestMoveMock.mockResolvedValue([3, 3])

    render(<App />)

    enableEngine()
    fireEvent.click(screen.getByText('AI 대국'))

    // Human plays at (3,3)
    await clickVertex(3, 3, 19)

    // AI tries to play at (3,3) again — illegal
    await waitFor(() => {
      expect(requestMoveMock).toHaveBeenCalledTimes(1)
    })

    // Toast should appear
    await waitFor(() => {
      const toast = screen.getByText(/AI 오류/)
      expect(toast).toBeTruthy()
    })

    // Turn should still be White (AI failed to move)
    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('White')
  })

  test('scoring: double pass enables 계가 button, click shows modal', async () => {
    const requestScoringMock = katagoAdapter.requestScoring as ReturnType<typeof vi.fn>
    requestScoringMock.mockResolvedValue({
      rawScore: 'B+3.5',
      dead: [],
      alive: [],
      whiteTerritory: [],
      blackTerritory: [[1, 1]],
      komi: 6.5,
    })

    render(<App />)

    const scoreBtn = screen.getByText('계가') as HTMLButtonElement
    expect(scoreBtn.disabled).toBe(true)

    fireEvent.click(screen.getByText('Pass'))
    fireEvent.click(screen.getByText('Pass'))

    await waitFor(() => {
      const enabledBtn = screen.getByText('계가') as HTMLButtonElement
      expect(enabledBtn.disabled).toBe(false)
    })

    fireEvent.click(screen.getByText('계가'))

    await waitFor(() => {
      expect(screen.getByText('계가 결과')).toBeTruthy()
    })

    expect(requestScoringMock).toHaveBeenCalledTimes(1)
  })
})

describe('App autosave — active-game recovery draft', () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test('placing a move persists the draft after the state change', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)

    const raw = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const draft = JSON.parse(raw!) as { version: number; sgf: string; gameMode: string }
    expect(draft.version).toBe(1)
    expect(draft.sgf).toContain('B[dd]')
    expect(draft.gameMode).toBe('selfplay')
  })

  test('startup restores the previous game (sleep-reload recovery)', async () => {
    // Seed a recoverable game: B(3,3) played, AI mode.
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)
    saveActiveGame(tree, { boardSize: 19, gameMode: 'ai' })

    render(<App />)

    // Restored position: move 1 played, White to move (no AI move fires
    // because the engine key was not enabled in localStorage).
    await waitFor(() => {
      const turnIndicator = screen.getByText(/To Play:/)
      expect(turnIndicator.textContent).toContain('White')
    })
    expect(screen.getByText('Move 1')).toBeTruthy()
    expect(katagoAdapter.requestMove as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  test('starting a fresh game over a non-empty game confirms and clears the draft', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<App />)
    await clickVertex(3, 3, 19)

    fireEvent.click(screen.getByText('New Game'))
    fireEvent.click(document.getElementById('new-game-start')!)

    // Declined: game and draft unchanged, modal stays open.
    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining('삭제'),
    )
    expect(localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toContain('B[dd]')

    // Accepted: board resets and the draft is intentionally cleared.
    confirmMock.mockReturnValue(true)
    fireEvent.click(document.getElementById('new-game-start')!)
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })
    expect(localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull()

    confirmMock.mockRestore()
  })

  test('game-mode change preserves the draft even when the cursor is at root of a non-empty game', async () => {
    render(<App />)
    await clickVertex(3, 3, 19)

    // Navigate back to root — the tree still holds content, which must be
    // kept verbatim (no confirmation, no reset).
    fireEvent.click(screen.getByText('Undo'))
    fireEvent.click(screen.getByText('AI 대국'))

    // Mode switched; the draft keeps the same tree with the new mode.
    const raw = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)!
    expect(raw).toContain('B[dd]')
    expect(JSON.parse(raw).cursorPath).toEqual([])
    expect(JSON.parse(raw).gameMode).toBe('ai')
    expect(screen.getByText('AI 대국')).toBeTruthy()
  })

  test('starting a fresh game on a blank board needs no confirmation', async () => {
    const confirmMock = vi.spyOn(window, 'confirm')

    render(<App />)

    fireEvent.click(screen.getByText('New Game'))
    fireEvent.click(document.getElementById('new-game-start')!)

    expect(confirmMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })

    confirmMock.mockRestore()
  })
})
