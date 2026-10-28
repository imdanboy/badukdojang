import { describe, expect, test } from 'vitest'
import { appendMove, appendPass, createGameTree, navigateToNode } from './gameTree.ts'
import { GameTree } from './gameTree.ts'
import {
  blackPerspectiveWinrate,
  buildWinratePoints,
  collectAnalysisTargets,
  getFirstPlayer,
  getPlayerToPlayAtNode,
  layoutGameTree,
} from './treeLayout.ts'
import { sgfToTree } from './sgfIo.ts'
import type { SgfAnalysisEntry } from './sgfIo.ts'

/**
 * Append a NON-move node (comments, setup-only properties) under the
 * current node and move the cursor onto it — mirrors appendMove's
 * mechanics (same raw-id get, so the kaya GameTree cache is not poisoned).
 */
function appendNonMoveNode(
  tree: GameTree,
  data: { C?: string[]; AB?: string[]; AW?: string[] },
): GameTree {
  const currentId = tree.currentId ?? tree.root.id
  const newTree = tree.mutate((draft) => {
    draft.appendNode(currentId, data)
  })
  const currentNode = newTree.get(currentId)
  const newNode = currentNode?.children[currentNode.children.length - 1]
  newTree.currentId = newNode?.id ?? currentId
  return newTree
}

/** Build a tree with a variation fork: root → m1 → m2 → m3, m2 → m3'. */
function buildTreeWithVariation(): { tree: GameTree; ids: [string, string, string, string, string] } {
  let tree = createGameTree(9)
  tree = appendMove(tree, [0, 0], 1) // m1 B
  tree = appendMove(tree, [1, 1], -1) // m2 W
  tree = appendMove(tree, [2, 2], 1) // m3 B (main line)
  const m3MainId = String(tree.currentId!)
  // Undo to m2 and play a variation move.
  const atM2 = navigateToNode(tree, tree.get(m3MainId)!.parentId!)
  tree = appendMove(atM2!, [5, 5], 1) // m3' B (variation)
  const m3VarId = String(tree.currentId!)
  return {
    tree,
    ids: [
      'root',
      String(tree.root.children[0]!.id), // m1
      String(tree.root.children[0]!.children[0]!.id), // m2
      m3MainId,
      m3VarId,
    ],
  }
}

