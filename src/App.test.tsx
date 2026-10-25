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
    requestAnalysisForPath: vi.fn(() =>
      Promise.resolve({ id: 'batch', winrate: 0.5, scoreLead: 0 }),
    ),
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
      markerMap?: Array<Array<{ type?: string; label?: string } | null>>
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
      // Expose label markers (move numbers) for assertions.
      const labels: React.JSX.Element[] = []
      props.markerMap?.forEach((row, y) =>
        row.forEach((marker, x) => {
          if (marker !== null && marker.type === 'label' && marker.label) {
            labels.push(
              <span
                key={`label-${x}-${y}`}
                className="board-move-label"
                data-x={x}
                data-y={y}
              >
                {marker.label}
              </span>,
            )
          }
        }),
      )
      return (
        <div className="shudan-goban">
          {vertices}
          <div data-testid="board-markers">{labels}</div>
        </div>
      )
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

describe('App layout — three columns, playback in the right function column', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  test('playback controls render exactly once, inside the right column (not under the board)', () => {
    render(<App />)

    const sideCol = document.querySelector('.side-col')
    expect(sideCol).toBeTruthy()
    for (const id of ['#playback-first', '#playback-prev', '#playback-next', '#playback-last']) {
      const matches = document.querySelectorAll(id)
      expect(matches.length).toBe(1)
      expect(sideCol!.contains(matches[0]!)).toBe(true)
    }
    // The board column must no longer contain the playback bar.
    const boardCol = document.querySelector('.board-col')!
    expect(boardCol.querySelector('#playback-first')).toBeNull()
  })

  test('left rail is a reserved, empty, non-interactive element', () => {
    render(<App />)

    const rail = document.querySelector('.board-rail') as HTMLElement | null
    expect(rail).toBeTruthy()
    expect(rail!.getAttribute('aria-hidden')).toBe('true')
    expect(rail!.childElementCount).toBe(0)
    expect(rail!.textContent).toBe('')
  })

  test('playback next/last navigate after undoing a move', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    fireEvent.click(screen.getByText('Undo'))
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })

    fireEvent.click(document.getElementById('playback-next')!)
    await waitFor(() => {
      expect(screen.getByText('Move 1')).toBeTruthy()
    })

    fireEvent.click(document.getElementById('playback-last')!)
    expect(screen.getByText('Move 1')).toBeTruthy()

    fireEvent.click(document.getElementById('playback-first')!)
    expect(screen.getByText('Move 0')).toBeTruthy()
    expect(
      (document.getElementById('playback-first') as HTMLButtonElement).disabled,
    ).toBe(true)
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

describe('Review — move numbers on stones (selfplay/놓아보기)', () => {
  function moveLabels(): Map<string, string> {
    const map = new Map<string, string>()
    document.querySelectorAll<HTMLElement>('.board-move-label').forEach((el) => {
      map.set(`${el.dataset.x},${el.dataset.y}`, el.textContent ?? '')
    })
    return map
  }

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  test('all mode: numbers appear on the stones of the current line, newest explored included', async () => {
    render(<App />)

    // Numbering is hidden by default (existing full numbering = explicit
    // 'all' mode via the 전체 번호 button).
    expect(moveLabels().size).toBe(0)
    fireEvent.click(screen.getByText('전체 번호'))

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)

    let labels = moveLabels()
    expect(labels.get('3,3')).toBe('1')
    expect(labels.get('4,4')).toBe('2')

    // Explore: undo and play a different second move — numbering follows
    // the new line; the abandoned stone is off the board.
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(5, 5, 19)

    labels = moveLabels()
    expect(labels.get('3,3')).toBe('1')
    expect(labels.get('5,5')).toBe('2')
    expect(labels.has('4,4')).toBe(false)
  })

  test('all mode labels disappear in AI mode and return in selfplay', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('전체 번호'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')

    fireEvent.click(screen.getByText('AI 대국'))
    expect(moveLabels().size).toBe(0)

    // And come back in selfplay.
    fireEvent.click(screen.getByText('놓아보기'))
    expect(moveLabels().get('3,3')).toBe('1')
  })
})

