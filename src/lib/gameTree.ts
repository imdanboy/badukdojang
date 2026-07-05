import GoBoard from '@sabaki/go-board'
import type { SignMap, Vertex } from '@sabaki/go-board'
import GameTree from '@sabaki/immutable-gametree'
import type { NodeObject } from '@sabaki/immutable-gametree'

export { GameTree }

// Augment GameTree with a currentId property for navigation state
declare module '@sabaki/immutable-gametree' {
  interface GameTree {
    currentId?: string | number
  }
}

function vertexToSgf([x, y]: Vertex): string {
  return (
    String.fromCharCode('a'.charCodeAt(0) + x) +
    String.fromCharCode('a'.charCodeAt(0) + y)
  )
}

function sgfToVertex(sgf: string): Vertex {
  return [
    sgf.charCodeAt(0) - 'a'.charCodeAt(0),
    sgf.charCodeAt(1) - 'a'.charCodeAt(0),
  ]
}

export function createGameTree(_size: number): GameTree {
  const tree = new GameTree({
    root: {
      id: 'root',
      data: {},
      parentId: null,
      children: [],
    },
  })
  tree.currentId = tree.root.id
  return tree
}

export function appendMove(
  tree: GameTree,
  vertex: Vertex,
  sign: number,
): GameTree {
  const currentId = tree.currentId ?? tree.root.id
  const prop = sign === 1 ? 'B' : 'W'
  const coord = vertexToSgf(vertex)

  const newTree = tree.mutate((draft) => {
    draft.appendNode(currentId, { [prop]: [coord] })
  })

  const currentNode = newTree.get(currentId)
  const newNode = currentNode?.children[currentNode.children.length - 1]
  newTree.currentId = newNode?.id ?? currentId

  return newTree
}

export function appendPass(tree: GameTree, sign: number): GameTree {
  const currentId = tree.currentId ?? tree.root.id
  const prop = sign === 1 ? 'B' : 'W'

  const newTree = tree.mutate((draft) => {
    draft.appendNode(currentId, { [prop]: [] })
  })

  const currentNode = newTree.get(currentId)
  const newNode = currentNode?.children[currentNode.children.length - 1]
  newTree.currentId = newNode?.id ?? currentId

  return newTree
}

function cloneTree(tree: GameTree): GameTree {
  const clone = new GameTree({
    getId: tree.getId,
    merger: tree.merger,
    root: JSON.parse(JSON.stringify(tree.root)) as NodeObject,
  })
  return clone
}

export function undo(tree: GameTree): GameTree | null {
  const currentId = tree.currentId ?? tree.root.id
  const prevNode = tree.navigate(currentId, -1, {})
  if (prevNode == null || prevNode.id === currentId) {
    return null
  }

  const newTree = cloneTree(tree)
  newTree.currentId = prevNode.id
  return newTree
}

export function redo(tree: GameTree): GameTree | null {
  const currentId = tree.currentId ?? tree.root.id
  const nextNode = tree.navigate(currentId, 1, {})
  if (nextNode == null || nextNode.id === currentId) {
    return null
  }

  const newTree = cloneTree(tree)
  newTree.currentId = nextNode.id
  return newTree
}

export function getCurrentSignMap(tree: GameTree, size: number): SignMap {
  const currentId = tree.currentId ?? tree.root.id
  let board = GoBoard.fromDimensions(size, size)

  const nodes = [...tree.listNodesVertically(currentId, -1, {})].reverse()

  for (const node of nodes) {
    if (node.id === tree.root.id) continue

    const sign =
      node.data.B != null && node.data.B.length > 0 && node.data.B[0] !== ''
        ? 1
        : node.data.W != null && node.data.W.length > 0 && node.data.W[0] !== ''
          ? -1
          : 0

    if (sign === 0) {
      // Pass — no board change, but we still need to track the turn
      continue
    }

    const prop = sign === 1 ? node.data.B : node.data.W
    if (prop == null || prop.length === 0 || prop[0] === '') {
      // Pass — no board change
      continue
    }

    const coord = prop[0]
    if (typeof coord === 'string' && coord.length >= 2) {
      const vertex = sgfToVertex(coord)
      try {
        board = board.makeMove(sign, vertex, {
          preventOverwrite: true,
          preventSuicide: false,
          preventKo: false,
        })
      } catch {
        // Illegal move in history — skip
      }
    }
  }

  return board.signMap
}

export function getMoveList(
  tree: GameTree,
): { vertex: Vertex | 'pass'; sign: number }[] {
  const currentId = tree.currentId ?? tree.root.id
  const nodes = [...tree.listNodesVertically(currentId, -1, {})].reverse()

  const moves: { vertex: Vertex | 'pass'; sign: number }[] = []

  for (const node of nodes) {
    if (node.id === tree.root.id) continue

    if (node.data.B != null) {
      const prop = node.data.B
      if (prop.length === 0 || prop[0] === '') {
        moves.push({ vertex: 'pass', sign: 1 })
      } else {
        moves.push({ vertex: sgfToVertex(prop[0] as string), sign: 1 })
      }
    } else if (node.data.W != null) {
      const prop = node.data.W
      if (prop.length === 0 || prop[0] === '') {
        moves.push({ vertex: 'pass', sign: -1 })
      } else {
        moves.push({ vertex: sgfToVertex(prop[0] as string), sign: -1 })
      }
    }
  }

  return moves
}
