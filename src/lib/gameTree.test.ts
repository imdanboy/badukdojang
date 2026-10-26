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

describe('getMoveNumberMap — fromNodeId (번호 표시 numbering)', () => {
  test('numbering starts at 1 on the move AFTER the anchor; the anchor stone stays unlabeled', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const anchorId = String(t2.currentId!)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9, { fromNodeId: anchorId })!
    expect(numbers[0]![0]).toBeNull() // earlier move — label hidden
    expect(numbers[1]![1]).toBeNull() // anchor's own stone — already on the board, unlabeled
    expect(numbers[2]![2]).toBe(1) // first move after the anchor
  })

  test('a negative (parsed SGF) id works the same as a string id', () => {
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];W[bb];B[cc])')
    const firstMoveId = String(tree.root.children[0]!.id)
    const numbers = getMoveNumberMap(tree, 9, { fromNodeId: firstMoveId })!
    expect(numbers[0]![0]).toBeNull() // anchor's own stone — unlabeled
    expect(numbers[1]![1]).toBe(1)
    expect(numbers[2]![2]).toBe(2)
  })

  test('a pass anchor does not consume a number; the next move is 1', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendPass(t1, -1)
    const anchorId = String(t2.currentId!)
    const t3 = appendMove(t2, [2, 2], 1)

    const numbers = getMoveNumberMap(t3, 9, { fromNodeId: anchorId })!
    expect(numbers[2]![2]).toBe(1) // first move after the anchor
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

  test('an anchor above a fork numbers each descendant branch from its own moves after the anchor', () => {
    // Line A: (0,0)(1,1)(2,2); undo to (0,0) and fork line B: (5,5).
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const atM1 = navigateToNode(t2, t1.currentId!)!
    const variation = appendMove(atM1, [5, 5], -1)
    const m1Id = String(t1.currentId!)

    // The anchor's own stone stays unlabeled; each branch's later moves
    // number locally from 1.
    const mainNumbers = getMoveNumberMap(t2, 9, { fromNodeId: m1Id })!
    expect(mainNumbers[0]![0]).toBeNull() // anchor's own stone — unlabeled
    expect(mainNumbers[1]![1]).toBe(1)
    const varNumbers = getMoveNumberMap(variation, 9, { fromNodeId: m1Id })!
    expect(varNumbers[0]![0]).toBeNull()
    expect(varNumbers[5]![5]).toBe(1)
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
    expect(numbers[0]![1]).toBeNull() // anchor's own stone (x=1, y=0) — unlabeled
    expect(numbers[0]![0]).toBeNull() // W(0,0) — first move after the anchor, but captured
    expect(numbers[1]![0]).toBe(2) // B(0,1) — counter keeps moving through the capture
    expect(numbers[4]![4]).toBeNull() // setup stone — unlabeled even in view
  })
})

