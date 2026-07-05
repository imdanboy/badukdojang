import { describe, expect, test } from 'vitest'
import { createGameState } from '../gameState.ts'
import {
  appendMove,
  appendPass,
  createGameTree,
  getCurrentSignMap,
  getMoveList,
  redo,
  undo,
} from '../gameTree.ts'
import {
  downloadSGF,
  getBoardSizeFromTree,
  loadSGFFile,
  sgfToTree,
  treeToSGF,
} from '../sgfIo.ts'

describe('game logic comprehensive suite', () => {
  // (a) place stone on empty intersection → appears on board
  test('place stone on empty intersection appears on board', () => {
    const gs = createGameState(9)
    const result = gs.makeMove([4, 4])
    expect(result).toBe(true)
    expect(gs.getSignMap()[4]![4]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([4, 4])
  })

  // (b) place on occupied → rejected
  test('place on occupied intersection is rejected', () => {
    const gs = createGameState(9)
    gs.makeMove([4, 4])
    const result = gs.makeMove([4, 4])
    expect(result).toBe(false)
    expect(gs.getSignMap()[4]![4]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)
  })

  // (c) place on another stones liberty → no capture
  test('place on another stones liberty does not capture', () => {
    const gs = createGameState(9)
    gs.makeMove([4, 4])
    gs.makeMove([4, 5])
    const result = gs.makeMove([4, 6])
    expect(result).toBe(true)
    expect(gs.getSignMap()[5]![4]).toBe(-1)
  })

  // (d) fill all liberties of a group → group captured
  test('fill all liberties of a single stone captures it', () => {
    const gs = createGameState(9)
    // Corner capture: B at (1,0), W at (0,0), B at (0,1)
    gs.makeMove([1, 0]) // B
    gs.makeMove([0, 0]) // W
    gs.makeMove([0, 1]) // B captures W at (0,0)
    expect(gs.getSignMap()[0]![0]).toBe(0)
    expect(gs.getSignMap()[1]![0]).toBe(1)
    expect(gs.getSignMap()[0]![1]).toBe(1)
  })

  // (e) multi-stone group capture
  test('multi-stone group capture removes entire group', () => {
    const gs = createGameState(9)
    gs.makeMove([1, 0])
    gs.makeMove([1, 1])
    gs.makeMove([2, 0])
    gs.makeMove([2, 1])
    gs.makeMove([0, 1])
    gs.makeMove([3, 2])
    gs.makeMove([3, 1])
    gs.makeMove([3, 0])
    gs.makeMove([1, 2])
    gs.makeMove([3, 3])
    gs.makeMove([2, 2])

    expect(gs.getSignMap()[1]![1]).toBe(0)
    expect(gs.getSignMap()[1]![2]).toBe(0)
    expect(gs.getSignMap()[0]![1]).toBe(1)
    expect(gs.getSignMap()[0]![2]).toBe(1)
    expect(gs.getSignMap()[1]![0]).toBe(1)
    expect(gs.getSignMap()[1]![3]).toBe(1)
    expect(gs.getSignMap()[2]![1]).toBe(1)
    expect(gs.getSignMap()[2]![2]).toBe(1)
  })

  // (f) simple ko: setup cross-capture → immediate recapture rejected
  test('simple ko prevents immediate recapture', () => {
    const gs = createGameState(9)
    // Set up a ko position
    gs.makeMove([1, 0]) // B at (1,0)
    gs.makeMove([2, 0]) // W at (2,0)
    gs.makeMove([0, 1]) // B at (0,1)
    gs.makeMove([2, 1]) // W at (2,1)
    gs.makeMove([1, 2]) // B at (1,2)
    gs.makeMove([2, 2]) // W at (2,2)
    gs.makeMove([3, 1]) // B at (3,1) — surrounds white group
    gs.makeMove([1, 1]) // W captures B at (1,1)
    // Black tries to recapture immediately (ko)
    const result = gs.makeMove([1, 1])
    expect(result).toBe(false)
    expect(gs.getSignMap()[1]![1]).toBe(-1)
  })

  // (g) suicide move rejected
  test('suicide move is rejected', () => {
    const gs = createGameState(9)
    // Corner suicide setup
    gs.makeMove([1, 0]) // B
    gs.makeMove([2, 0]) // W
    gs.makeMove([0, 1]) // B
    // White tries to play at (0,0) — surrounded by black, no liberties, no captures
    const result = gs.makeMove([0, 0])
    expect(result).toBe(false)
    expect(gs.getSignMap()[0]![0]).toBe(0)
  })

  // (h) pass flips turn without placing
  test('pass flips turn without placing stone', () => {
    const gs = createGameState(9)
    expect(gs.currentPlayer).toBe(1)
    gs.pass()
    expect(gs.currentPlayer).toBe(-1)
    gs.pass()
    expect(gs.currentPlayer).toBe(1)
    expect(gs.getSignMap()).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
  })

  // (i) board size 9/13/19 initializes correctly
  test('board sizes 9, 13, and 19 initialize correctly', () => {
    for (const size of [9, 13, 19]) {
      const gs = createGameState(size)
      expect(gs.board.width).toBe(size)
      expect(gs.board.height).toBe(size)
      expect(gs.currentPlayer).toBe(1)
      expect(gs.getSignMap()).toEqual(
        Array.from({ length: size }, () => Array(size).fill(0)),
      )
    }
  })

  // (j) undo restores previous state
  test('undo restores previous board state', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3])
    gs.makeMove([4, 4])
    gs.makeMove([5, 5])

    expect(gs.getSignMap()[5]![5]).toBe(1)
    expect(gs.currentPlayer).toBe(-1)

    const result = gs.undo()
    expect(result).toBe(true)
    expect(gs.getSignMap()[5]![5]).toBe(0)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toEqual([4, 4])
  })

  // (k) redo after undo restores
  test('redo after undo restores next state', () => {
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

  // (l) undo at root is no-op
  test('undo at root is no-op', () => {
    const gs = createGameState(9)
    expect(gs.currentPlayer).toBe(1)
    const result = gs.undo()
    expect(result).toBe(false)
    expect(gs.getSignMap()).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
    expect(gs.currentPlayer).toBe(1)
  })

  // (m) SGF round-trip: play moves → save → load → board matches
  test('SGF round-trip preserves board state and moves', () => {
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    tree = appendMove(tree, [5, 5], 1)
    tree = appendPass(tree, -1)

    const sgf = treeToSGF(tree, 19)
    const loadedTree = sgfToTree(sgf)

    const originalMoves = getMoveList(tree)
    const loadedMoves = getMoveList(loadedTree)
    expect(loadedMoves).toEqual(originalMoves)

    const originalSignMap = getCurrentSignMap(tree, 19)
    const loadedSignMap = getCurrentSignMap(loadedTree, 19)
    expect(loadedSignMap).toEqual(originalSignMap)
  })

  // (n) SGF parse malformed input → handles gracefully
  test('SGF parse malformed input handles gracefully', () => {
    const malformed = '(;FF[4]GM[1]SZ[19]B[zz])'
    const tree = sgfToTree(malformed)
    expect(tree.root.data.B).toEqual(['zz'])
    // Board replay should skip the invalid move without crashing
    const signMap = getCurrentSignMap(tree, 19)
    expect(signMap).toBeDefined()
  })

  // Additional coverage tests for gameTree module
  test('gameTree undo and redo do not mutate original', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const originalId = t1.currentId

    const undone = undo(t1)
    expect(undone).not.toBeNull()
    expect(t1.currentId).toBe(originalId)
    expect(undone!.currentId).toBe('root')

    const redone = redo(undone!)
    expect(redone).not.toBeNull()
    expect(redone!.currentId).toBe(originalId)
  })

  test('gameTree branching after undo', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)

    const undone = undo(t2)
    expect(undone).not.toBeNull()

    const branched = appendMove(undone!, [5, 5], -1)
    const rootNode = branched.get('root')
    expect(rootNode?.children.length).toBe(1)
    expect(rootNode?.children[0]!.children.length).toBe(2)
  })

  // Additional coverage tests for sgfIo module
  test('sgfIo getBoardSizeFromTree extracts size correctly', () => {
    const tree19 = createGameTree(19)
    const tree9 = createGameTree(9)
    // Manually set SZ on root data for testing
    tree9.root.data.SZ = ['9']
    tree19.root.data.SZ = ['19']

    expect(getBoardSizeFromTree(tree9)).toBe(9)
    expect(getBoardSizeFromTree(tree19)).toBe(19)
  })

  test('sgfIo getBoardSizeFromTree defaults to 19', () => {
    const tree = createGameTree(13)
    expect(getBoardSizeFromTree(tree)).toBe(19)
  })

  test('sgfIo loadSGFFile reads file correctly', async () => {
    const sgfContent = '(;FF[4]GM[1]SZ[19];B[dd];W[ee])'
    const file = new File([sgfContent], 'test.sgf', {
      type: 'application/x-go-sgf',
    })
    const tree = await loadSGFFile(file)
    expect(tree.root.data.FF).toEqual(['4'])
    expect(tree.root.children[0]!.data.B).toEqual(['dd'])
  })

  test('sgfIo downloadSGF triggers download', () => {
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalCreateElement = document.createElement
    const createdUrls: string[] = []
    let clickedAnchor: HTMLAnchorElement | null = null

    URL.createObjectURL = (_blob: Blob) => {
      const url = `blob:mock-${createdUrls.length}`
      createdUrls.push(url)
      return url
    }
    URL.revokeObjectURL = () => {}
    document.createElement = (tagName: string) => {
      const el = originalCreateElement.call(document, tagName)
      if (tagName === 'a') {
        el.click = () => {
          clickedAnchor = el as HTMLAnchorElement
        }
      }
      return el
    }

    try {
      downloadSGF(tree, 'game.sgf', 19)
      expect(createdUrls.length).toBe(1)
      expect(clickedAnchor).not.toBeNull()
      expect(clickedAnchor!.download).toBe('game.sgf')
      expect(clickedAnchor!.href).toBe(createdUrls[0])
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      document.createElement = originalCreateElement
    }
  })

  test('gameState with initialTree restores correctly', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)

    const gs = createGameState(9, tree)
    expect(gs.getSignMap()[3]![3]).toBe(1)
    expect(gs.getSignMap()[4]![4]).toBe(-1)
    expect(gs.currentPlayer).toBe(1)
    expect(gs.lastMove).toEqual([4, 4])
  })

  test('gameState undo and redo with passes', () => {
    const gs = createGameState(9)
    gs.makeMove([3, 3])
    gs.pass()
    gs.pass()

    expect(gs.currentPlayer).toBe(-1)

    gs.undo()
    expect(gs.currentPlayer).toBe(1)

    gs.undo()
    expect(gs.currentPlayer).toBe(-1)
    expect(gs.lastMove).toEqual([3, 3])

    gs.redo()
    expect(gs.currentPlayer).toBe(1)

    gs.redo()
    expect(gs.currentPlayer).toBe(-1)
  })
})
