import { describe, expect, test } from 'vitest'
import {
  appendMove,
  appendPass,
  createGameTree,
  getCurrentSignMap,
  getMoveList,
  getMoveNumberMap,
  getPathNodes,
  navigateToNode,
  redo,
  undo,
} from './gameTree.ts'
import { sgfToTree } from './sgfIo.ts'

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

describe('navigateToNode / getPathNodes', () => {
  function buildVariationTree(): { tree: ReturnType<typeof createGameTree>; ids: [string, string, string, string, string] } {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // m1
    tree = appendMove(tree, [1, 1], -1) // m2
    tree = appendMove(tree, [2, 2], 1) // m3 main
    const m3Main = String(tree.currentId!)
    const atM2 = navigateToNode(tree, tree.root.children[0]!.children[0]!.id)
    tree = appendMove(atM2!, [5, 5], 1) // m3 variation
    const m3Var = String(tree.currentId!)
    return {
      tree,
      ids: [
        'root',
        String(tree.root.children[0]!.id),
        String(tree.root.children[0]!.children[0]!.id),
        m3Main,
        m3Var,
      ],
    }
  }

  test('navigateToNode sets the cursor to an arbitrary branch node', () => {
    const { tree, ids } = buildVariationTree()
    const navigated = navigateToNode(tree, ids[3])
    expect(navigated).not.toBeNull()
    expect(String(navigated!.currentId!)).toBe(ids[3])
    // Path replay shows the main line position.
    const signMap = getCurrentSignMap(navigated!, 9)
    expect(signMap[2]![2]).toBe(1)
    expect(signMap[5]![5]).toBe(0)
  })

  test('navigateToNode accepts stringified numeric ids', () => {
    const { tree, ids } = buildVariationTree()
    const navigated = navigateToNode(tree, ids[4])
    expect(String(navigated!.currentId!)).toBe(ids[4])
  })

  test('navigateToNode does not mutate the input tree', () => {
    const { tree, ids } = buildVariationTree()
    const before = String(tree.currentId!)
    navigateToNode(tree, ids[3])
    expect(String(tree.currentId!)).toBe(before)
  })

  test('navigateToNode returns null for an unknown id', () => {
    const tree = createGameTree(9)
    expect(navigateToNode(tree, 'nope')).toBeNull()
  })

  test('playing a new move from an earlier node preserves the sibling variation', () => {
    const { tree, ids } = buildVariationTree()
    // Jump to m1 and play a different second move — m2/m3 stay in the tree.
    const atM1 = navigateToNode(tree, ids[1])!
    const branched = appendMove(atM1, [7, 7], -1)
    const m1Node = branched.get(branched.root.children[0]!.id)!
    expect(m1Node.children.length).toBe(2)
    // The old variation subtree is intact and still navigable.
    const backToOldVar = navigateToNode(branched, ids[4])
    expect(backToOldVar).not.toBeNull()
    expect(getMoveList(backToOldVar!)).toHaveLength(3)
  })

  test('getPathNodes returns root-first inclusive path', () => {
    const { tree, ids } = buildVariationTree()
    const path = getPathNodes(tree, ids[4])!
    expect(path.map((n) => String(n.id))).toEqual([ids[0], ids[1], ids[2], ids[4]])
  })

  test('getPathNodes returns null for an unknown id', () => {
    const tree = createGameTree(9)
    expect(getPathNodes(tree, 'missing')).toBeNull()
  })
})

