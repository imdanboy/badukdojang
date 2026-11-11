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
    expect(gs.board.getCaptures(1)).toBe(1)
    expect(gs.board.getCaptures(-1)).toBe(0)
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

  test('undo restores previous board state', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3])
    gs.makeMove([4, 4])
    gs.makeMove([5, 5])

    expect(gs.getSignMap()[3]![3]).toBe(1)
    expect(gs.getSignMap()[4]![4]).toBe(-1)
    expect(gs.getSignMap()[5]![5]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)

    const result = gs.undo()
    expect(result).toBe(true)
    expect(gs.getSignMap()[3]![3]).toBe(1)
    expect(gs.getSignMap()[4]![4]).toBe(-1)
    expect(gs.getSignMap()[5]![5]).toBe(0)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toEqual([4, 4])
  })

  test('redo restores next board state', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3])
    gs.makeMove([4, 4])
    gs.makeMove([5, 5])

    gs.undo()
    expect(gs.getSignMap()[5]![5]).toBe(0)

    const result = gs.redo()
    expect(result).toBe(true)
    expect(gs.getSignMap()[3]![3]).toBe(1)
    expect(gs.getSignMap()[4]![4]).toBe(-1)
    expect(gs.getSignMap()[5]![5]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([5, 5])
  })

  test('undo at root is no-op', () => {
    const gs = createGameState(9)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toBeNull()

    const result = gs.undo()
    expect(result).toBe(false)
    expect(gs.getSignMap()).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
    expect(gs.currentPlayer).toBe(1)
  })

  test('undo after pass restores correct state', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3])
    gs.pass()

    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toEqual([3, 3])

    gs.undo()
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([3, 3])

    gs.undo()
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toBeNull()
  })

  test('undo and redo with captures', () => {
    const gs = createGameState(9)
    // Corner capture: B at (1,0), W at (0,0), B at (0,1) captures W
    gs.makeMove([1, 0])
    gs.makeMove([0, 0])
    gs.makeMove([0, 1])

    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.board.getCaptures(1)).toBe(1)

    gs.undo()
    expect(gs.getSignMap()[0]![0]).toBe(-1)
    expect(gs.getSignMap()[0]![1]).toBe(1)
    expect(gs.board.getCaptures(1)).toBe(0)

    gs.redo()
    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.getSignMap()[0]![1]).toBe(1)
    expect(gs.getSignMap()[1]![0]).toBe(1)
    expect(gs.board.getCaptures(1)).toBe(1)
  })

  test('capture totals follow the selected branch and restored game tree', () => {
    const gs = createGameState(9)
    gs.makeMove([1, 0])
    const branchStart = String(gs.gameTree.currentId!)
    gs.makeMove([0, 0])
    gs.makeMove([0, 1])
    const captureNode = String(gs.gameTree.currentId!)

    expect(gs.board.getCaptures(1)).toBe(1)
    expect(gs.undo()).toBe(true)
    expect(gs.board.getCaptures(1)).toBe(0)
    expect(gs.redo()).toBe(true)
    expect(gs.board.getCaptures(1)).toBe(1)

    expect(gs.navigateToNode(branchStart)).toBe(true)
    expect(gs.board.getCaptures(1)).toBe(0)
    expect(gs.navigateToNode(captureNode)).toBe(true)
    expect(gs.board.getCaptures(1)).toBe(1)

    const restored = createGameState(9, gs.gameTree)
    expect(restored.board.getCaptures(1)).toBe(1)
    expect(restored.board.getCaptures(-1)).toBe(0)
  })

  test('navigateToNode jumps to an arbitrary branch and stays consistent', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3]) // m1 B
    const m1Id = String(gs.gameTree.currentId!)
    gs.makeMove([4, 4]) // m2 W
    gs.makeMove([5, 5]) // m3 B

    // Jump back to m1 (game-tree view click).
    expect(gs.navigateToNode(m1Id)).toBe(true)
    expect(gs.getSignMap()[3]![3]).toBe(1)
    expect(gs.getSignMap()[4]![4]).toBe(0)
    expect(gs.getSignMap()[5]![5]).toBe(0)
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([3, 3])
    // Move counter matches the selected branch.
    expect(gs.gameTree.currentId).toBe(gs.gameTree.get(m1Id)!.id)

    // Unknown node: rejected, state untouched.
    expect(gs.navigateToNode('does-not-exist')).toBe(false)
    expect(gs.currentPlayer).toBe(-1)

    // Undo/redo still work relative to the navigated node.
    expect(gs.undo()).toBe(true)
    expect(gs.getSignMap()[3]![3]).toBe(0)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toBeNull()
  })

  test('navigating to a variation node shows that branch position', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3]) // m1
    const m1Id = String(gs.gameTree.currentId!)
    gs.makeMove([4, 4]) // m2 main
    gs.undo()
    gs.makeMove([6, 6]) // m2 variation (branch)
    const variationId = String(gs.gameTree.currentId!)

    // Jump to m1, then to the variation tip.
    expect(gs.navigateToNode(m1Id)).toBe(true)
    expect(gs.getSignMap()[4]![4]).toBe(0)
    expect(gs.navigateToNode(variationId)).toBe(true)
    expect(gs.getSignMap()[6]![6]).toBe(-1)
    expect(gs.getSignMap()[4]![4]).toBe(0)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toEqual([6, 6])
  })
})