describe('layoutGameTree', () => {
  test('single line: every node on row 0, columns by depth', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1)
    tree = appendMove(tree, [1, 1], -1)

    const layout = layoutGameTree(tree)
    expect(layout.nodes).toHaveLength(3)
    expect(layout.maxRow).toBe(0)
    expect(layout.maxCol).toBe(2)
    const root = layout.byId.get('root')!
    expect(root.col).toBe(0)
    expect(root.row).toBe(0)
    const m1 = layout.byId.get(String(tree.root.children[0]!.id))!
    expect(m1.col).toBe(1)
    expect(m1.row).toBe(0)
    const m2 = layout.byId.get(String(tree.currentId!))!
    expect(m2.col).toBe(2)
    expect(m2.row).toBe(0)
  })

  test('variation fork: first child continues the row, second opens a new row', () => {
    const { tree, ids } = buildTreeWithVariation()
    const layout = layoutGameTree(tree)

    // root row 0; m1 row 0; m2 row 0; m3(main) row 0; m3(var) row 1
    expect(layout.byId.get(ids[0])!.row).toBe(0)
    expect(layout.byId.get(ids[1])!.row).toBe(0)
    expect(layout.byId.get(ids[2])!.row).toBe(0)
    expect(layout.byId.get(ids[3])!.row).toBe(0)
    expect(layout.byId.get(ids[4])!.row).toBe(1)
    expect(layout.byId.get(ids[4])!.col).toBe(3)
    expect(layout.maxRow).toBe(1)
  })

  test('current path is marked, off-path nodes are not', () => {
    const { tree, ids } = buildTreeWithVariation()
    // Cursor is at the variation tip (ids[4]).
    const layout = layoutGameTree(tree)
    expect(layout.pathIds.has(ids[0])).toBe(true)
    expect(layout.pathIds.has(ids[1])).toBe(true)
    expect(layout.pathIds.has(ids[2])).toBe(true)
    expect(layout.pathIds.has(ids[4])).toBe(true)
    expect(layout.pathIds.has(ids[3])).toBe(false)
    expect(layout.byId.get(ids[4])!.onPath).toBe(true)
    expect(layout.byId.get(ids[3])!.onPath).toBe(false)

    // Navigate back to the main line tip: main line highlighted instead.
    const mainLayout = layoutGameTree(tree, ids[3])
    expect(mainLayout.byId.get(ids[3])!.onPath).toBe(true)
    expect(mainLayout.byId.get(ids[4])!.onPath).toBe(false)
  })

  test('pass nodes do not advance move numbers; move nodes do', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // 1
    tree = appendPass(tree, -1) // 2 (pass)
    tree = appendMove(tree, [1, 1], 1) // 3

    const layout = layoutGameTree(tree)
    const m1 = layout.byId.get(String(tree.root.children[0]!.id))!
    const pass = layout.byId.get(String(tree.currentId!))!
    expect(m1.moveNumber).toBe(1)
    expect(pass.moveNumber).toBe(3)
  })

  test('move nodes carry their player sign; passes stay numbered', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // black 1
    tree = appendMove(tree, [1, 1], -1) // white 2
    tree = appendPass(tree, 1) // black 3 but a pass

    const layout = layoutGameTree(tree)
    const [m1, m2, pass] = [
      layout.byId.get(String(tree.root.children[0]!.id))!,
      layout.byId.get(String(tree.root.children[0]!.children[0]!.id))!,
      layout.byId.get(String(tree.currentId!))!,
    ]
    // Stone-player info for the node rendering (black vs white fill).
    expect(m1.moveSign).toBe(1)
    expect(m2.moveSign).toBe(-1)
    expect(m1.isPass).toBe(false)
    // Passes are numbered like any other move but render neutrally.
    expect(pass.moveNumber).toBe(3)
    expect(pass.moveSign).toBe(1)
    expect(pass.isPass).toBe(true)

    // Root and non-move nodes are never move stones.
    const withComment = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];C[hi];W[bb])')
    const commentLayout = layoutGameTree(withComment)
    const [root, , comment] = commentLayout.nodes
    expect(root?.moveSign).toBeNull()
    expect(root?.isPass).toBe(false)
    expect(comment?.moveNumber).toBeNull()
    expect(comment?.moveSign).toBeNull()
  })

  test('a comment-only node between moves does not restart move numbering', () => {
    // root → m1 → comment-only node → m2 (valid SGF main-line shape).
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // m1
    tree = appendNonMoveNode(tree, { C: ['middle commentary'] })
    const metaId = String(tree.currentId!)
    tree = appendMove(tree, [1, 1], -1) // m2 — must stay move 2

    const layout = layoutGameTree(tree)
    const m1 = layout.byId.get(String(tree.root.children[0]!.id))!
    const meta = layout.byId.get(metaId)!
    const m2 = layout.byId.get(String(tree.currentId!))!
    expect(m1.moveNumber).toBe(1)
    expect(meta.moveNumber).toBeNull() // no move → no number
    expect(m2.moveNumber).toBe(2) // NOT 1 — the ply count flowed through
  })

  test('a setup-only node passes the ply count through on a variation branch', () => {
    // root → m1 → { m2 (main), meta(AB) → m2' (variation) }
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1)
    tree = appendMove(tree, [1, 1], -1) // m2 main
    const m2MainId = String(tree.currentId!)
    const atM1 = navigateToNode(tree, tree.root.children[0]!.id)
    tree = appendNonMoveNode(atM1!, { AB: ['ii'] }) // setup-only branch node
    const metaId = String(tree.currentId!)
    tree = appendMove(tree, [5, 5], -1) // m2' — must be move 2

    const layout = layoutGameTree(tree)
    expect(layout.byId.get(metaId)!.moveNumber).toBeNull()
    expect(layout.byId.get(m2MainId)!.moveNumber).toBe(2)
    expect(layout.byId.get(String(tree.currentId!))!.moveNumber).toBe(2)
  })

  test('parsed SGF with a comment-only node between moves stays sequential', () => {
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];C[mid note];W[bb])')
    const layout = layoutGameTree(tree)
    expect(layout.nodes).toHaveLength(4) // root, B, comment, W
    expect(layout.nodes[0]!.moveNumber).toBeNull()
    expect(layout.nodes[1]!.moveNumber).toBe(1)
    expect(layout.nodes[2]!.moveNumber).toBeNull()
    expect(layout.nodes[3]!.moveNumber).toBe(2)
  })

  test('nested variations never share rows', () => {
    // root → A → (B, C); B → (D, E); C → F
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // A
    const aId = String(tree.currentId!)
    tree = appendMove(tree, [1, 1], -1) // B (first child)
    tree = appendMove(tree, [2, 2], 1) // D
    const backToA = navigateToNode(tree, aId)
    tree = appendMove(backToA!, [3, 3], -1) // C (second child)
    const cId = String(tree.currentId!)
    tree = appendMove(tree, [4, 4], 1) // F
    // Add E under B.
    const bId = String(tree.root.children[0]!.children[0]!.id)
    const atB = navigateToNode(tree, bId)
    tree = appendMove(atB!, [5, 5], 1) // E

    const layout = layoutGameTree(tree)
    const rows = new Map(layout.nodes.map((n) => [n.id, n.row]))
    // A, B, D share row 0. C gets a new row; E (second child of B) another.
    expect(rows.get(aId)).toBe(0)
    expect(rows.get(bId)).toBe(0)
    expect(rows.get(cId)!).toBeGreaterThan(0)
    const eRow = rows.get(String(tree.currentId!))!
    expect(eRow).toBeGreaterThan(0)
    // Every node id occupies exactly one layout slot.
    expect(layout.nodes.length).toBe(layout.byId.size)
  })
})

