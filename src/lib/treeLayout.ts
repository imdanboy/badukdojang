/*
 * treeLayout — pure, view-facing game-tree helpers shared by the review
 * features (tree visualization, board move numbers wiring, winrate graph,
 * and full-tree batch analysis). No React, no engine I/O — everything here
 * is trivially unit-testable.
 *
 * Conventions:
 *   - Node ids are normalized to strings (SGF parsing can produce numbers).
 *   - The "current path" is the node chain root → tree.currentId; redo/undo
 *     and the tree view all navigate along it.
 *   - Winrate from KataGo is player-to-move perspective; helpers here convert
 *     to a consistent Black perspective for graphing.
 */
import type { Vertex } from '@kaya/goboard'
import type { GameTree, GameTreeNode } from './gameTree.ts'
import { getPathNodes } from './gameTree.ts'
import type { SetupStone } from './gameTree.ts'
import type { SgfAnalysisEntry } from './sgfIo.ts'

// --- Player-to-play / winrate perspective -----------------------------------

/** First player of the game: root PL property, defaulting to Black. */
export function getFirstPlayer(tree: GameTree): 1 | -1 {
  const pl = (tree.root.data as { PL?: string[] }).PL?.[0]
  if (pl === 'W') return -1
  return 1
}

/**
 * Player to move at a node: path-move parity from the root's first player.
 * Mirrors gameState's deriveCurrentPlayer convention (PL + move parity).
 */
export function getPlayerToPlayAtNode(
  tree: GameTree,
  nodeId: string | number,
): 1 | -1 {
  const first = getFirstPlayer(tree)
  const path = getPathNodes(tree, nodeId)
  let moves = 0
  for (const node of path ?? []) {
    if (node.id === tree.root.id) continue
    const data = node.data as { B?: unknown[]; W?: unknown[] }
    if (data.B !== undefined || data.W !== undefined) moves += 1
  }
  return moves % 2 === 0 ? first : ((first === 1 ? -1 : 1) as 1 | -1)
}

/**
 * KataGo reports winrate from the perspective of the player to move.
 * Convert to a consistent Black perspective (0 = White wins, 1 = Black wins).
 */
export function blackPerspectiveWinrate(
  winrate: number,
  playerToPlay: 1 | -1,
): number {
  return playerToPlay === 1 ? winrate : 1 - winrate
}

// --- Tree layout (visualization) ----------------------------------------------

export interface TreeLayoutNode {
  readonly id: string
  readonly parentId: string | null
  /** Column = depth from root (0 = root). */
  readonly col: number
  /** Row lane; each branch after the first gets its own row below. */
  readonly row: number
  /** On the root → current-node path. */
  readonly onPath: boolean
  /** 1-based move number along this node's own path; null for non-move nodes. */
  readonly moveNumber: number | null
}

export interface TreeLayout {
  readonly nodes: readonly TreeLayoutNode[]
  readonly byId: ReadonlyMap<string, TreeLayoutNode>
  readonly maxCol: number
  readonly maxRow: number
  /** Ids on the root → current path. */
  readonly pathIds: ReadonlySet<string>
}

function readMoveProp(
  data: { B?: unknown[]; W?: unknown[] },
): { sign: 1 | -1; vertex: Vertex | 'pass' } | null {
  if (data.B !== undefined) {
    const prop = data.B
    if (prop.length === 0 || prop[0] === '') return { sign: 1, vertex: 'pass' }
    if (typeof prop[0] === 'string' && prop[0].length >= 2) {
      return { sign: 1, vertex: sgfToVertex(prop[0]) }
    }
    return { sign: 1, vertex: 'pass' }
  }
  if (data.W !== undefined) {
    const prop = data.W
    if (prop.length === 0 || prop[0] === '') return { sign: -1, vertex: 'pass' }
    if (typeof prop[0] === 'string' && prop[0].length >= 2) {
      return { sign: -1, vertex: sgfToVertex(prop[0]) }
    }
    return { sign: -1, vertex: 'pass' }
  }
  return null
}

function sgfToVertex(sgf: string): Vertex {
  return [
    sgf.charCodeAt(0) - 'a'.charCodeAt(0),
    sgf.charCodeAt(1) - 'a'.charCodeAt(0),
  ]
}

/**
 * Assign every node a (col, row) position for the tree visualization.
 * DFS: the first child continues on the parent's row; every additional
 * child opens a new row below (rows are handed out in DFS order, so
 * subtrees never overlap). The current path is marked for highlighting.
 */
export function layoutGameTree(
  tree: GameTree,
  currentNodeId?: string | number,
): TreeLayout {
  const cursor = String(currentNodeId ?? tree.currentId ?? tree.root.id)
  const pathNodes = getPathNodes(tree, cursor) ?? [tree.root]
  const pathIds = new Set(pathNodes.map((n) => String(n.id)))

  const nodes: TreeLayoutNode[] = []
  const byId = new Map<string, TreeLayoutNode>()
  let maxRow = 0

  // plyCount = number of moves so far on the path, INCLUDING this node's
  // own move. It is a plain number that flows through non-move nodes
  // (comments, setup-only nodes) UNCHANGED, so numbering stays sequential
  // across them; only move nodes (B/W, passes included) advance it. A
  // node's own moveNumber is null unless the node itself holds a move.
  // The root never counts as a move — matching getMoveList/getMoveNumberMap,
  // which skip a root-node B/W.
  const walk = (
    node: GameTreeNode,
    parentId: string | null,
    col: number,
    row: number,
    plyCount: number,
  ): void => {
    const id = String(node.id)
    const isRoot = node.id === tree.root.id
    const move = isRoot ? null : readMoveProp(node.data as { B?: unknown[]; W?: unknown[] })
    const ownPly = move !== null ? plyCount + 1 : plyCount
    const layoutNode: TreeLayoutNode = {
      id,
      parentId,
      col,
      row,
      onPath: pathIds.has(id),
      moveNumber: move !== null ? ownPly : null,
    }
    nodes.push(layoutNode)
    byId.set(id, layoutNode)

    node.children.forEach((child, index) => {
      const childRow = index === 0 ? row : ++maxRow
      walk(child, id, col + 1, childRow, ownPly)
    })
  }

  walk(tree.root, null, 0, 0, 0)
  const maxCol = nodes.reduce((max, n) => Math.max(max, n.col), 0)
  return { nodes, byId, maxCol, maxRow, pathIds }
}

