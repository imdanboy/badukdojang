import { describe, expect, test } from 'vitest'
import {
  appendMove,
  appendPass,
  createGameTree,
  getCurrentSignMap,
  getMoveList,
  redo,
  undo,
} from './gameTree.ts'

describe('gameTree', () => {
  test('createGameTree initializes with root node', () => {
    const tree = createGameTree(9)
    expect(tree.root.id).toBe('root')
    expect(tree.root.data).toEqual({})
    expect(tree.root.children).toEqual([])
    expect(tree.currentId).toBe('root')
  })

  test('appendMove adds a move node with SGF coordinates', () => {
    const tree = createGameTree(9)
    const newTree = appendMove(tree, [3, 3], 1)
    expect(newTree.currentId).not.toBe('root')
    const node = newTree.get(newTree.currentId!)
    expect(node?.data.B).toEqual(['dd'])
  })

  test('appendMove alternates colors', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const n1 = t2.get(t1.currentId!)
    const n2 = t2.get(t2.currentId!)
    expect(n1?.data.B).toEqual(['aa'])
    expect(n2?.data.W).toEqual(['bb'])
  })

  test('appendPass adds a pass node with empty property', () => {
    const tree = createGameTree(9)
    const newTree = appendPass(tree, 1)
    const node = newTree.get(newTree.currentId!)
    expect(node?.data.B).toEqual([])
  })

  test('undo restores previous board state', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)
    const t3 = appendMove(t2, [5, 5], 1)

    const signMap3 = getCurrentSignMap(t3, 9)
    expect(signMap3[3]![3]).toBe(1)
    expect(signMap3[4]![4]).toBe(-1)
    expect(signMap3[5]![5]).toBe(1)

    const undone = undo(t3)
    expect(undone).not.toBeNull()
    const signMap2 = getCurrentSignMap(undone!, 9)
    expect(signMap2[3]![3]).toBe(1)
    expect(signMap2[4]![4]).toBe(-1)
    expect(signMap2[5]![5]).toBe(0)
  })

  test('redo restores next board state', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)
    const t3 = appendMove(t2, [5, 5], 1)

    const undone = undo(t3)
    expect(undone).not.toBeNull()
    const redone = redo(undone!)
    expect(redone).not.toBeNull()

    const signMap = getCurrentSignMap(redone!, 9)
    expect(signMap[3]![3]).toBe(1)
    expect(signMap[4]![4]).toBe(-1)
    expect(signMap[5]![5]).toBe(1)
  })

  test('undo at root is no-op', () => {
    const tree = createGameTree(9)
    const result = undo(tree)
    expect(result).toBeNull()
    expect(getCurrentSignMap(tree, 9)).toEqual(
      Array.from({ length: 9 }, () => Array(9).fill(0)),
    )
  })

  test('redo at leaf is no-op', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const result = redo(t1)
    expect(result).toBeNull()
  })

  test('getMoveList returns correct sequence', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendPass(t2, 1)

    const moves = getMoveList(t3)
    expect(moves).toEqual([
      { vertex: [0, 0], sign: 1 },
      { vertex: [1, 1], sign: -1 },
      { vertex: 'pass', sign: 1 },
    ])
  })

  test('getMoveList after undo returns truncated sequence', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)

    const undone = undo(t3)
    expect(undone).not.toBeNull()
    const moves = getMoveList(undone!)
    expect(moves).toEqual([
      { vertex: [0, 0], sign: 1 },
      { vertex: [1, 1], sign: -1 },
    ])
  })

  test('undo does not mutate original tree', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const originalCurrentId = t1.currentId

    const undone = undo(t1)
    expect(undone).not.toBeNull()
    expect(t1.currentId).toBe(originalCurrentId)
    expect(undone!.currentId).toBe('root')
  })

  test('after undo + new move, tree branches', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)

    const undone = undo(t2)
    expect(undone).not.toBeNull()

    // New move from undone position creates a branch
    const branched = appendMove(undone!, [5, 5], -1)
    const rootNode = branched.get('root')
    expect(rootNode?.children.length).toBe(1)

    const firstNode = rootNode?.children[0]
    expect(firstNode?.children.length).toBe(2) // two branches
  })

  test('getCurrentSignMap replays captures correctly', () => {
    const tree = createGameTree(9)
    // Corner capture: B at (1,0), W at (0,0), B at (0,1) captures W
    const t1 = appendMove(tree, [1, 0], 1)
    const t2 = appendMove(t1, [0, 0], -1)
    const t3 = appendMove(t2, [0, 1], 1)

    const signMap = getCurrentSignMap(t3, 9)
    expect(signMap[0]![0]).toBe(0) // captured
    expect(signMap[1]![0]).toBe(1)
    expect(signMap[0]![1]).toBe(1)
  })

  test('multiple undos and redos', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)

    let current = t3
    current = undo(current)!
    current = undo(current)!
    expect(getCurrentSignMap(current, 9)[0]![0]).toBe(1)
    expect(getCurrentSignMap(current, 9)[1]![1]).toBe(0)

    current = redo(current)!
    expect(getCurrentSignMap(current, 9)[1]![1]).toBe(-1)

    current = redo(current)!
    expect(getCurrentSignMap(current, 9)[2]![2]).toBe(1)
  })
})