describe('Review — move-number display modes', () => {
  function moveLabels(): Map<string, string> {
    const map = new Map<string, string>()
    document.querySelectorAll<HTMLElement>('.board-move-label').forEach((el) => {
      map.set(`${el.dataset.x},${el.dataset.y}`, el.textContent ?? '')
    })
    return map
  }

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  test('initially hidden: no labels before a numbering button is used', async () => {
    render(<App />)
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    expect(moveLabels().size).toBe(0)
  })

  test('all mode: re-clicking the active button turns numbering off', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('전체 번호'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')

    // Re-click = off (back to hidden).
    fireEvent.click(screen.getByText('전체 번호'))
    expect(moveLabels().size).toBe(0)
  })

  test('from-current mode: the selected node counts as 1, earlier labels hidden', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    // Back to the move-2 node → "여기부터" anchors numbering there.
    fireEvent.click(screen.getByText('Undo'))
    fireEvent.click(screen.getByText('여기부터'))

    let labels = moveLabels()
    expect(labels.get('4,4')).toBe('1') // anchor's own move = 1
    expect(labels.get('5,5')).toBeUndefined() // before anchor: off the board anyway
    expect(labels.get('3,3')).toBeUndefined() // earlier move — label hidden

    // Descendants continue the counting (2, 3, …).
    fireEvent.click(document.getElementById('playback-next')!)
    labels = moveLabels()
    expect(labels.get('5,5')).toBe('2')
    expect(labels.get('3,3')).toBeUndefined()

    // Re-click turns numbering off.
    fireEvent.click(screen.getByText('여기부터'))
    expect(moveLabels().size).toBe(0)
  })

  test('from-current at root: the next move is 1', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('여기부터'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')
  })

  test('mode switch: clicking the other numbering button switches modes', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('전체 번호'))
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    expect(moveLabels().get('3,3')).toBe('1')
    expect(moveLabels().get('4,4')).toBe('2')

    // Switch to from-current anchored at the latest node…
    fireEvent.click(screen.getByText('여기부터'))
    let labels = moveLabels()
    expect(labels.get('4,4')).toBe('1')
    expect(labels.get('3,3')).toBeUndefined()

    // …and back to all numbering.
    fireEvent.click(screen.getByText('전체 번호'))
    labels = moveLabels()
    expect(labels.get('3,3')).toBe('1')
    expect(labels.get('4,4')).toBe('2')
  })

  test('branch navigation: a sibling branch outside the anchor subtree shows no labels', async () => {
    render(<App />)

    // Main line m1(3,3) m2(4,4) m3(5,5); fork a variation from m2.
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    // Anchor = variation tip (current node).
    fireEvent.click(screen.getByText('여기부터'))
    let labels = moveLabels()
    expect(labels.get('6,6')).toBe('1') // anchor's own move = 1

    // Jump to the main-line tip — the anchor is NOT an ancestor of that
    // path, so nothing may be mislabeled over there.
    fireEvent.click(document.querySelector('[data-tree-node="2"]')!)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })
    expect(moveLabels().size).toBe(0)
    expect(
      document.getElementById('move-number-anchor-hint')?.textContent,
    ).toContain('경로 밖')

    // Turn numbering off and pick a new start point on this branch:
    // first re-click ends the old anchor…
    fireEvent.click(screen.getByText('여기부터'))
    expect(document.getElementById('move-number-anchor-hint')).toBeNull()
    expect(moveLabels().size).toBe(0)

    // …then clicking again re-anchors numbering at the CURRENT node.
    fireEvent.click(screen.getByText('여기부터'))
    labels = moveLabels()
    expect(labels.get('5,5')).toBe('1')
    expect(labels.get('3,3')).toBeUndefined()
    expect(
      document.getElementById('move-number-anchor-hint')?.textContent,
    ).toContain('선택 노드부터')
  })

  test('starting a new game resets the numbering mode and stale anchor', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    fireEvent.click(screen.getByText('여기부터'))
    expect(moveLabels().get('4,4')).toBe('1')

    // New game: numbering must be hidden again — no stale anchor applies.
    fireEvent.click(screen.getByText('New Game'))
    fireEvent.click(document.getElementById('new-game-start')!)
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })
    expect(moveLabels().size).toBe(0)
    expect(document.getElementById('move-number-anchor-hint')).toBeNull()

    // Numbering works again on the fresh tree.
    await clickVertex(3, 3, 19)
    fireEvent.click(screen.getByText('여기부터'))
    expect(moveLabels().get('3,3')).toBe('1')

    confirmMock.mockRestore()
  })

  test('loading an SGF resets the numbering mode (no stale node ids)', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    fireEvent.click(screen.getByText('여기부터'))
    expect(moveLabels().get('4,4')).toBe('1')

    // Replacing the game with an SGF resets the anchor…
    const sgf = '(;FF[4]GM[1]SZ[19];B[pd];W[dc];B[ce])'
    const file = new File([sgf], 'game.sgf', { type: 'text/plain' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })
    expect(moveLabels().size).toBe(0)
    expect(document.getElementById('move-number-anchor-hint')).toBeNull()
    // …and explicit numbering after the load uses the parsed tree correctly.
    fireEvent.click(screen.getByText('전체 번호'))
    expect(moveLabels().size).toBe(3)
  })
})

