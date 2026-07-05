import GoBoard from '@sabaki/go-board'
import type { SignMap, Vertex } from '@sabaki/go-board'

export type Player = 1 | -1

export interface GameState {
  board: GoBoard
  currentPlayer: Player
  lastMove: Vertex | null
  makeMove(vertex: Vertex): boolean
  pass(): void
  getSignMap(): SignMap
}

export function createGameState(size: number): GameState {
  let board = GoBoard.fromDimensions(size, size)
  let currentPlayer: Player = 1
  let lastMove: Vertex | null = null

  function makeMove(vertex: Vertex): boolean {
    try {
      const newBoard = board.makeMove(currentPlayer, vertex, {
        preventOverwrite: true,
        preventSuicide: true,
        preventKo: true,
      })
      board = newBoard
      lastMove = vertex
      currentPlayer = currentPlayer === 1 ? -1 : 1
      return true
    } catch {
      return false
    }
  }

  function pass(): void {
    currentPlayer = currentPlayer === 1 ? -1 : 1
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
    makeMove,
    pass,
    getSignMap,
  }
}