describe('gameState — 일반 착수는 항상 흑백 교대', () => {
  test('makeMove alternates colors and records B/W move nodes', () => {
    const gs = createGameState(9)
    expect(gs.makeMove([0, 0])).toBe(true) // black
    expect(gs.makeMove([1, 1])).toBe(true) // white
    expect(gs.makeMove([2, 2])).toBe(true) // black

    expect(gs.getSignMap()[0]![0]).toBe(1)
    expect(gs.getSignMap()[1]![1]).toBe(-1)
    expect(gs.getSignMap()[2]![2]).toBe(1)
    expect(gs.gameTree.root.children[0]!.data.B).toEqual(['aa'])
    expect(gs.gameTree.root.children[0]!.children[0]!.data.W).toEqual(['bb'])
    expect(gs.gameTree.root.children[0]!.children[0]!.children[0]!.data.B).toEqual(['cc'])
    expect(gs.currentPlayer).toBe(-1)
  })
})

describe('gameState — getAutoSetupColor (셋업 교대 색)', () => {
  test('empty tree: the side to move', () => {
    const gs = createGameState(9)
    expect(gs.getAutoSetupColor()).toBe(1)
  })

  test('after a black setup stone the next auto color is white, and vice versa', () => {
    const gs = createGameState(9)
    expect(gs.placeSetupStone([0, 0], gs.getAutoSetupColor())).toBe(true) // B
    expect(gs.getAutoSetupColor()).toBe(-1)
    expect(gs.placeSetupStone([1, 1], gs.getAutoSetupColor())).toBe(true) // W
    expect(gs.getAutoSetupColor()).toBe(1)
    expect(gs.getSignMap()[0]![0]).toBe(1)
    expect(gs.getSignMap()[1]![1]).toBe(-1)
    // Setup placements never change the turn.
    expect(gs.currentPlayer).toBe(1)
  })

  test('after a normal move the setup color follows the side to move', () => {
    const gs = createGameState(9)
    gs.makeMove([0, 0]) // B move — white to play
    expect(gs.getAutoSetupColor()).toBe(-1)
  })
})

describe('gameState — setup stones (셋업 배치 AB/AW)', () => {
  test('placeSetupStone records AB/AW and keeps the turn and lastMove', () => {
    const gs = createGameState(9)
    gs.makeMove([0, 0]) // 1 move — white to play
    const turnBefore = gs.currentPlayer
    const lastMoveBefore = gs.lastMove

    expect(gs.placeSetupStone([4, 4], -1)).toBe(true)
    expect(gs.placeSetupStone([5, 5], 1)).toBe(true)

    expect(gs.getSignMap()[4]![4]).toBe(-1)
    expect(gs.getSignMap()[5]![5]).toBe(1)
    expect(gs.currentPlayer).toBe(turnBefore) // 차례 불변
    expect(gs.lastMove).toEqual(lastMoveBefore)

    // Nodes carry setup properties, no B/W — they never count as moves.
    const tip = gs.gameTree.get(gs.gameTree.currentId!)!
    expect(tip.data.AB).toEqual(['ff'])
    expect(tip.data.B).toBeUndefined()
  })

  test('occupied vertex rejected (no overwrite)', () => {
    const gs = createGameState(9)
    gs.makeMove([4, 4])
    expect(gs.placeSetupStone([4, 4], -1)).toBe(false)
    expect(gs.getSignMap()[4]![4]).toBe(1)
    // Setup nodes were not appended either.
    expect(gs.gameTree.root.children[0]!.children).toHaveLength(0)
  })

  test('0-liberty setup placement rejected (착수 후 활로 0인 그룹 차단)', () => {
    const gs = createGameState(9)
    // Surround the corner point (0,0) with black stones.
    gs.placeSetupStone([1, 0], 1)
    gs.placeSetupStone([0, 1], 1)
    expect(gs.placeSetupStone([0, 0], -1)).toBe(false) // white would have 0 liberties
    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.placeSetupStone([0, 0], 1)).toBe(true) // same color joins the group with liberties
    expect(gs.getSignMap()[0]![0]).toBe(1)
  })

  test('capturing setup placement is allowed and the board stays navigation-consistent', () => {
    const gs = createGameState(9)
    // White corner stone at (0,0); black setup stone at (0,1) plus a move
    // at (1,0) capture it — replay must match the live board exactly.
    gs.placeSetupStone([0, 0], -1)
    gs.makeMove([1, 0]) // B
    expect(gs.placeSetupStone([0, 1], 1)).toBe(true) // captures W(0,0)

    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.getSignMap()[1]![0]).toBe(1)
    expect(gs.getSignMap()[0]![1]).toBe(1)
    // Setup captures do not count toward the capture tally (getCurrentBoard rule).
    expect(gs.board.getCaptures(1)).toBe(0)

    // Navigating away and back rebuilds the identical position.
    expect(gs.undo()).toBe(true)
    expect(gs.redo()).toBe(true)
    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.getSignMap()[0]![1]).toBe(1)
  })

  test('undo removes a setup stone and restores the previous position', () => {
    const gs = createGameState(9)
    gs.placeSetupStone([2, 2], 1)
    const afterSetup = gs.getSignMap()
    expect(gs.undo()).toBe(true)
    expect(gs.getSignMap()[2]![2]).toBe(0)
    expect(gs.currentPlayer).toBe(1)
    // Redo reapplies it from the tree.
    expect(gs.redo()).toBe(true)
    expect(gs.getSignMap()).toEqual(afterSetup)
  })

  test('a game with only setup stones restores from its tree with the turn preserved', () => {
    const gs = createGameState(9)
    expect(gs.placeSetupStone([3, 3], -1)).toBe(true)
    const restored = createGameState(9, gs.gameTree)
    expect(restored.getSignMap()[3]![3]).toBe(-1)
    expect(restored.currentPlayer).toBe(1) // no moves — black to play
    expect(restored.lastMove).toBeNull()
  })
})