describe('getFirstPlayer / getPlayerToPlayAtNode', () => {
  test('default first player is Black; parity alternates', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1)
    tree = appendMove(tree, [1, 1], -1)
    const m2Id = String(tree.currentId!)

    expect(getFirstPlayer(tree)).toBe(1)
    expect(getPlayerToPlayAtNode(tree, 'root')).toBe(1)
    expect(getPlayerToPlayAtNode(tree, String(tree.root.children[0]!.id))).toBe(-1)
    expect(getPlayerToPlayAtNode(tree, m2Id)).toBe(1)
  })

  test('root PL property overrides the first player', () => {
    const withPl = createGameTree(9)
    withPl.root.data = { PL: ['W'] } as typeof withPl.root.data
    expect(getFirstPlayer(withPl)).toBe(-1)
    const t1 = appendMove(withPl, [0, 0], -1) // White plays first
    expect(getPlayerToPlayAtNode(t1, String(t1.currentId!))).toBe(1)
  })
})

describe('blackPerspectiveWinrate', () => {
  test('player-to-move perspective converts to Black perspective', () => {
    expect(blackPerspectiveWinrate(0.7, 1)).toBe(0.7)
    expect(blackPerspectiveWinrate(0.7, -1)).toBeCloseTo(0.3)
    expect(blackPerspectiveWinrate(0.5, -1)).toBeCloseTo(0.5)
  })
})

describe('collectAnalysisTargets', () => {
  test('covers all branches in DFS pre-order and skips the root', () => {
    const { tree, ids } = buildTreeWithVariation()
    const targets = collectAnalysisTargets(tree, 9)

    expect(targets.map((t) => t.nodeId)).toEqual([ids[1], ids[2], ids[3], ids[4]])
    expect(targets.every((t) => t.nodeId !== 'root')).toBe(true)

    // Each target carries its full replay path (inclusive).
    const varTarget = targets.find((t) => t.nodeId === ids[4])!
    expect(varTarget.moveNumber).toBe(3)
    expect(varTarget.moves).toHaveLength(3)
    expect(varTarget.moves[2]).toEqual({ vertex: [5, 5], sign: 1 })
    const mainTarget = targets.find((t) => t.nodeId === ids[3])!
    expect(mainTarget.moves[2]).toEqual({ vertex: [2, 2], sign: 1 })
  })

  test('passes are targets; setup-only nodes are not', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1)
    tree = appendPass(tree, -1)

    // Root setup stones (AB) — mirrored into every target's setup list.
    const withSetup = createGameTree(9)
    withSetup.root.data = { AB: ['gg'] } as typeof withSetup.root.data
    const t1 = appendMove(withSetup, [0, 0], 1)

    const targets = collectAnalysisTargets(tree, 9)
    expect(targets).toHaveLength(2) // move + pass
    expect(targets[1]!.moves[1]).toEqual({ vertex: 'pass', sign: -1 })

    const setupTargets = collectAnalysisTargets(t1, 9)
    expect(setupTargets).toHaveLength(1)
    expect(setupTargets[0]!.setup).toEqual([{ vertex: [6, 6], sign: 1 }])
    expect(setupTargets[0]!.moves).toEqual([{ vertex: [0, 0], sign: 1 }])
  })

  test('empty tree yields no targets', () => {
    const tree = createGameTree(19)
    expect(collectAnalysisTargets(tree, 19)).toEqual([])
  })

  test('target numbers stay sequential across a non-move node with setup', () => {
    // root → m1 → metadata+setup-only node → m2 (valid SGF main-line shape).
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1) // target 1
    tree = appendNonMoveNode(tree, { C: ['note'], AB: ['ii'] })
    const metaId = String(tree.currentId!)
    tree = appendMove(tree, [1, 1], -1) // target 2 — must stay 2

    const targets = collectAnalysisTargets(tree, 9)
    // The non-move node is not a target...
    expect(targets.map((t) => t.nodeId)).not.toContain(metaId)
    // ...but numbering continues through it.
    expect(targets.map((t) => t.moveNumber)).toEqual([1, 2])
    // Its setup feeds the following target exactly once.
    expect(targets[1]!.setup).toEqual([{ vertex: [8, 8], sign: 1 }])
    expect(targets[1]!.moves).toHaveLength(2)
  })

  test('parsed SGF targets keep sequential numbers across a comment node', () => {
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];C[mid note];W[bb])')
    const targets = collectAnalysisTargets(tree, 9)
    expect(targets.map((t) => t.moveNumber)).toEqual([1, 2])
    expect(targets).toHaveLength(2)
  })

  test('setup stones on intermediate/variation nodes accumulate exactly once', () => {
    // root(AB[gg]) → m1(B[aa] + AW[hh]) → { m2(W[bb]), m2'(B[cc] + AB[ii]) }
    // Built directly so AB/AW can sit on non-root nodes. The literal infers
    // a narrow data generic; the traversal expects the default tree type.
    const tree = new GameTree({
      root: {
        id: 'root',
        data: { AB: ['gg'] },
        parentId: null,
        children: [
          {
            id: 1,
            data: { B: ['aa'], AW: ['hh'] },
            parentId: 'root',
            children: [
              { id: 2, data: { W: ['bb'] }, parentId: 1, children: [] },
              { id: 3, data: { B: ['cc'], AB: ['ii'] }, parentId: 1, children: [] },
            ],
          },
        ],
      },
    }) as unknown as GameTree

    const targets = collectAnalysisTargets(tree, 9)
    expect(targets.map((t) => t.nodeId)).toEqual(['1', '2', '3'])
    const byId = new Map(targets.map((t) => [t.nodeId, t]))

    // m1's own target: root setup + m1's AW — each once.
    expect(byId.get('1')!.setup).toEqual([
      { vertex: [6, 6], sign: 1 }, // AB[gg] (root)
      { vertex: [7, 7], sign: -1 }, // AW[hh] (m1)
    ])
    // Descendant m2 replays m1's AW exactly ONCE — the pre-fix traversal
    // applied it in the parent loop AND again inside the recursive walk.
    expect(byId.get('2')!.setup).toEqual([
      { vertex: [6, 6], sign: 1 },
      { vertex: [7, 7], sign: -1 },
    ])
    // Variation m2' adds its own AB on top of the inherited setup, once.
    expect(byId.get('3')!.setup).toEqual([
      { vertex: [6, 6], sign: 1 },
      { vertex: [7, 7], sign: -1 },
      { vertex: [8, 8], sign: 1 },
    ])
    // Each target still replays its own full move path.
    expect(byId.get('3')!.moves.map((m) => m.vertex)).toEqual([[0, 0], [2, 2]])
    expect(byId.get('2')!.moves.map((m) => m.vertex)).toEqual([[0, 0], [1, 1]])

    // Guard against the raw builder drifting from the intended shape.
    const m1 = tree.get(1)!
    expect((m1.data as { AW?: string[] }).AW).toEqual(['hh'])
  })
})

