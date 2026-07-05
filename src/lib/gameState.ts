import GoBoard from '@sabaki/go-board'
import type { SignMap, Vertex } from '@sabaki/go-board'
import {
  appendMove as appendMoveToTree,
  appendPass as appendPassToTree,
  createGameTree,
  getCurrentSignMap,
  getMoveList,
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
  makeMove(vertex: Vertex): boolean
  pass(): void
  getSignMap(): SignMap
  undo(): boolean
  redo(): boolean
}

export function createGameState(size: number): GameState {
  let board = GoBoard.fromDimensions(size, size)
  let gameTree = createGameTree(size)
  let currentPlayer: Player = 1
  let lastMove: Vertex | null = null

  function syncFromTree(): void {
    const signMap = getCurrentSignMap(gameTree, size)
    board = new GoBoard(signMap)
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
    const moves = getMoveList(gameTree)
    return moves.length % 2 === 0 ? 1 : -1
  }

  function makeMove(vertex: Vertex): boolean {
    try {
      const newBoard = board.makeMove(currentPlayer, vertex, {
        preventOverwrite: true,
        preventSuicide: true,
        preventKo: true,
      })
      board = newBoard
      gameTree = appendMoveToTree(gameTree, vertex, currentPlayer)
      lastMove = vertex
      currentPlayer = currentPlayer === 1 ? -1 : 1
      return true
    } catch {
      return false
    }
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
    getSignMap,
    undo,
    redo,
  }
}