describe('Review — game tree navigation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  test('tree shows the full structure; clicking a node navigates the board', async () => {
    render(<App />)

    // m1 → m2 → m3, then explore a second m2 (variation).
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    const panel = document.querySelector('[data-testid="game-tree-panel"]')!
    // root + m1 + m2 + m3 + m2' = 5 nodes
    expect(panel.querySelectorAll('[data-tree-node]').length).toBe(5)

    // Click the main-line tip (m3): Move 3, White to play.
    const m3Node = panel.querySelector('[data-tree-node="2"]')!
    fireEvent.click(m3Node)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })
    expect(screen.getByText(/To Play:/).textContent).toContain('White')

    // Click the variation tip (m2' — path m1→m2→m2' = 3 moves, White to play).
    fireEvent.click(panel.querySelector('[data-tree-node="3"]')!)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })
    expect(screen.getByText(/To Play:/).textContent).toContain('White')

    // Click the root: Move 0, empty board.
    fireEvent.click(panel.querySelector('[data-tree-node="root"]')!)
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })
    expect(screen.getByText(/To Play:/).textContent).toContain('Black')
  })

  test('undo/redo stay consistent after tree navigation; autosave keeps the cursor', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    // Jump to the main-line tip (m3, node id 2).
    fireEvent.click(document.querySelector('[data-tree-node="2"]')!)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })

    // Undo from there walks the main line backward.
    fireEvent.click(screen.getByText('Undo'))
    expect(screen.getByText('Move 2')).toBeTruthy()
    fireEvent.click(document.getElementById('playback-next')!)
    expect(screen.getByText('Move 3')).toBeTruthy()

    // Autosave persisted the selected branch (cursorPath → node id 2).
    const raw = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)!
    expect(JSON.parse(raw).cursorPath).toEqual([0, 0, 0])
  })
})