describe('appendMove/appendPass — duplicate variation reuse', () => {
  /** Add a child with raw data under a parent and park the cursor there. */
  function addChild(
    tree: ReturnType<typeof createGameTree>,
    parentId: string | number,
    data: Record<string, string[]>,
  ): ReturnType<typeof createGameTree> {
    const newTree = tree.mutate((draft) => {
      draft.appendNode(parentId, data)
    })
    const parent = newTree.get(parentId)
    newTree.currentId = parent?.children[parent.children.length - 1]!.id ?? newTree.root.id
    return newTree
  }

  test('replaying the same complete line from the root reuses the existing branch', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)
    const m1Id = String(t1.currentId!)
    const tipId = String(t2.currentId!)

    const atRoot = navigateToNode(t2, 'root')!
    const replay1 = appendMove(atRoot, [3, 3], 1)
    expect(String(replay1.currentId!)).toBe(m1Id) // reused, not a new sibling
    const replay2 = appendMove(replay1, [4, 4], -1)
    expect(String(replay2.currentId!)).toBe(tipId)

    // No duplicate branch was created.
    expect(replay2.root.children).toHaveLength(1)
    expect(replay2.root.children[0]!.children).toHaveLength(1)
    expect(getMoveList(replay2)).toEqual([
      { vertex: [3, 3], sign: 1 },
      { vertex: [4, 4], sign: -1 },
    ])
  })

  test('a continuation replayed from a mid-game node reuses the shared continuation', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendMove(t1, [1, 1], -1)
    const t3 = appendMove(t2, [2, 2], 1)
    const m2Id = String(t2.currentId!)
    const m3Id = String(t3.currentId!)

    const atM1 = navigateToNode(t3, t1.currentId!)!
    const replayM2 = appendMove(atM1, [1, 1], -1)
    expect(String(replayM2.currentId!)).toBe(m2Id)
    const replayM3 = appendMove(replayM2, [2, 2], 1)
    expect(String(replayM3.currentId!)).toBe(m3Id)

    // m1 still has exactly one child — the shared continuation.
    const m1Node = replayM3.root.children[0]!
    expect(m1Node.children).toHaveLength(1)
    expect(getMoveList(replayM3)).toHaveLength(3)
  })

  test('a different first move still creates a variation', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)

    const atRoot = navigateToNode(t2, 'root')!
    const branched = appendMove(atRoot, [5, 5], 1)
    expect(branched.root.children).toHaveLength(2)
    expect(getMoveList(branched)).toEqual([{ vertex: [5, 5], sign: 1 }])
  })

  test('a same-color different move at the same point stays a separate sibling', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1) // B[dd]

    const atRoot = navigateToNode(t1, 'root')!
    const branched = appendMove(atRoot, [4, 4], 1) // B[ee] — different coordinate
    expect(branched.root.children).toHaveLength(2)
    expect(branched.root.children[0]!.data.B).toEqual(['dd'])
    expect(branched.root.children[1]!.data.B).toEqual(['ee'])
    expect(String(branched.currentId!)).toBe(String(branched.root.children[1]!.id))
  })

  test('a different-color move at the same point stays a separate sibling', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1) // B[dd]

    const atRoot = navigateToNode(t1, 'root')!
    const branched = appendMove(atRoot, [3, 3], -1) // W[dd] — same point, other color
    expect(branched.root.children).toHaveLength(2)
    expect(branched.root.children[0]!.data.B).toEqual(['dd'])
    expect(branched.root.children[1]!.data.W).toEqual(['dd'])
  })

  test('replaying a pass reuses the existing pass node', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [0, 0], 1)
    const t2 = appendPass(t1, -1)
    const passId = String(t2.currentId!)

    const atM1 = navigateToNode(t2, t1.currentId!)!
    const replay = appendPass(atM1, -1)
    expect(String(replay.currentId!)).toBe(passId)
    const m1Node = replay.root.children[0]!
    expect(m1Node.children).toHaveLength(1)
    expect(m1Node.children[0]!.data.W).toEqual([])
  })

  test('a pass of the other color is a separate sibling', () => {
    const tree = createGameTree(9)
    const t1 = appendPass(tree, 1) // Black pass at the root

    const atRoot = navigateToNode(t1, 'root')!
    const branched = appendPass(atRoot, -1) // White pass — different color
    expect(branched.root.children).toHaveLength(2)
    expect(branched.root.children[0]!.data.B).toEqual([])
    expect(branched.root.children[1]!.data.W).toEqual([])
  })

  test('a pass replayed onto an SGF-parsed empty-value pass node is reused', () => {
    // Some SGF writers store a pass as an empty value (W[]) rather than an
    // empty list — board-wise it is the same pass, so it must be reused.
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];W[])')
    const blackMoveId = String(tree.root.children[0]!.id)
    const whitePassId = String(tree.root.children[0]!.children[0]!.id)

    const atBlack = navigateToNode(tree, blackMoveId)!
    const replay = appendPass(atBlack, -1)
    expect(String(replay.currentId!)).toBe(whitePassId)
    expect(replay.root.children[0]!.children).toHaveLength(1)
  })

  test('reuse preserves the comments/annotations on the reused child', () => {
    const tree = createGameTree(9)
    const withComment = addChild(tree, 'root', { B: ['dd'], C: ['great move'] })
    const atRoot = navigateToNode(withComment, 'root')!

    const replayed = appendMove(atRoot, [3, 3], 1)
    expect(replayed.root.children).toHaveLength(1)
    const reused = replayed.get(replayed.currentId!)!
    expect(reused.data.B).toEqual(['dd'])
    expect(reused.data.C).toEqual(['great move'])
  })

  test('a child with setup properties (AB) is not reused for a plain move', () => {
    const tree = createGameTree(9)
    const withSetupChild = addChild(tree, 'root', { B: ['dd'], AB: ['ee'] })
    const atRoot = navigateToNode(withSetupChild, 'root')!

    const appended = appendMove(atRoot, [3, 3], 1) // plain B[dd]
    expect(appended.root.children).toHaveLength(2) // no merge with the AB node
    expect(appended.root.children[0]!.data.AB).toEqual(['ee'])
    expect(appended.root.children[1]!.data.B).toEqual(['dd'])
  })

  test('a child with a player-to-play override is not reused for a plain move', () => {
    const tree = createGameTree(9)
    const withTurnOverride = addChild(tree, 'root', { B: ['dd'], PL: ['W'] })
    const atRoot = navigateToNode(withTurnOverride, 'root')!

    const appended = appendMove(atRoot, [3, 3], 1) // plain B[dd]
    expect(appended.root.children).toHaveLength(2)
    expect(appended.root.children[0]!.data.PL).toEqual(['W'])
    expect(appended.root.children[1]!.data.B).toEqual(['dd'])
  })

  test('a child with a conflicting second move prop is not reused', () => {
    const tree = createGameTree(9)
    const withBothProps = addChild(tree, 'root', { B: ['dd'], W: ['ee'] })
    const atRoot = navigateToNode(withBothProps, 'root')!

    const appended = appendMove(atRoot, [3, 3], 1) // plain B[dd]
    expect(appended.root.children).toHaveLength(2)
  })

  test('reuse does not mutate the input tree and returns a new tree instance', () => {
    const tree = createGameTree(9)
    const t1 = appendMove(tree, [3, 3], 1)
    const t2 = appendMove(t1, [4, 4], -1)
    const originalTipId = String(t2.currentId!)

    const atRoot = navigateToNode(t2, 'root')!
    const replay1 = appendMove(atRoot, [3, 3], 1)

    // Fresh identity — React state updates and the autosave effect depend on it.
    expect(replay1).not.toBe(atRoot)
    // The input tree is untouched.
    expect(String(atRoot.currentId!)).toBe(String(atRoot.root.id))
    expect(t2.root.children).toHaveLength(1)
    expect(String(t2.currentId!)).toBe(originalTipId)
  })

  test('already-duplicated branches remain; reuse picks the first match', () => {
    // Pre-existing duplicates (e.g. from an older SGF) are NOT rewritten —
    // appending the same move again just reuses the first matching child.
    const tree = createGameTree(9)
    const duplicated = tree.mutate((draft) => {
      draft.appendNode(draft.root.id, { B: ['dd'] })
      draft.appendNode(draft.root.id, { B: ['dd'] })
    })

    const replayed = appendMove(duplicated, [3, 3], 1)
    expect(replayed.root.children).toHaveLength(2) // duplicates remain
    expect(String(replayed.currentId!)).toBe(String(replayed.root.children[0]!.id))
  })
})
