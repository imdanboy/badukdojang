import { describe, expect, test, beforeEach } from 'vitest'
import type { BoardSize, GameMode } from './types.ts'
import { createGameState } from './gameState.ts'
import type { GameState } from './gameState.ts'
import {
  appendMove,
  appendPass,
  createGameTree,
  getMoveList,
  undo,
} from './gameTree.ts'
import type { GameTree } from './gameTree.ts'
import {
  ACTIVE_GAME_STORAGE_KEY,
  clearActiveGame,
  isBlankGame,
  restoreActiveGame,
  saveActiveGame,
} from './autosave.ts'

/** Build a 9x9 game: B(3,3), W(4,4), B pass. */
function buildGame(): GameState {
  const tree = withMoves()
  return createGameState(9, tree)
}

function withMoves(): GameTree {
  let tree = createGameTree(9)
  tree = appendMove(tree, [3, 3], 1)
  tree = appendMove(tree, [4, 4], -1)
  tree = appendPass(tree, 1)
  return tree
}

describe('autosave — blank detection', () => {
  test('initial game state is blank', () => {
    expect(isBlankGame(createGameTree(19))).toBe(true)
    expect(isBlankGame(createGameState(19).gameTree)).toBe(true)
  })

  test('a game with moves is not blank', () => {
    const gs = createGameState(9)
    gs.makeMove([4, 4])
    expect(isBlankGame(gs.gameTree)).toBe(false)
  })

  test('a game with setup stones but no moves is not blank', () => {
    const tree = createGameTree(9).mutate((draft) => {
      draft.appendNode(draft.root.id, { AB: ['dd'] })
    })
    tree.currentId = tree.root.children[0]!.id
    expect(isBlankGame(tree)).toBe(false)
  })

  test('a non-empty tree whose cursor is at root is not blank', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    tree = undo(tree)!
    tree = undo(tree)!
    // Cursor is at root: the current path holds no moves at all.
    expect(tree.currentId ?? tree.root.id).toBe(tree.root.id)
    expect(getMoveList(tree).length).toBe(0)
    expect(isBlankGame(tree)).toBe(false)
  })

  test('a tree with content only in non-current branches is not blank', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [3, 3], 1)
    // Sibling branch of the move node — mutate resets the cursor to root,
    // so the move and the setup stones both live off the current path.
    tree = tree.mutate((draft) => {
      draft.appendNode(draft.root.id, { AB: ['ii'] })
    })
    expect(getMoveList(tree).length).toBe(0)
    expect(isBlankGame(tree)).toBe(false)
  })
})

describe('autosave — save/load/clear', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('save writes a versioned draft into localStorage', () => {
    const gs = buildGame()
    saveActiveGame(gs.gameTree, { boardSize: 9, gameMode: 'ai' })

    const raw = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const draft = JSON.parse(raw!) as {
      version: number
      sgf: string
      cursorPath: number[]
      gameMode: string
    }
    expect(draft.version).toBe(1)
    expect(draft.sgf).toContain('SZ[9]')
    expect(draft.sgf).toContain('B[dd]')
    expect(draft.sgf).toContain('W[ee]')
    expect(draft.sgf).toContain('B[]') // pass
    expect(draft.cursorPath).toEqual([0, 0, 0])
    expect(draft.gameMode).toBe('ai')
  })

  test('clearActiveGame removes the draft', () => {
    const gs = buildGame()
    saveActiveGame(gs.gameTree, { boardSize: 9, gameMode: 'selfplay' })
    expect(localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).not.toBeNull()
    clearActiveGame()
    expect(localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull()
  })

  test('saving never throws when localStorage is unavailable', () => {
    const gs = buildGame()
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    expect(() =>
      saveActiveGame(gs.gameTree, { boardSize: 9, gameMode: 'selfplay' }),
    ).not.toThrow()
    localStorage.setItem = original
  })
})