describe('getMoveNumberMap', () => {
  test('numbers stones along the current path in order', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9)!
    expect(numbers[0]![0]).toBe(1)
    expect(numbers[1]![1]).toBe(2)
    expect(numbers[2]![2]).toBe(3)
    // Nothing else is numbered.
    let count = 0
    for (const row of numbers) for (const n of row) if (n != null) count += 1
    expect(count).toBe(3)
  })

  test('following a variation renumbers to the selected line', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const atM1 = navigateToNode(t2, t1.currentId!)!
    const variation = appendMove(atM1, [5, 5], -1)

    // Main line still numbered by its own path.
    const mainNumbers = getMoveNumberMap(t2, 9)!
    expect(mainNumbers[1]![1]).toBe(2)
    expect(mainNumbers[5]![5]).toBeNull()

    // Variation shows its own numbering.
    const varNumbers = getMoveNumberMap(variation, 9)!
    expect(varNumbers[5]![5]).toBe(2)
    expect(varNumbers[1]![1]).toBeNull()
  })

  test('passes advance the counter but carry no label', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendPass(t1, -1)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9)!
    expect(numbers[0]![0]).toBe(1)
    expect(numbers[2]![2]).toBe(3) // pass consumed number 2
  })

  test('setup stones (AB/AW) are never numbered', () => {
    const tree = createGameTree(9)
    tree.root.data = { AB: ['aa'] } as typeof tree.root.data
    const t1 = appendMove(tree, [2, 2], 1)

    const numbers = getMoveNumberMap(t1, 9)!
    expect(numbers[0]![0]).toBeNull() // setup stone — unlabeled
    expect(numbers[2]![2]).toBe(1)
  })

  test('captured stones lose their label', () => {
    const tree = createGameTree(9)
    // B(1,0), W(0,0), B(0,1) captures the white stone.
    const t1 = appendMove(tree, [1, 0], 1)
    const t2 = appendMove(t1, [0, 0], -1)
    const t3 = appendMove(t2, [0, 1], 1)

    const numbers = getMoveNumberMap(t3, 9)!
    expect(numbers[0]![0]).toBeNull() // captured white stone at (0,0)
    expect(numbers[0]![1]).toBe(1) // B(1,0) — vertex x=1, y=0
    expect(numbers[1]![0]).toBe(3) // B(0,1) — vertex x=0, y=1
  })

  test('a re-played vertex shows the latest move number', () => {
    const tree = createGameTree(9)
    // (0,0) is played at move 1 (B), captured at move 4 (W), refilled at
    // move 6 (W), recaptured as a group at move 9 (B), and finally played
    // again at move 10 (W) — the surviving stone must show move 10.
    const moves: Array<[number, number]> = [
      [0, 0], // 1 B(0,0)
      [1, 0], // 2 W(1,0)
      [5, 5], // 3 B tenuki
      [0, 1], // 4 W captures B(0,0)
      [2, 0], // 5 B reduces W liberties
      [0, 0], // 6 W refills (0,0)
      [0, 2], // 7 B reduces W liberties
      [5, 4], // 8 W tenuki
      [1, 1], // 9 B captures W(0,0)+W(1,0)+W(0,1)
      [0, 0], // 10 W re-plays (0,0)
    ]
    let current = tree
    moves.forEach(([x, y], index) => {
      const sign = index % 2 === 0 ? 1 : -1
      current = appendMove(current, [x, y], sign)
    })

    const numbers = getMoveNumberMap(current, 9)!
    expect(numbers[0]![0]).toBe(10) // latest placement wins
    expect(numbers[0]![1]).toBeNull() // W(1,0) captured with the group
    expect(numbers[1]![0]).toBeNull() // W(0,1) captured with the group
    expect(numbers[0]![2]).toBe(5) // B(2,0)
    expect(numbers[2]![0]).toBe(7) // B(0,2)
    expect(numbers[1]![1]).toBe(9) // B(1,1)
    expect(numbers[5]![5]).toBe(3)
    expect(numbers[4]![5]).toBe(8) // W(5,4) — move 8, vertex x=5, y=4
  })

  test('board labels stay sequential across a comment-only node (parsed SGF)', () => {
    // Valid SGF main line: B move, comment-only node, W move.
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];C[mid note];W[bb])')
    const numbers = getMoveNumberMap(tree, 9)!
    expect(numbers[0]![0]).toBe(1) // B[aa]
    expect(numbers[1]![1]).toBe(2) // W[bb] — NOT 1
  })
})