// --- Full-tree batch analysis -------------------------------------------------

export interface AnalysisTarget {
  readonly nodeId: string
  /** 1-based move number of this node along its own path. */
  readonly moveNumber: number
  /** Setup stones (AB/AW) accumulated from the root to this node. */
  readonly setup: readonly SetupStone[]
  /** Moves (vertex or pass) from the root to this node, inclusive. */
  readonly moves: readonly { vertex: Vertex | 'pass'; sign: number }[]
}

function readSetupProps(
  data: { AB?: unknown[]; AW?: unknown[] },
  into: SetupStone[],
  size: number,
): SetupStone[] {
  const out = into.slice()
  const push = (coords: unknown[] | undefined, sign: number): void => {
    for (const coord of coords ?? []) {
      if (typeof coord === 'string' && coord.length >= 2) {
        const vertex = sgfToVertex(coord)
        if (vertex[0] >= 0 && vertex[0] < size && vertex[1] >= 0 && vertex[1] < size) {
          out.push({ vertex, sign })
        }
      }
    }
  }
  push(data.AB, 1)
  push(data.AW, -1)
  return out
}

/**
 * Every move position in the WHOLE tree (all variation branches), in DFS
 * pre-order (parent before children, branches left-to-right). The root and
 * no-move nodes (no B/W property) are excluded — analysis targets are
 * positions reached by a move, matching the review graph's x axis.
 *
 * Setup accumulation: each node's AB/AW properties are read exactly once,
 * inside this node's own walk step. The resulting accumulated setup feeds
 * both this node's target (the position after its move includes setup
 * stones attached to the move node itself, mirroring getCurrentSignMap's
 * replay order) and every descendant — never twice.
 *
 * Numbering: the ply count is a plain number that only move nodes advance
 * and that flows UNCHANGED through non-move nodes (comments, setup-only
 * nodes in valid SGFs), so target moveNumbers stay sequential across them.
 * The root never counts as a move — matching getMoveList/getMoveNumberMap.
 */
export function collectAnalysisTargets(
  tree: GameTree,
  size: number,
): AnalysisTarget[] {
  const targets: AnalysisTarget[] = []

  const walk = (
    node: GameTreeNode,
    inheritedSetup: SetupStone[],
    moves: { vertex: Vertex | 'pass'; sign: number }[],
    plyCount: number,
  ): void => {
    const data = node.data as { AB?: unknown[]; AW?: unknown[]; B?: unknown[]; W?: unknown[] }
    // This node's setup stones are applied exactly once, here.
    const nodeSetup = readSetupProps(data, inheritedSetup, size)
    const isRoot = node.id === tree.root.id
    const move = isRoot ? null : readMoveProp(data as { B?: unknown[]; W?: unknown[] })
    const childMoves = move !== null ? [...moves, move] : moves
    const ownPly = move !== null ? plyCount + 1 : plyCount

    if (!isRoot && move !== null) {
      targets.push({
        nodeId: String(node.id),
        moveNumber: ownPly,
        setup: nodeSetup,
        moves: childMoves,
      })
    }

    for (const child of node.children) {
      walk(child, nodeSetup, childMoves, ownPly)
    }
  }

  walk(tree.root, [], [], 0)
  return targets
}

// --- Winrate graph data --------------------------------------------------------

export interface WinratePoint {
  readonly nodeId: string
  readonly moveNumber: number
  /** Black-perspective winrate (0..1). */
  readonly winrate: number
}

/**
 * Winrate graph series for the CURRENT path (root → cursor): one point per
 * move node that has a cached analysis (session cache or SGF-embedded KA).
 * Results from all branches stay in the cache — only the selected branch is
 * charted, keeping the graph uncluttered.
 */
export function buildWinratePoints(
  tree: GameTree,
  cache: ReadonlyMap<string, SgfAnalysisEntry>,
): WinratePoint[] {
  const cursor = String(tree.currentId ?? tree.root.id)
  const path = getPathNodes(tree, cursor)
  if (path == null) return []

  const points: WinratePoint[] = []
  let moveNumber = 0
  for (const node of path) {
    if (node.id === tree.root.id) continue
    const move = readMoveProp(node.data as { B?: unknown[]; W?: unknown[] })
    if (move === null) continue
    moveNumber += 1

    const entry = cache.get(String(node.id))
    const analysis = entry?.analysis
    const wr = analysis?.winrate
    if (typeof wr !== 'number' || Number.isNaN(wr)) continue

    const playerToPlay = getPlayerToPlayAtNode(tree, node.id)
    points.push({
      nodeId: String(node.id),
      moveNumber,
      winrate: blackPerspectiveWinrate(wr, playerToPlay),
    })
  }
  return points
}
