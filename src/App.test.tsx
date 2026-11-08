import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { App } from './App.tsx'
import './index.css'
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
      onBoardWrapBoundsChange?: (bounds: {
        left: number
        top: number
        width: number
        height: number
        gridLeft: number
      }) => void
    }) => {
      useEffect(() => {
        props.onBoardWrapBoundsChange?.({
          left: 20,
          top: 20,
          width: 400,
          height: 400,
          gridLeft: 60,
        })
      }, [props.onBoardWrapBoundsChange])

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

/** The winrate graph dock is hidden by default — open it for the
    full-tree analysis controls and the chart. */
function openWinrateDock(): void {
  fireEvent.click(document.getElementById('winrate-dock-toggle')!)
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
    expect(document.querySelector('.player-turn-yinyang')?.getAttribute('data-current-player')).toBe(
      'black',
    )
    expect(document.querySelector('.player-turn-yinyang-black')?.getAttribute('transform')).toBe(
      'translate(0 64) scale(1 -1)',
    )
    expect(document.querySelector('.player-turn-count-dot-white')?.getAttribute('cy')).toBe('17')
    expect(document.querySelector('.player-turn-count-white')?.getAttribute('y')).toBe('17')
    expect(document.querySelector('.player-turn-count-dot-black')?.getAttribute('cy')).toBe('47')
    expect(document.querySelector('.player-turn-count-black')?.getAttribute('y')).toBe('47')
    expect(
      document.querySelector('.player-turn-active-lobe')?.getAttribute('data-active-lobe'),
    ).toBe('black')

    // Place a black stone at (3,3)
    await clickVertex(3, 3, 19)

    // Turn should flip to White
    const turnIndicator = screen.getByText(/To Play:/)
    expect(turnIndicator.textContent).toContain('White')
    expect(document.querySelector('.player-turn-yinyang')?.getAttribute('data-current-player')).toBe(
      'white',
    )
    expect(
      document.querySelector('.player-turn-active-lobe')?.getAttribute('data-active-lobe'),
    ).toBe('white')
    expect(document.querySelector('.player-turn-active-lobe')?.getAttribute('transform')).toBe(
      'translate(64 0) scale(-1 1)',
    )
    expect(document.querySelector('.player-turn-count-black')?.textContent).toBe('0')
    expect(document.querySelector('.player-turn-count-white')?.textContent).toBe('0')
    expect(document.querySelector('.player-turn-count-dot-white')?.getAttribute('cy')).toBe('17')
    expect(document.querySelector('.player-turn-count-white')?.getAttribute('y')).toBe('17')
    expect(document.querySelector('.player-turn-count-dot-black')?.getAttribute('cy')).toBe('47')
    expect(document.querySelector('.player-turn-count-black')?.getAttribute('y')).toBe('47')

    // requestMove should NOT have been called
    expect(requestMoveMock).not.toHaveBeenCalled()
  })

  test('analysis toggles stay in the top bar and game modes lead the progress section', () => {
    render(<App />)

    expect(document.querySelector('.top-bar-logo')?.getAttribute('src')).toBe('/favicon.svg')
    const toolbar = document.querySelector('.top-bar-analysis')
    expect(toolbar?.getAttribute('aria-label')).toBe('분석 표시')
    const analysisIds = [
      'candidates-toggle',
      'ownership-toggle',
      'winrate-toggle',
      'policy-toggle',
      'analysis-summary-toggle',
    ]
    for (const id of analysisIds) {
      expect(toolbar?.querySelector(`#${id}`)).not.toBeNull()
      expect(document.querySelector(`.game-sidebar #${id}`)).toBeNull()
    }
    expect(toolbar?.querySelectorAll('.analysis-toggle-icon')).toHaveLength(5)
    expect(Array.from(toolbar!.querySelectorAll('button')).map((button) => button.id)).toEqual(
      analysisIds,
    )

    const progress = document.querySelector('.game-progress-section')!
    expect(progress.querySelector('#mode-selfplay')).not.toBeNull()
    expect(progress.querySelector('#mode-ai')).not.toBeNull()
    expect(
      progress.querySelector('#mode-selfplay')!.compareDocumentPosition(
        progress.querySelector('#playback-first')!,
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  test("black's captured white stones are counted in the white dot on the black lobe", async () => {
    render(<App />)

    await clickVertex(1, 0, 19)
    await clickVertex(0, 0, 19)
    await clickVertex(0, 1, 19)

    expect(document.querySelector('.player-turn-count-white')?.textContent).toBe('1')
    expect(document.querySelector('.player-turn-count-black')?.textContent).toBe('0')
    expect(document.querySelector('.player-turn-count-white')?.getAttribute('y')).toBe('17')
  })

  test("white's captured black stones are counted in the black dot on the white lobe", async () => {
    render(<App />)

    await clickVertex(18, 18, 19)
    await clickVertex(17, 18, 19)
    await clickVertex(9, 9, 19)
    await clickVertex(18, 17, 19)

    expect(document.querySelector('.player-turn-count-white')?.textContent).toBe('0')
    expect(document.querySelector('.player-turn-count-black')?.textContent).toBe('1')
    expect(document.querySelector('.player-turn-count-black')?.getAttribute('y')).toBe('47')
  })

  test('winrate toggle anchors the vertical bar beside the board', () => {
    render(<App />)
    enableEngine()
    fireEvent.click(document.getElementById('winrate-toggle')!)

    const boardColumn = document.querySelector('.board-col')!
    expect(boardColumn.classList.contains('board-col-with-winrate')).toBe(true)
    expect(getComputedStyle(boardColumn).position).toBe('relative')
    const winrateColumn = document.querySelector('.board-winrate-column')!
    expect(winrateColumn).not.toBeNull()
    expect(winrateColumn.querySelector('.winrate-vertical-track')).not.toBeNull()
    expect(getComputedStyle(winrateColumn.querySelector('.winrate-vertical-track')!).flexDirection).toBe(
      'column',
    )
    expect(document.querySelector('.game-sidebar #winrate-bar')).toBeNull()
  })

  test('candidate score changes use the player-to-move perspective', async () => {
    requestAnalysisMock.mockResolvedValue({
      scoreLead: 5,
      bestMoves: [
        { move: 'D5', visits: 80, winrate: 0.6, scoreLead: 2 },
        { move: 'Q16', visits: 20, winrate: 0.4, scoreLead: 8 },
      ],
    })
    render(<App />)

    enableEngine()
    fireEvent.click(document.getElementById('candidates-toggle')!)

    // White to play: a lower black score is an improvement for White.
    await clickVertex(3, 3, 19)
    await waitFor(() => {
      const rows = document.querySelectorAll('.candidate-move-row')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.textContent).toContain('+3.0')
      expect(rows[1]!.textContent).toContain('-3.0')
      expect(rows[0]!.textContent).toContain('40.0%')
      expect(rows[1]!.textContent).toContain('60.0%')
    })

    // Black to play: the same absolute candidate scores have opposite deltas.
    await clickVertex(4, 4, 19)
    await waitFor(() => {
      const rows = document.querySelectorAll('.candidate-move-row')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.textContent).toContain('-3.0')
      expect(rows[1]!.textContent).toContain('+3.0')
      expect(rows[0]!.textContent).toContain('60.0%')
      expect(rows[1]!.textContent).toContain('40.0%')
    })
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

  test('right sidebar separates game progress from analysis results', () => {
    render(<App />)

    const sideCol = document.querySelector('.side-col')!
    const progress = sideCol.querySelector('.game-progress-section')!
    const review = sideCol.querySelector('.review-panel')!
    expect(progress.contains(document.getElementById('playback-first'))).toBe(true)
    expect(progress.contains(document.getElementById('turn-indicator'))).toBe(true)
    expect(progress.contains(document.getElementById('score-btn'))).toBe(true)
    expect(progress.contains(review)).toBe(false)

    fireEvent.click(document.getElementById('analysis-summary-toggle')!)
    const results = sideCol.querySelector('.analysis-results-section')!
    expect(results).toBeTruthy()
    expect(sideCol.contains(results)).toBe(true)
  })

  test('left rail contains game and SGF actions', () => {
    render(<App />)

    const rail = document.querySelector('.board-rail') as HTMLElement | null
    expect(rail).toBeTruthy()
    expect(rail!.getAttribute('aria-label')).toBe('대국 및 기보')
    for (const id of [
      'new-game-action',
      'save-sgf-action',
      'load-sgf-action',
      'screenshot-import-action',
    ]) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  test('game-tree dock is hidden by default; the review toggle shows it with a resizer', () => {
    render(<App />)

    // Hidden by default (one-screen layout — no tree until requested).
    expect(document.querySelector('[data-testid="tree-dock"]')).toBeNull()
    const toggle = document.getElementById('tree-toggle') as HTMLButtonElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    // Toggle on: one dock holding the one tree panel + a separator handle.
    fireEvent.click(toggle)
    const dock = document.querySelector('[data-testid="tree-dock"]')!
    expect(dock).toBeTruthy()
    expect(Number.parseFloat((dock as HTMLElement).style.height)).toBeLessThanOrEqual(100)
    const panel = dock.querySelector('[data-testid="game-tree-panel"]')!
    expect(panel).toBeTruthy()
    expect(document.querySelectorAll('.tree-resizer').length).toBe(1)
    expect(
      (document.getElementById('tree-toggle') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    // Still exactly ONE tree view, outside the game layout/review panel.
    expect(document.querySelectorAll('[data-testid="game-tree-panel"]').length).toBe(1)
    expect(panel.closest('.review-panel')).toBeNull()
    expect(document.querySelector('.game-layout')!.contains(panel)).toBe(false)

    // Toggle off: dock (and the tree with it) disappears entirely.
    fireEvent.click(document.getElementById('tree-toggle')!)
    expect(document.querySelector('[data-testid="tree-dock"]')).toBeNull()
  })

  test('tree dock resizer supports keyboard resizing within its bounds', () => {
    render(<App />)
    fireEvent.click(document.getElementById('tree-toggle')!)

    const resizer = document.querySelector('.tree-resizer') as HTMLElement
    expect(resizer.getAttribute('role')).toBe('separator')
    expect(resizer.getAttribute('tabindex')).toBe('0')
    const before = Number(resizer.getAttribute('aria-valuenow'))

    fireEvent.keyDown(resizer, { key: 'ArrowUp' })
    const grown = Number(resizer.getAttribute('aria-valuenow'))
    expect(grown).toBeGreaterThan(before)

    // End jumps to the minimum bound; Home to the maximum bound.
    fireEvent.keyDown(resizer, { key: 'End' })
    expect(Number(resizer.getAttribute('aria-valuenow'))).toBe(
      Number(resizer.getAttribute('aria-valuemin')),
    )
    fireEvent.keyDown(resizer, { key: 'Home' })
    expect(Number(resizer.getAttribute('aria-valuenow'))).toBe(
      Number(resizer.getAttribute('aria-valuemax')),
    )
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

describe('Toolbar keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  /** Fire a Ctrl+key combination at the window. */
  function pressShortcut(
    code: string,
    modifiers: {
      shiftKey?: boolean
      ctrlKey?: boolean
      altKey?: boolean
      metaKey?: boolean
      key?: string
    } = {},
  ): void {
    fireEvent.keyDown(window, { code, ctrlKey: true, ...modifiers })
  }

  const isPressed = (id: string): boolean =>
    document.getElementById(id)?.getAttribute('aria-pressed') === 'true'

  // Mode buttons expose their selected state accessibly.
  const isModeActive = isPressed

  test('Ctrl+[ / Ctrl+] switches between 놓아보기 and AI 대국', () => {
    render(<App />)

    // Default is selfplay (후보수 button exists only in selfplay mode).
    expect(document.getElementById('candidates-toggle')).not.toBeNull()
    pressShortcut('BracketRight')
    expect(document.getElementById('candidates-toggle')).toBeNull()
    expect(isModeActive('mode-ai')).toBe(true)

    pressShortcut('BracketLeft')
    expect(isModeActive('mode-selfplay')).toBe(true)
    expect(document.getElementById('candidates-toggle')).not.toBeNull()
  })

  test('matching uses KeyboardEvent.code for bracket shortcuts', () => {
    render(<App />)

    pressShortcut('BracketRight', { key: 'x' })
    expect(isModeActive('mode-ai')).toBe(true)
  })

  test('Ctrl+1..Ctrl+5 follow analysis priority and respect the engine state', () => {
    render(<App />)

    pressShortcut('Digit1')
    pressShortcut('Digit2')
    pressShortcut('Digit3')
    pressShortcut('Digit4')
    expect(isPressed('candidates-toggle')).toBe(false)
    expect(isPressed('ownership-toggle')).toBe(false)
    expect(isPressed('winrate-toggle')).toBe(false)
    expect(isPressed('policy-toggle')).toBe(false)
    expect((document.getElementById('candidates-toggle') as HTMLButtonElement).disabled).toBe(true)

    enableEngine()
    pressShortcut('Digit1')
    pressShortcut('Digit2')
    pressShortcut('Digit3')
    pressShortcut('Digit4')
    pressShortcut('Digit5')
    expect(isPressed('candidates-toggle')).toBe(true)
    expect(isPressed('ownership-toggle')).toBe(true)
    expect(document.querySelector('.board-col-with-winrate')).not.toBeNull()
    expect(isPressed('winrate-toggle')).toBe(true)
    expect(isPressed('policy-toggle')).toBe(true)
    expect(isPressed('analysis-summary-toggle')).toBe(true)
  })

  test('Ctrl+1 toggles 후보수 only in selfplay (hidden control in AI mode is inert)', () => {
    render(<App />)
    enableEngine()

    pressShortcut('Digit1')
    expect(isPressed('candidates-toggle')).toBe(true)

    // Switch to AI mode: the button disappears and the shortcut does nothing.
    pressShortcut('BracketRight')
    expect(document.getElementById('candidates-toggle')).toBeNull()
    pressShortcut('Digit1')
    expect(isModeActive('mode-ai')).toBe(true)

    // Back in selfplay the shortcut works again; the mode switch preserved
    // the toggle state (still on from the earlier shortcut).
    pressShortcut('BracketLeft')
    expect(isPressed('candidates-toggle')).toBe(true)
    pressShortcut('Digit1')
    expect(isPressed('candidates-toggle')).toBe(false)
  })

  test('Ctrl+2 and Ctrl+4 toggle 형세 and 정책망, engine-gated', () => {
    render(<App />)

    pressShortcut('Digit2')
    pressShortcut('Digit4')
    expect(isPressed('policy-toggle')).toBe(false)
    expect(isPressed('ownership-toggle')).toBe(false)
    expect((document.getElementById('policy-toggle') as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById('ownership-toggle') as HTMLButtonElement).disabled).toBe(true)

    enableEngine()
    pressShortcut('Digit2')
    pressShortcut('Digit4')
    expect(isPressed('ownership-toggle')).toBe(true)
    expect(isPressed('policy-toggle')).toBe(true)
  })

  test('Ctrl+5 toggles 분석 요약 (always available, no engine needed)', () => {
    render(<App />)

    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(true)
    expect(document.querySelector('.side-col .analysis-results-section')).toBeTruthy()

    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(false)
    expect(document.querySelector('.analysis-results-section')).toBeNull()
  })

  test('requires Ctrl and rejects plain digits and additional modifiers', () => {
    render(<App />)

    fireEvent.keyDown(window, { code: 'Digit5' })
    expect(isPressed('analysis-summary-toggle')).toBe(false)

    const rejected: Parameters<typeof pressShortcut>[1][] = [
      { ctrlKey: false },
      { shiftKey: true },
      { altKey: true },
      { metaKey: true },
    ]
    for (const modifiers of rejected) {
      pressShortcut('Digit5', modifiers)
    }
    expect(isPressed('analysis-summary-toggle')).toBe(false)

    // Ctrl+digit works after all the rejections.
    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(true)
  })

  test('shortcuts are suspended while a modal dialog is open', () => {
    render(<App />)

    fireEvent.click(document.getElementById('new-game-action')!)
    expect(document.querySelector('.modal-panel[role="dialog"]')).toBeTruthy()

    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(false)

    // The mode shortcut is equally suspended — still selfplay.
    pressShortcut('BracketRight')
    expect(document.getElementById('candidates-toggle')).not.toBeNull()
  })

  test('shortcuts are suspended while the toolbar is hidden (zen mode)', () => {
    render(<App />)

    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(true)

    // Enter zen mode: the toolbar (and the whole game chrome) disappears and
    // shortcuts must stop running.
    fireEvent.click(document.getElementById('zen-toggle')!)
    expect(document.getElementById('analysis-summary-toggle')).toBeNull()
    pressShortcut('Digit5')

    // Exiting zen mode proves the zen-time press was ignored: the summary
    // toggle kept the state it had before zen (still on), and the shortcut
    // works again afterwards.
    fireEvent.click(document.getElementById('zen-exit')!)
    expect(isPressed('analysis-summary-toggle')).toBe(true)
    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(false)
  })

  test('ignored while an input has focus (typing elsewhere never toggles the toolbar)', () => {
    render(<App />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fileInput.focus()
    fireEvent.keyDown(fileInput, { code: 'Digit5', ctrlKey: true })
    expect(isPressed('analysis-summary-toggle')).toBe(false)
    pressShortcut('Digit5')
    expect(isPressed('analysis-summary-toggle')).toBe(true)
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

    fireEvent.click(document.getElementById('new-game-action')!)
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

    fireEvent.click(document.getElementById('new-game-action')!)
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
    // 'all' mode via the 전체 수순 button).
    expect(moveLabels().size).toBe(0)
    const allBtn = screen.getByText('전체 수순') as HTMLButtonElement
    expect(allBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(allBtn)
    expect(allBtn.getAttribute('aria-pressed')).toBe('true')

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
    fireEvent.click(screen.getByText('전체 수순'))
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

    // Both toggles are accessible toggle buttons, off and enabled by default.
    const allBtn = screen.getByText('전체 수순') as HTMLButtonElement
    const displayBtn = screen.getByText('번호 표시') as HTMLButtonElement
    expect(allBtn.getAttribute('aria-pressed')).toBe('false')
    expect(displayBtn.getAttribute('aria-pressed')).toBe('false')
    expect(allBtn.disabled).toBe(false)
    expect(displayBtn.disabled).toBe(false)
  })

  test('all mode: re-clicking the active button turns numbering off', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('전체 수순'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')
    expect(
      (screen.getByText('전체 수순') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    // Re-click = off (back to hidden).
    fireEvent.click(screen.getByText('전체 수순'))
    expect(moveLabels().size).toBe(0)
    expect(
      (screen.getByText('전체 수순') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
  })

  test('all mode disables the 번호 표시 toggle until it is turned off', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('전체 수순'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')
    expect((screen.getByText('번호 표시') as HTMLButtonElement).disabled).toBe(
      true,
    )

    // Turning all mode off re-enables the other toggle.
    fireEvent.click(screen.getByText('전체 수순'))
    expect(moveLabels().size).toBe(0)
    expect((screen.getByText('번호 표시') as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  test('번호 표시 at a non-root position: existing stones stay unlabeled, later moves number 1, 2', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    // Back to the move-2 node: (3,3) and (4,4) are already on the board.
    fireEvent.click(screen.getByText('Undo'))
    fireEvent.click(screen.getByText('번호 표시'))

    // Stones already on the board at press time must NOT be labeled.
    let labels = moveLabels()
    expect(labels.size).toBe(0)
    expect(labels.get('3,3')).toBeUndefined()
    expect(labels.get('4,4')).toBeUndefined()
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    // Moves played after the press are numbered from 1.
    fireEvent.click(document.getElementById('playback-next')!)
    labels = moveLabels()
    expect(labels.get('5,5')).toBe('1')
    expect(labels.get('3,3')).toBeUndefined()
    expect(labels.get('4,4')).toBeUndefined()

    // Subsequent moves continue: 2, 3, …
    await clickVertex(6, 6, 19)
    labels = moveLabels()
    expect(labels.get('6,6')).toBe('2')
    expect(labels.get('5,5')).toBe('1')

    // Re-click turns numbering off and removes the labels.
    fireEvent.click(screen.getByText('번호 표시'))
    expect(moveLabels().size).toBe(0)
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
  })

  test('번호 표시 at root: the next move is 1', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('번호 표시'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')
  })

  test('mode switch: 전체 수순 switches away from 번호 표시, which is disabled while all mode is on', async () => {
    render(<App />)
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)

    // 번호 표시 on at move 2 → existing stones unlabeled, button enabled.
    fireEvent.click(screen.getByText('번호 표시'))
    expect(moveLabels().size).toBe(0)
    expect((screen.getByText('전체 수순') as HTMLButtonElement).disabled).toBe(
      false,
    )

    // Clicking 전체 수순 while 번호 표시 is on switches to all mode —
    // every stone on the path gets its path number.
    fireEvent.click(screen.getByText('전체 수순'))
    let labels = moveLabels()
    expect(labels.get('3,3')).toBe('1')
    expect(labels.get('4,4')).toBe('2')
    expect(
      (screen.getByText('전체 수순') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    // While all mode is on, 번호 표시 must be disabled/non-actionable.
    expect((screen.getByText('번호 표시') as HTMLButtonElement).disabled).toBe(
      true,
    )

    // Turning all mode off re-enables it.
    fireEvent.click(screen.getByText('전체 수순'))
    expect(moveLabels().size).toBe(0)
    expect((screen.getByText('번호 표시') as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  test('branch navigation: a sibling branch outside the anchor subtree shows no labels', async () => {
    render(<App />)

    // Open the tree dock (hidden by default) for node navigation.
    fireEvent.click(document.getElementById('tree-toggle')!)

    // Main line m1(3,3) m2(4,4) m3(5,5); fork a variation from m2.
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    // Anchor = variation tip (current node): nothing is played after the
    // press yet, so no labels appear.
    fireEvent.click(screen.getByText('번호 표시'))
    expect(moveLabels().size).toBe(0)

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
    fireEvent.click(screen.getByText('번호 표시'))
    expect(document.getElementById('move-number-anchor-hint')).toBeNull()
    expect(moveLabels().size).toBe(0)

    // …then pressing again anchors at the CURRENT node (main tip): existing
    // stones stay unlabeled and only later moves on THIS branch get labels.
    fireEvent.click(screen.getByText('번호 표시'))
    expect(moveLabels().size).toBe(0)
    expect(
      document.getElementById('move-number-anchor-hint')?.textContent,
    ).toContain('선택 노드 이후')
    await clickVertex(7, 7, 19)
    let labels = moveLabels()
    expect(labels.get('7,7')).toBe('1')
    expect(labels.get('5,5')).toBeUndefined()
    expect(labels.get('3,3')).toBeUndefined()

    // Jump back to the variation — the anchor (main tip + its child) is
    // off that path, so no sibling move may be mislabeled.
    fireEvent.click(document.querySelector('[data-tree-node="3"]')!)
    await waitFor(() => {
      expect(screen.getByText('Move 3')).toBeTruthy()
    })
    expect(moveLabels().size).toBe(0)
  })

  test('starting a new game resets the numbering mode and stale anchor', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    fireEvent.click(screen.getByText('번호 표시'))
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    // New game: numbering must be hidden again — no stale anchor applies.
    fireEvent.click(document.getElementById('new-game-action')!)
    fireEvent.click(document.getElementById('new-game-start')!)
    await waitFor(() => {
      expect(screen.getByText('Move 0')).toBeTruthy()
    })
    expect(moveLabels().size).toBe(0)
    expect(document.getElementById('move-number-anchor-hint')).toBeNull()
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')

    // Numbering works again on the fresh tree: press at the root, then the
    // moves played after the press are numbered from 1.
    fireEvent.click(screen.getByText('번호 표시'))
    await clickVertex(3, 3, 19)
    expect(moveLabels().get('3,3')).toBe('1')

    confirmMock.mockRestore()
  })

  test('loading an SGF resets the numbering mode (no stale node ids)', async () => {
    render(<App />)

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    fireEvent.click(screen.getByText('번호 표시'))
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

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
    expect(
      (screen.getByText('번호 표시') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
    // …and explicit numbering after the load uses the parsed tree correctly.
    fireEvent.click(screen.getByText('전체 수순'))
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

    // Open the tree dock (hidden by default in the one-screen layout).
    fireEvent.click(document.getElementById('tree-toggle')!)

    // m1 → m2 → m3, then explore a second m2 (variation).
    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)
    await clickVertex(5, 5, 19)
    fireEvent.click(screen.getByText('Undo'))
    await clickVertex(6, 6, 19)

    // Exactly ONE tree view, and it lives OUTSIDE the review panel (it is
    // rendered full width below the 3-column game area, not in the sidebar).
    const panels = document.querySelectorAll('[data-testid="game-tree-panel"]')
    expect(panels.length).toBe(1)
    const panel = panels[0]!
    expect(panel.closest('.review-panel')).toBeNull()
    expect(panel.closest('.game-layout')).toBeNull()
    const section = panel.closest('.tree-section')
    expect(section).not.toBeNull()
    // The tree section sits OUTSIDE the game layout (below the 3 columns).
    const layout = document.querySelector('.game-layout')!
    expect(layout.contains(panel)).toBe(false)

    // root + m1 + m2 + m3 + m2' = 5 nodes
    expect(panel.querySelectorAll('[data-tree-node]').length).toBe(5)

    // Moves render as numbered stone nodes; the root stays unnumbered.
    expect(panel.querySelector('[data-tree-node="0"] .tree-node-number')!.textContent).toBe('1')
    expect(panel.querySelector('[data-tree-node="1"] .tree-node-number')!.textContent).toBe('2')
    expect(panel.querySelector('[data-tree-node="root"] .tree-node-number')).toBeNull()

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

    // Open the tree dock (hidden by default in the one-screen layout).
    fireEvent.click(document.getElementById('tree-toggle')!)

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

    // Open the tree dock (hidden by default) for node navigation and the
    // winrate dock for the analysis controls.
    fireEvent.click(document.getElementById('tree-toggle')!)
    openWinrateDock()

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
    // KataGo winrate is reported in BLACK's perspective and the graph plots
    // it directly (0.7 for every analyzed position here).
    expect(points[0]!.getAttribute('data-winrate')).toBe('0.700')
    expect(points[1]!.getAttribute('data-winrate')).toBe('0.700')

    // Navigate to the main-line tip; the graph follows the branch.
    fireEvent.click(document.querySelector('[data-tree-node="2"]')!)
    await waitFor(() => {
      const mainPoints = document.querySelectorAll('[data-winrate-point]')
      return mainPoints.length === 3 && mainPoints[2]!.getAttribute('data-move-number') === '3'
    })
    // Same depths → same values on the other branch.
    const mainPoints = document.querySelectorAll('[data-winrate-point]')
    expect(mainPoints[1]!.getAttribute('data-winrate')).toBe('0.700')
    expect(mainPoints[2]!.getAttribute('data-winrate')).toBe('0.700')

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
    openWinrateDock()

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
    openWinrateDock()
    const btn = document.getElementById('tree-analysis-start') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  test('SGF-embedded KA positions are reused with zero engine calls and plotted', async () => {
    render(<App />)
    enableEngine()
    openWinrateDock()

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

    // The KA position is plotted directly (Black-perspective winrate 0.55).
    const points = document.querySelectorAll('[data-winrate-point]')
    expect(points.length).toBe(5)
    expect(points[0]!.getAttribute('data-winrate')).toBe('0.550')
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
    openWinrateDock()

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

describe('Review — winrate graph dock (bottom, full width)', () => {
  let requestAnalysisForPathMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    requestAnalysisForPathMock = katagoAdapter.requestAnalysisForPath as ReturnType<typeof vi.fn>
    requestAnalysisForPathMock.mockReset()
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

  test('hidden by default; the 승률 그래프 review button toggles it', () => {
    render(<App />)

    expect(document.querySelector('[data-testid="winrate-dock"]')).toBeNull()
    expect(document.getElementById('winrate-graph-empty')).toBeNull()
    // The old sidebar analysis entry is gone: 전체 분석 moved into the dock.
    expect(document.getElementById('tree-analysis-start')).toBeNull()
    const toggle = document.getElementById('winrate-dock-toggle') as HTMLButtonElement
    expect(toggle).toBeTruthy()
    expect(toggle.textContent).toBe('승률 그래프')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    // The 기보 트리 toggle is a separate, independent button.
    expect(document.getElementById('tree-toggle')).toBeTruthy()

    openWinrateDock()
    expect(document.querySelector('[data-testid="winrate-dock"]')).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    openWinrateDock()
    expect(document.querySelector('[data-testid="winrate-dock"]')).toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  test('initially empty graph state; analysis controls live inside the dock only', () => {
    render(<App />)
    openWinrateDock()

    const dock = document.querySelector('[data-testid="winrate-dock"]')!
    // Empty state: no chart points until a full analysis is started.
    expect(dock.querySelector('#winrate-graph-empty')).toBeTruthy()
    expect(dock.querySelectorAll('[data-winrate-point]').length).toBe(0)
    expect(dock.querySelector('#winrate-graph')).toBeNull()

    // 전체 분석 lives inside the dock — never in the sidebar/panel.
    expect(document.querySelector('.side-col #tree-analysis-start')).toBeNull()
    expect(document.querySelector('.game-sidebar #tree-analysis-start')).toBeNull()
    const start = dock.querySelector('#tree-analysis-start') as HTMLButtonElement
    expect(start).toBeTruthy()
    expect(start.textContent).toBe('전체 분석')
  })

  test('graph appears only after the full-tree run starts and plots its results', async () => {
    render(<App />)
    enableEngine()
    openWinrateDock()

    await clickVertex(3, 3, 19)
    await clickVertex(4, 4, 19)

    // Still empty before the user starts the analysis.
    expect(document.querySelectorAll('[data-winrate-point]').length).toBe(0)
    expect(document.getElementById('winrate-graph-empty')).toBeTruthy()

    fireEvent.click(document.getElementById('tree-analysis-start')!)
    // While running: progress UI inside the dock and the graph already
    // plotting whatever has landed.
    await waitFor(() => {
      expect(
        document
          .querySelector('[data-testid="winrate-dock"]')!
          .querySelector('#tree-analysis-progress'),
      ).toBeTruthy()
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-winrate-point]').length).toBe(2)
    })
    expect(document.getElementById('winrate-graph-empty')).toBeNull()

    await waitFor(() => {
      expect(document.getElementById('tree-analysis-status')?.textContent).toContain(
        '전체 분석 완료',
      )
    })
    // Chart stays after completion. KataGo winrate is reported in BLACK's
    // perspective and the graph plots it directly (0.7 for every position).
    const points = document.querySelectorAll('[data-winrate-point]')
    expect(points.length).toBe(2)
    expect(points[0]!.getAttribute('data-winrate')).toBe('0.700')
  })

  test('both open docks stack at the bottom in graph→tree order, full width', async () => {
    render(<App />)
    enableEngine()
    openWinrateDock()
    fireEvent.click(document.getElementById('tree-toggle')!)

    const graphDock = document.querySelector('[data-testid="winrate-dock"]')!
    const treeDock = document.querySelector('[data-testid="tree-dock"]')!
    // DOM order == visual order: graph dock first, tree dock below it.
    expect(
      graphDock.compareDocumentPosition(treeDock) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Both are outside the game layout/sidebar (full app width).
    expect(document.querySelector('.game-layout')!.contains(graphDock)).toBe(false)
    const review = document.querySelector('.review-panel')!
    expect(graphDock.textContent).not.toContain('기보 트리')
    // Full-width check: the dock cannot be inside the narrow side column.
    expect(document.querySelector('.side-col')!.contains(graphDock)).toBe(false)
    // Dock heights are modest fixed pixels (stage keeps the bulk).
    expect(Number.parseFloat((graphDock as HTMLElement).style.height)).toBeLessThanOrEqual(1000)
    expect(Number.parseFloat((treeDock as HTMLElement).style.height)).toBeLessThanOrEqual(1000)

    // Sanity: review header keeps both toggles.
    expect(review.querySelector('#tree-toggle')).toBeTruthy()
    expect(review.querySelector('#winrate-dock-toggle')).toBeTruthy()
  })

  test('graph dock is keyboard-resizable and its bounds account for the tree dock', async () => {
    render(<App />)
    openWinrateDock()
    fireEvent.click(document.getElementById('tree-toggle')!)

    const graphResizer = document.querySelector('.graph-resizer') as HTMLElement
    expect(graphResizer.getAttribute('role')).toBe('separator')
    const before = Number(graphResizer.getAttribute('aria-valuenow'))

    fireEvent.keyDown(graphResizer, { key: 'ArrowUp' })
    expect(Number(graphResizer.getAttribute('aria-valuenow'))).toBeGreaterThan(before)

    // Bounds clamp: Home = max under the shrunken stage, End = the minimum.
    fireEvent.keyDown(graphResizer, { key: 'End' })
    expect(Number(graphResizer.getAttribute('aria-valuenow'))).toBe(
      Number(graphResizer.getAttribute('aria-valuemin')),
    )
    fireEvent.keyDown(graphResizer, { key: 'Home' })
    const graphMax = Number(graphResizer.getAttribute('aria-valuemax'))
    expect(graphMax).toBeLessThanOrEqual(
      Number(graphResizer.getAttribute('aria-valuemin')) + 10000,
    )

    // Growing the graph past the stage reserve actually caps joint growth:
    // graph max + tree now <= viewport minus the deskt stage reserve.
    const treeResizer = document.querySelector('.tree-resizer') as HTMLElement
    const treeNow = Number(treeResizer.getAttribute('aria-valuenow'))
    expect(graphMax + treeNow).toBeLessThanOrEqual(window.innerHeight - 300)
  })
})
