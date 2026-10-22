import { GoBoard } from '@kaya/goboard'
import type { Sign, SignMap, Vertex } from '@kaya/goboard'
import { GameTree } from '@kaya/gametree'
import type { GameTreeNode, Primitive } from '@kaya/gametree'

export { GameTree }

// Augment GameTree with a currentId property for navigation state
declare module '@kaya/gametree' {
  interface GameTree<T = Record<string, Primitive[]>> {
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
    root: JSON.parse(JSON.stringify(tree.root)) as GameTreeNode,
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

/** Setup 배치 (AB/AW 좌표 하나): 가드 없는 착점 + 실패 시 원판 반환. */
function applySetup(board: GoBoard, sign: Sign, coord: string, size: number): GoBoard {
  if (typeof coord !== 'string' || coord.length < 2) return board
  const vertex = sgfToVertex(coord)
  if (vertex[0] < 0 || vertex[0] >= size || vertex[1] < 0 || vertex[1] >= size) {
    return board
  }
  try {
    return board.makeMove(sign, vertex, {
      preventOverwrite: true,
      preventSuicide: false,
      preventKo: false,
    })
  } catch {
    return board
  }
}

export interface SetupStone {
  vertex: Vertex
  sign: number
}

/**
 * 현재 경로의 setup 돌(AB/AW) — root 부터 순서대로.
 * 엔진(GTP) 재생용: 착수 목록과 별도로 setup 돌을 먼저 play 해야
 * 스크린샷 이어하기 국면이 엔진에 전달된다.
 */
export function getSetupStones(tree: GameTree): SetupStone[] {
  const currentId = tree.currentId ?? tree.root.id
  const nodes = [...tree.listNodesVertically(currentId, -1, {})].reverse()

  const stones: SetupStone[] = []
  for (const node of nodes) {
    const data = node.data as { AB?: string[]; AW?: string[] }
    for (const coord of data.AB ?? []) {
      if (typeof coord === 'string' && coord.length >= 2) {
        stones.push({ vertex: sgfToVertex(coord), sign: 1 })
      }
    }
    for (const coord of data.AW ?? []) {
      if (typeof coord === 'string' && coord.length >= 2) {
        stones.push({ vertex: sgfToVertex(coord), sign: -1 })
      }
    }
  }
  return stones
}

export function getCurrentSignMap(tree: GameTree, size: number): SignMap {
  const currentId = tree.currentId ?? tree.root.id
  let board = GoBoard.fromDimensions(size, size)

  const nodes = [...tree.listNodesVertically(currentId, -1, {})].reverse()

  for (const node of nodes) {
    const data = node.data as { B?: string[]; W?: string[]; AB?: string[]; AW?: string[] }

    // Setup properties (AB/AW) — 모든 값을 적용한다 (root 포함).
    // 스크린샷 인식 등 임의 국면이 setup 으로 들어온다. 부분 재생 중 캡처는
    // 일어나지 않는다: 최종 국면의 부분집합 재생에서는 어떤 그룹의 활기도
    // 최종 국면 기준 하한 이하로 내려가지 않기 때문.
    for (const coord of data.AB ?? []) {
      board = applySetup(board, 1, coord, size)
    }
    for (const coord of data.AW ?? []) {
      board = applySetup(board, -1, coord, size)
    }

    if (node.id === tree.root.id) continue

    const sign =
      data.B != null && data.B.length > 0 && data.B[0] !== ''
        ? 1
        : data.W != null && data.W.length > 0 && data.W[0] !== ''
          ? -1
          : 0

    if (sign === 0) {
      // Pass — no board change, but we still need to track the turn
      continue
    }

    const prop = sign === 1 ? data.B : data.W
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

    const data = node.data as { B?: string[]; W?: string[] }
    if (data.B != null) {
      const prop = data.B
      if (prop.length === 0 || prop[0] === '') {
        moves.push({ vertex: 'pass', sign: 1 })
      } else {
        moves.push({ vertex: sgfToVertex(prop[0] as string), sign: 1 })
      }
    } else if (data.W != null) {
      const prop = data.W
      if (prop.length === 0 || prop[0] === '') {
        moves.push({ vertex: 'pass', sign: -1 })
      } else {
        moves.push({ vertex: sgfToVertex(prop[0] as string), sign: -1 })
      }
    }
  }

  return moves
}