describe('getMoveNumberMap — fromNodeId (여기부터 numbering)', () => {
  test('numbering restarts at 1 on the anchor node itself', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const anchorId = String(t2.currentId!)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9, { fromNodeId: anchorId })!
    expect(numbers[1]![1]).toBe(1) // anchor's own move
    expect(numbers[2]![2]).toBe(2)
    expect(numbers[0]![0]).toBeNull() // earlier move — label hidden
  })

  test('a negative (parsed SGF) id works the same as a string id', () => {
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];W[bb];B[cc])')
    const firstMoveId = String(tree.root.children[0]!.id)
    const numbers = getMoveNumberMap(tree, 9, { fromNodeId: firstMoveId })!
    expect(numbers[0]![0]).toBe(1)
    expect(numbers[1]![1]).toBe(2)
    expect(numbers[2]![2]).toBe(3)
  })

  test('a pass anchor counts itself (no label) and numbers following moves', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendPass(t1, -1)
    const anchorId = String(t2.currentId!)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9, { fromNodeId: anchorId })!
    expect(numbers[2]![2]).toBe(2) // pass = 1, next move = 2
    expect(numbers[0]![0]).toBeNull() // before the anchor — hidden
  })

  test('a root anchor numbers the next move as 1', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)

    const numbers = getMoveNumberMap(t1, 9, { fromNodeId: 'root' })!
    expect(numbers[0]![0]).toBe(1)
  })

  test('an anchor off the current path yields no labels (sibling branches never mislabeled)', () => {
    // Line A: (0,0)(1,1)(2,2); undo to (1,1) and fork line B: (5,5).
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)
    const mainTipId = String(t3.currentId!)

    const atM2 = navigateToNode(t3, t2.currentId!)!
    const variation = appendMove(atM2, [5, 5], -1)

    // Anchor = main tip; cursor on the variation → anchor is not an ancestor.
    expect(getMoveNumberMap(variation, 9, { fromNodeId: mainTipId })).toBeNull()
  })

  test('navigating the cursor back to before the anchor hides the labels', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)
    const tipId = String(t3.currentId!)

    const undone = undo(t3)!
    expect(getMoveNumberMap(undone, 9, { fromNodeId: tipId })).toBeNull()
  })

  test('an anchor above a fork numbers each descendant branch from its own moves', () => {
    // Line A: (0,0)(1,1)(2,2); undo to (0,0) and fork line B: (5,5).
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const atM1 = navigateToNode(t2, t1.currentId!)!
    const variation = appendMove(atM1, [5, 5], -1)
    const m1Id = String(t1.currentId!)

    // Both branches keep the anchor's own move as 1 and continue locally.
    const mainNumbers = getMoveNumberMap(t2, 9, { fromNodeId: m1Id })!
    expect(mainNumbers[0]![0]).toBe(1)
    expect(mainNumbers[1]![1]).toBe(2)
    const varNumbers = getMoveNumberMap(variation, 9, { fromNodeId: m1Id })!
    expect(varNumbers[0]![0]).toBe(1)
    expect(varNumbers[5]![5]).toBe(2)
  })

  test('a stone captured after the anchor loses its label; setup stones stay unlabeled', () => {
    const tree = createGameTree(9)
    tree.root.data = { AB: ['ee'] } as typeof tree.root.data
    // Anchor = move 1 — B(1,0); then W(0,0), B(0,1) capture that white stone.
    const t1 = appendMove(tree, [1, 0], 1)
    const anchorId = String(t1.currentId!)
    const t2 = appendMove(t1, [0, 0], -1)
    const t3 = appendMove(t2, [0, 1], 1)

    const numbers = getMoveNumberMap(t3, 9, { fromNodeId: anchorId })!
    expect(numbers[0]![1]).toBe(1) // anchor's stone (x=1, y=0) survives
    expect(numbers[0]![0]).toBeNull() // W(0,0) captured — no label
    expect(numbers[1]![0]).toBe(3) // B(0,1) — counter keeps moving through the capture
    expect(numbers[4]![4]).toBeNull() // setup stone — unlabeled even in view
  })
})
