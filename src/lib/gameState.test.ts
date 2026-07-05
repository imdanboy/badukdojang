import { describe, expect, test } from 'vitest'
import { createGameState } from './gameState.ts'

describe('gameState', () => {
  test('createGameState initializes empty board with black to play', () => {
    const gs = createGameState(9)
    expect(gs.board.width).toBe(9)
    expect(gs.board.height).toBe(9)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toBeNull()
    expect(gs.getSignMap()).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
  })

  test('makeMove places stone and flips player', () => {
    const gs = createGameState(9)
    const result = gs.makeMove([4, 4])
    expect(result).toBe(true)
    expect(gs.getSignMap()[4]![4]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([4, 4])
  })

  test('occupied intersection rejected', () => {
    const gs = createGameState(9)
    gs.makeMove([4, 4])
    const result = gs.makeMove([4, 4])
    expect(result).toBe(false)
    expect(gs.getSignMap()[4]![4]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)
  })

  test('capture removes group with no liberties', () => {
    const gs = createGameState(9)
    // Corner capture:
    // B at (1,0), W at (0,0), B at (0,1)
    // White at (0,0) has 0 liberties and is captured
    gs.makeMove([1, 0]) // B
    gs.makeMove([0, 0]) // W
    gs.makeMove([0, 1]) // B captures W at (0,0)
    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.getSignMap()[1]![0]).toBe(1)
    expect(gs.getSignMap()[0]![1]).toBe(1)
  })

  test('ko prevents immediate recapture', () => {
    const gs = createGameState(9)
    // Set up a ko position:
    // . B W . .
    // B . W . .
    // . B W . .
    // . . . . .
    // Then white captures at (1,1), creating a ko.
    // Black should not be able to immediately recapture.
    gs.makeMove([1, 0]) // B at (1,0)
    gs.makeMove([2, 0]) // W at (2,0)
    gs.makeMove([0, 1]) // B at (0,1)
    gs.makeMove([2, 1]) // W at (2,1)
    gs.makeMove([1, 2]) // B at (1,2)
    gs.makeMove([2, 2]) // W at (2,2)
    gs.makeMove([3, 1]) // B at (3,1) - surrounds white group
    gs.makeMove([1, 1]) // W captures B at (1,1)
    // Now black tries to recapture immediately (ko)
    const result = gs.makeMove([1, 1])
    expect(result).toBe(false)
    expect(gs.getSignMap()[1]![1]).toBe(-1)
  })

  test('suicide move rejected', () => {
    const gs = createGameState(9)
    // Set up a suicide position in the corner:
    // B at (1,0), W at (2,0), B at (0,1)
    // Now white tries to play at (0,0) which is surrounded by black
    // with no liberties and captures nothing.
    gs.makeMove([1, 0]) // B
    gs.makeMove([2, 0]) // W
    gs.makeMove([0, 1]) // B
    // Now it's white's turn. White tries to play at (0,0).
    // Neighbors: (1,0)=B, (0,1)=B. No liberties, no captures.
    const result = gs.makeMove([0, 0])
    expect(result).toBe(false)
    expect(gs.getSignMap()[0]![0]).toBe(0)
  })

  test('pass flips player without placing stone', () => {
    const gs = createGameState(9)
    expect(gs.currentPlayer).toBe(1)
    gs.pass()
    expect(gs.currentPlayer).toBe(-1)
    gs.pass()
    expect(gs.currentPlayer).toBe(1)
    // Board should still be empty
    expect(gs.getSignMap()).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
  })
})
