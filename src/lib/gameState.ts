import { GoBoard } from '@kaya/goboard'
import type { SignMap, Vertex } from '@kaya/goboard'
import {
  appendMove as appendMoveToTree,
  appendPass as appendPassToTree,
  appendSetup as appendSetupToTree,
  createGameTree,
  getCurrentBoard,
  getMoveList,
  navigateToNode as navigateTreeToNode,
  redo as redoTree,
  undo as undoTree,
} from './gameTree.ts'
import type { GameTree } from './gameTree.ts'

export type Player = 1 | -1

export interface GameState {
  board: GoBoard
  currentPlayer: Player
  lastMove: Vertex | null
  gameTree: GameTree
  /**
   * Place a stone and record it as a B/W move node. By default the stone
   * uses `currentPlayer` (흑백 교대). Passing an explicit `player` places
   * that color regardless of the turn (놓아보기 고정 색 연속 착수) — the
   * next turn still becomes the opposite of the placed color.
   */
  makeMove(vertex: Vertex, player?: Player): boolean
  pass(): void
  /**
   * Record a setup stone (AB/AW node) — 놓아보기 셋업 배치. The board-level
   * guards still apply (occupied vertex and 0-liberty placement rejected,
   * captures allowed, ko irrelevant for setup), but the turn (currentPlayer)
   * and lastMove never change: setup nodes carry no B/W property.
   */
  placeSetupStone(vertex: Vertex, sign: Player): boolean
  getSignMap(): SignMap
  undo(): boolean
  redo(): boolean
  /** Navigate back to the first move. Returns true if the position changed. */
  jumpToStart(): boolean
  /** Navigate forward to the last move of the current branch. Returns true if changed. */
  jumpToEnd(): boolean
  /**
   * Jump the navigation cursor to an arbitrary tree node (game-tree view).
   * Rebuilds board/turn/last-move from the node's path. Returns false when
   * the node does not exist.
   */
  navigateToNode(nodeId: string): boolean
}

export function createGameState(size: number, initialTree?: GameTree): GameState {
  let board = GoBoard.fromDimensions(size, size)
  let gameTree = initialTree ?? createGameTree(size)
  let currentPlayer: Player = 1
  let lastMove: Vertex | null = null

  function syncFromTree(): void {
    board = getCurrentBoard(gameTree, size)
  }

  function deriveLastMove(): Vertex | null {
    const moves = getMoveList(gameTree)
    for (let i = moves.length - 1; i >= 0; i--) {
      const move = moves[i]!
      if (move.vertex !== 'pass') {
        return move.vertex
      }
    }
    return null
  }

  function deriveCurrentPlayer(): Player {
    // PL property (다음 착수자) — 스크린샷 이어하기에서 사용자가 지정.
    const rootData = gameTree.root.data as { PL?: string[] }
    const pl = rootData.PL?.[0]
    if (pl === 'B' || pl === 'W') {
      return pl === 'B' ? 1 : -1
    }
    const moves = getMoveList(gameTree)
    return moves.length % 2 === 0 ? 1 : -1
  }

  if (initialTree) {
    syncFromTree()
    lastMove = deriveLastMove()
    currentPlayer = deriveCurrentPlayer()
  }

  function makeMove(vertex: Vertex, player?: Player): boolean {
    const sign = player ?? currentPlayer
    try {
      const newBoard = board.makeMove(sign, vertex, {
        preventOverwrite: true,
        preventSuicide: true,
        preventKo: true,
      })
      board = newBoard
      gameTree = appendMoveToTree(gameTree, vertex, sign)
      lastMove = vertex
      currentPlayer = sign === 1 ? -1 : 1
      return true
    } catch {
      return false
    }
  }

  function placeSetupStone(vertex: Vertex, sign: Player): boolean {
    // 착수 가드: 중복 자리(preventOverwrite)와 착수 후 활로가 0인
    // 배치(preventSuicide — 상대 돌을 캡처해 활로가 생기면 허용)를 막는다.
    // 포석 배치에는 패 규칙이 없으므로 preventKo 는 끈다.
    try {
      board.makeMove(sign, vertex, {
        preventOverwrite: true,
        preventSuicide: true,
        preventKo: false,
      })
    } catch {
      return false
    }
    // Board 는 트리 재생(syncFromTree)으로 재구성한다 — getCurrentBoard 의
    // setup 규칙(캡처 카운트 불가, 자살 가드 없음)과 정확히 일치하는 상태가
    // 되어 네비게이션 이후 상태와도 같아진다.
    gameTree = appendSetupToTree(gameTree, vertex, sign)
    syncFromTree()
    return true
  }

  function pass(): void {
    gameTree = appendPassToTree(gameTree, currentPlayer)
    currentPlayer = currentPlayer === 1 ? -1 : 1
  }

  function undo(): boolean {
    const newTree = undoTree(gameTree)
    if (newTree == null) return false
    gameTree = newTree
    syncFromTree()
    lastMove = deriveLastMove()
    currentPlayer = deriveCurrentPlayer()
    return true
  }

  function redo(): boolean {
    const newTree = redoTree(gameTree)
    if (newTree == null) return false
    gameTree = newTree
    syncFromTree()
    lastMove = deriveLastMove()
    currentPlayer = deriveCurrentPlayer()
    return true
  }

  function jumpToStart(): boolean {
    let changed = false
    while (undo()) {
      changed = true
    }
    return changed
  }

  function jumpToEnd(): boolean {
    let changed = false
    while (redo()) {
      changed = true
    }
    return changed
  }

  function navigateToNode(nodeId: string): boolean {
    const newTree = navigateTreeToNode(gameTree, nodeId)
    if (newTree == null) return false
    gameTree = newTree
    syncFromTree()
    lastMove = deriveLastMove()
    currentPlayer = deriveCurrentPlayer()
    return true
  }

  function getSignMap(): SignMap {
    return board.signMap
  }

  return {
    get board() {
      return board
    },
    get currentPlayer() {
      return currentPlayer
    },
    get lastMove() {
      return lastMove
    },
    get gameTree() {
      return gameTree
    },
    makeMove,
    pass,
    placeSetupStone,
    getSignMap,
    undo,
    redo,
    jumpToStart,
    jumpToEnd,
    navigateToNode,
  }
}
