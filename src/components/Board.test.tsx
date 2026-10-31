import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Board } from './Board.tsx'
import { BoardThemeProvider } from '@kaya/themes'
import type { SignMap } from '@kaya/shudan'

vi.mock('@kaya/shudan', () => ({
  Goban: (props: {
    className?: string
    onVertexMouseMove?: (event: React.MouseEvent, vertex: [number, number]) => void
  }) => (
    <div className={props.className} data-testid="mock-goban">
      <div className="shudan-content" onMouseMove={(event) => props.onVertexMouseMove?.(event, [2, 3])} />
    </div>
  ),
}))

const signMap: SignMap = Array.from({ length: 9 }, () => Array<1 | 0 | -1>(9).fill(0))
const candidateMoves = [{ vertex: [2, 3] as [number, number], scoreDelta: 1.2, visits: 40 }]

describe('Board candidate hover preview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  test.each([
    { currentPlayer: 1 as const, expectedStone: 'blackStoneUrl' },
    { currentPlayer: -1 as const, expectedStone: 'whiteStoneUrl' },
  ])('shows the current player stone on a hovered candidate', async ({ currentPlayer, expectedStone }) => {
    render(
      <BoardThemeProvider>
        <Board
          signMap={signMap}
          boardSize={9}
          currentPlayer={currentPlayer}
          showCoordinates={false}
          candidateMoves={candidateMoves}
        />
      </BoardThemeProvider>,
    )

    fireEvent.mouseMove(document.querySelector('.shudan-content')!)

    await waitFor(() => {
      const preview = document.querySelector('.candidate-hover-stone')
      expect(preview).not.toBeNull()
      expect(preview?.getAttribute('href')).toContain(expectedStone === 'blackStoneUrl' ? 'stone-black' : 'stone-white')
    })
  })

  test('does not show a candidate stone on an occupied intersection', async () => {
    const occupiedSignMap = signMap.map((row) => [...row])
    occupiedSignMap[3]![2] = 1

    render(
      <BoardThemeProvider>
        <Board
          signMap={occupiedSignMap}
          boardSize={9}
          currentPlayer={-1}
          showCoordinates={false}
          candidateMoves={candidateMoves}
        />
      </BoardThemeProvider>,
    )

    fireEvent.mouseMove(document.querySelector('.shudan-content')!)
    await waitFor(() => expect(document.querySelector('.candidate-hover-stone')).toBeNull())
  })

  test('fills the responsive board wrapper without covering it', () => {
    render(
      <BoardThemeProvider>
        <Board
          signMap={signMap}
          boardSize={9}
          currentPlayer={1}
          showCoordinates={false}
          winrateOverlay={<span data-testid="winrate-overlay-content">50/50</span>}
        />
      </BoardThemeProvider>,
    )

    expect(screen.getByTestId('winrate-overlay-content').textContent).toBe('50/50')
    const overlay = document.querySelector('.board-winrate-overlay') as HTMLDivElement
    expect(overlay.parentElement?.className).toBe('board-goban-wrap')
    expect(overlay.style.top).toBe('0px')
    expect(overlay.style.left).toBe('-50px')
    expect(overlay.style.height).toBe('100%')
  })
})