describe('buildWinratePoints', () => {
  test('charts the current path with Black-perspective winrates', () => {
    const { tree, ids } = buildTreeWithVariation()
    // Cursor at variation tip (ids[4]).
    const cache = new Map<string, SgfAnalysisEntry>()
    const entryFor = (w: number): SgfAnalysisEntry => ({
      analysis: { id: 't', winrate: w, scoreLead: 0 },
      durationMs: null,
    })
    // KataGo winrate is PLAYER-TO-MOVE perspective:
    //   ids[1] = after move 1 → White to play → black = 1 - 0.6 = 0.4
    //   ids[2] = after move 2 → Black to play → black = 0.55
    //   ids[4] = after move 3 (variation) → White to play → black = 1 - 0.2 = 0.8
    cache.set(ids[1], entryFor(0.6))
    cache.set(ids[2], entryFor(0.55))
    cache.set(ids[4], entryFor(0.2))

    const points = buildWinratePoints(tree, cache)
    expect(points.map((p) => p.nodeId)).toEqual([ids[1], ids[2], ids[4]])
    expect(points[0]).toMatchObject({ moveNumber: 1, winrate: 0.4 })
    expect(points[1]).toMatchObject({ moveNumber: 2, winrate: 0.55 })
    expect(points[2]).toMatchObject({ moveNumber: 3, winrate: 0.8 })
  })

  test('uncached positions are skipped, not invented', () => {
    const { tree, ids } = buildTreeWithVariation()
    const cache = new Map<string, SgfAnalysisEntry>()
    cache.set(ids[2], {
      analysis: { id: 't', winrate: 0.5, scoreLead: 0 },
      durationMs: null,
    })
    const points = buildWinratePoints(tree, cache)
    expect(points).toHaveLength(1)
    expect(points[0]!.nodeId).toBe(ids[2])
  })

  test('empty cache yields no points', () => {
    const { tree } = buildTreeWithVariation()
    expect(buildWinratePoints(tree, new Map())).toEqual([])
  })
})