describe('Review — full-tree batch analysis + winrate graph', () => {
  let requestAnalysisForPathMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    requestAnalysisForPathMock = katagoAdapter.requestAnalysisForPath as ReturnType<typeof vi.fn>
    requestAnalysisForPathMock.mockReset()
    // KataGo winrate is player-to-move perspective: 0.7 for every position.
    requestAnalysisForPathMock.mockResolvedValue({
      id: 'batch',
      winrate: 0.7,
      scoreLead: 0,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  test('analyzes all branches with progress, then charts the selected branch', async () => {
    render(<App />)
    enableEngine()

    // 3 main-line moves + 1 variation after move 2 → 4 positions.
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    fireEvent.click(document.getElementById('tree-analysis-start')!)

    await waitFor(() => {
      expect(document.getElementById('tree-analysis-status')?.textContent).toContain(
        '전체 분석 완료',
      )
    })
    expect(requestAnalysisForPathMock).toHaveBeenCalledTimes(4)
    // The last request replays the variation's full path: m1→m2→m2'.
    // (Undo from move 3 lands on move 2 → the explored move is Black's.)
    const lastCallMoves = requestAnalysisForPathMock.mock.calls[3]![1] as Array<{
      vertex: [number, number] | 'pass'
      sign: number
    }>
    expect(lastCallMoves).toHaveLength(3)
    expect(lastCallMoves[2]).toEqual({ vertex: [6, 6], sign: 1 })

    // Graph appears for the current (variation) branch: 3 points.
    const graph = document.getElementById('winrate-graph')!
    const points = graph.querySelectorAll('[data-winrate-point]')
    expect(points.length).toBe(3)
    // Black perspective: after move 1 White is to play → 1-0.7 = 0.3.
    expect(points[0]!.getAttribute('data-winrate')).toBe('0.300')
    // After move 2 Black is to play → 0.7.
    expect(points[1]!.getAttribute('data-winrate')).toBe('0.700')

    // Navigate to the main-line tip; the graph follows the branch.
    fireEvent.click(document.querySelector('[data-tree-node="2"]')!)
    await waitFor(() => {
      const mainPoints = document.querySelectorAll('[data-winrate-point]')
      return mainPoints.length === 3 && mainPoints[2]!.getAttribute('data-move-number') === '3'
    })
    // Same depths → same Black-perspective values on the other branch.
    const mainPoints = document.querySelectorAll('[data-winrate-point]')
    expect(mainPoints[1]!.getAttribute('data-winrate')).toBe('0.700')
    expect(mainPoints[2]!.getAttribute('data-winrate')).toBe('0.300')

    // Clicking a graph point navigates to that node.
    fireEvent.click(mainPoints[0]!)
    await waitFor(() => {
      expect(screen.getByText('Move 1')).toBeTruthy()
    })
  })

  test('cancel stops the run and reports the partial progress', async () => {
    requestAnalysisForPathMock.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    )

    render(<App />)
    enableEngine()

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)

    fireEvent.click(document.getElementById('tree-analysis-start')!)

    await waitFor(() => {
      expect(document.getElementById('tree-analysis-progress')).toBeTruthy()
    })
    expect(document.getElementById('tree-analysis-cancel')).toBeTruthy()

    fireEvent.click(document.getElementById('tree-analysis-cancel')!)

    await waitFor(() => {
      expect(document.getElementById('tree-analysis-status')?.textContent).toContain('취소됨')
    })
    expect(katagoAdapter.abortOngoing as ReturnType<typeof vi.fn>).toHaveBeenCalled()
  })

  test('button is disabled while the engine is off', () => {
    render(<App />)
    const btn = document.getElementById('tree-analysis-start') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  test('SGF-embedded KA positions are reused with zero engine calls and plotted', async () => {
    render(<App />)
    enableEngine()

    // 5 moves; KA embedded on the FIRST move node (winrate 0.55,
    // player-to-move perspective).
    const sgf =
      '(;FF[4]GM[1]SZ[19];B[pd]KA[{"w":0.55,"s":2.5,"v":80}];W[dc];B[ce];W[ed];B[de])'
    const file = new File([sgf], 'game.sgf', { type: 'text/plain' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(screen.getByText('Move 5')).toBeTruthy()
    })

    fireEvent.click(document.getElementById('tree-analysis-start')!)
    await waitFor(() => {
      expect(document.getElementById('tree-analysis-status')?.textContent).toContain(
        '전체 분석 완료',
      )
    })
    // 5 positions total, 1 primed from KA → 4 engine calls.
    expect(requestAnalysisForPathMock).toHaveBeenCalledTimes(4)

    // The KA position is plotted with the Black-perspective conversion
    // (after move 1 White is to play → 1 - 0.55 = 0.45).
    const points = document.querySelectorAll('[data-winrate-point]')
    expect(points.length).toBe(5)
    expect(points[0]!.getAttribute('data-winrate')).toBe('0.450')
  })

  test('playing a move mid-run invalidates the stale batch and resets progress', async () => {
    requestAnalysisForPathMock.mockImplementation(
      (_setup: unknown, _moves: unknown, _s: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    )

    render(<App />)
    enableEngine()

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)

    fireEvent.click(document.getElementById('tree-analysis-start')!)
    await waitFor(() => {
      expect(document.getElementById('tree-analysis-progress')).toBeTruthy()
    })

    // New move mid-run → the target snapshot is stale → the run must be
    // invalidated (not finish "complete"), progress reset, engine aborted.
    await clickVertex(5, 5, 19)

    await waitFor(() => {
      expect(document.getElementById('tree-analysis-progress')).toBeNull()
    })
    expect(document.getElementById('tree-analysis-status')).toBeNull()
    // Start is available again for a run against the fresh snapshot.
    expect(
      (document.getElementById('tree-analysis-start') as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(katagoAdapter.abortOngoing as ReturnType<typeof vi.fn>).toHaveBeenCalled()
  })
})