describe('autosave — restore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('round-trips board size, mode, stones, and turn', () => {
    const gs = buildGame()
    saveActiveGame(gs.gameTree, { boardSize: 9, gameMode: 'ai' })
    const restored = restoreActiveGame()

    expect(restored).not.toBeNull()
    expect(restored!.boardSize).toBe(9)
    expect(restored!.gameMode).toBe('ai')
    // B(3,3), W(4,4), B pass → last stone is W(4,4), White to move.
    expect(restored!.gameState.currentPlayer).toBe(-1)
    expect(restored!.gameState.lastMove).toEqual([4, 4])
    expect(restored!.gameState.getSignMap()[3]![3]).toBe(1)
    expect(restored!.gameState.getSignMap()[4]![4]).toBe(-1)
  })

  test('restores the navigation cursor (mid-game undo)', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    tree = appendMove(tree, [5, 5], 1)
    // Cursor now points at move #2 (B(3,3), W(4,4) played, Black to move).
    const saved = undo(tree)!

    saveActiveGame(saved, { boardSize: 9, gameMode: 'selfplay' })
    const restored = restoreActiveGame()

    expect(restored).not.toBeNull()
    expect(restored!.gameState.getSignMap()[3]![3]).toBe(1)
    expect(restored!.gameState.getSignMap()[4]![4]).toBe(-1)
    expect(restored!.gameState.getSignMap()[5]![5]).toBe(0)
    expect(restored!.gameState.currentPlayer).toBe(1)
  })

  test('continuing a restored mid-game game preserves earlier variations', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    // Cursor at move #1; the W(4,4) response stays in the tree as a variation.
    const atMove1 = undo(tree)!
    saveActiveGame(atMove1, { boardSize: 9, gameMode: 'selfplay' })

    const restored = restoreActiveGame()!
    expect(restored.gameState.makeMove([5, 5])).toBe(true)

    // B(3,3) now branches: original W(4,4) and the new W(5,5).
    const branch = restored.gameState.gameTree.root.children[0]!
    expect(branch.children.length).toBe(2)
    expect(
      branch.children.some(
        (node) => (node.data.W as string[] | undefined)?.[0] === 'ee',
      ),
    ).toBe(true)
  })

  test('returns null when nothing is saved', () => {
    expect(restoreActiveGame()).toBeNull()
  })

  test('returns null for malformed JSON', () => {
    localStorage.setItem(ACTIVE_GAME_STORAGE_KEY, '{not valid json')
    expect(restoreActiveGame()).toBeNull()
  })

  test('returns null for unsupported draft versions', () => {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({ version: 99, sgf: '(;SZ[9])' }),
    )
    expect(restoreActiveGame()).toBeNull()
  })

  test('returns null when the sgf body is missing or empty', () => {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({ version: 1, cursorPath: [], gameMode: 'selfplay' }),
    )
    expect(restoreActiveGame()).toBeNull()

    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sgf: '   ',
        cursorPath: [],
        gameMode: 'selfplay',
      }),
    )
    expect(restoreActiveGame()).toBeNull()
  })

  test('unparsable SGF yields null instead of throwing', () => {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sgf: 'definitely not sgf',
        cursorPath: [],
        gameMode: 'selfplay',
      }),
    )
    expect(restoreActiveGame()).toBeNull()
  })

  test('malformed cursorPath falls back to a safe cursor', () => {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sgf: '(;SZ[9];B[dd])',
        cursorPath: ['zero', -1, 1.5],
        gameMode: 'selfplay',
      }),
    )
    const restored = restoreActiveGame()
    expect(restored).not.toBeNull()
    // Invalid entries are dropped → cursor degrades to root (blank board).
    const signMap = restored!.gameState.getSignMap()
    expect(signMap[3]![3]).toBe(0)
  })

  test('unsupported gameMode falls back to selfplay', () => {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sgf: '(;SZ[9];B[dd])',
        cursorPath: [],
        gameMode: 'puzzle',
      }),
    )
    const restored = restoreActiveGame()
    expect(restored).not.toBeNull()
    expect(restored!.gameMode).toBe('selfplay')
  })

  test('board size outside 9/13/19 falls back to 19', () => {
    let tree = createGameTree(25)
    tree = appendMove(tree, [11, 11], 1)
    saveActiveGame(tree, {
      boardSize: 25 as BoardSize,
      gameMode: 'ai' as GameMode,
    })
    const restored = restoreActiveGame()
    expect(restored).not.toBeNull()
    expect(restored!.boardSize).toBe(19)
    expect(restored!.gameState.getSignMap().length).toBe(19)
  })
})
