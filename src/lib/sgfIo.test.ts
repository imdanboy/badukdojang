import { describe, expect, test } from 'vitest'
import {
  appendMove,
  appendPass,
  createGameTree,
  getCurrentSignMap,
  getMoveList,
} from './gameTree.ts'
import {
  downloadSGF,
  getBoardSizeFromTree,
  loadSGFFile,
  sgfToTree,
  treeToSGF,
} from './sgfIo.ts'

describe('sgfIo', () => {
  test('treeToSGF produces FF[4] compliant SGF', () => {
    const tree = createGameTree(19)
    const sgf = treeToSGF(tree, 19)
    expect(sgf).toContain('FF[4]')
    expect(sgf).toContain('GM[1]')
    expect(sgf).toContain('SZ[19]')
    expect(sgf).toMatch(/^\(/)
  })

  test('treeToSGF includes move sequences', () => {
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    tree = appendPass(tree, 1)

    const sgf = treeToSGF(tree, 19)
    expect(sgf).toContain('B[dd]')
    expect(sgf).toContain('W[ee]')
    expect(sgf).toContain('B[]')
  })

  test('treeToSGF respects board size', () => {
    const tree = createGameTree(9)
    const sgf = treeToSGF(tree, 9)
    expect(sgf).toContain('SZ[9]')
  })

  test('sgfToTree parses SGF and returns GameTree', () => {
    const sgf = '(;FF[4]GM[1]SZ[19];B[dd];W[ee])'
    const tree = sgfToTree(sgf)
    expect(tree.root.data.FF).toEqual(['4'])
    expect(tree.root.data.GM).toEqual(['1'])
    expect(tree.root.data.SZ).toEqual(['19'])
    expect(tree.root.children.length).toBe(1)
    expect(tree.root.children[0]!.data.B).toEqual(['dd'])
  })

  test('SGF round-trip preserves game state', () => {
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)
    tree = appendMove(tree, [4, 4], -1)
    tree = appendMove(tree, [5, 5], 1)
    tree = appendPass(tree, -1)

    const sgf = treeToSGF(tree, 19)
    const loadedTree = sgfToTree(sgf)

    const originalMoves = getMoveList(tree)
    const loadedMoves = getMoveList(loadedTree)
    expect(loadedMoves).toEqual(originalMoves)

    const originalSignMap = getCurrentSignMap(tree, 19)
    const loadedSignMap = getCurrentSignMap(loadedTree, 19)
    expect(loadedSignMap).toEqual(originalSignMap)
  })

  test('SGF round-trip with captures', () => {
    let tree = createGameTree(9)
    // Corner capture: B at (1,0), W at (0,0), B at (0,1) captures W
    tree = appendMove(tree, [1, 0], 1)
    tree = appendMove(tree, [0, 0], -1)
    tree = appendMove(tree, [0, 1], 1)

    const sgf = treeToSGF(tree, 9)
    const loadedTree = sgfToTree(sgf)

    const originalSignMap = getCurrentSignMap(tree, 9)
    const loadedSignMap = getCurrentSignMap(loadedTree, 9)
    expect(loadedSignMap).toEqual(originalSignMap)
    expect(loadedSignMap[0]![0]).toBe(0) // captured
    expect(loadedSignMap[1]![0]).toBe(1)
    expect(loadedSignMap[0]![1]).toBe(1)
  })

  test('malformed SGF with out-of-range coords handled gracefully', () => {
    const malformed = '(;FF[4]GM[1]SZ[19]B[zz])'
    // parse() accepts any string value inside brackets; validation is
    // deferred to board replay. sgfToTree should not throw.
    const tree = sgfToTree(malformed)
    expect(tree.root.data.B).toEqual(['zz'])
  })

  test('non-SGF content rejected', () => {
    expect(() => sgfToTree('hello world')).toThrow()
  })

  test('getBoardSizeFromTree extracts SZ from root', () => {
    const sgf19 = '(;FF[4]GM[1]SZ[19];B[dd])'
    const tree19 = sgfToTree(sgf19)
    expect(getBoardSizeFromTree(tree19)).toBe(19)

    const sgf9 = '(;FF[4]GM[1]SZ[9];B[ee])'
    const tree9 = sgfToTree(sgf9)
    expect(getBoardSizeFromTree(tree9)).toBe(9)
  })

  test('getBoardSizeFromTree defaults to 19 when SZ missing', () => {
    const sgf = '(;FF[4]GM[1];B[dd])'
    const tree = sgfToTree(sgf)
    expect(getBoardSizeFromTree(tree)).toBe(19)
  })

  test('loadSGFFile reads File and returns GameTree', async () => {
    const sgfContent = '(;FF[4]GM[1]SZ[19];B[dd];W[ee])'
    const file = new File([sgfContent], 'test.sgf', {
      type: 'application/x-go-sgf',
    })
    const tree = await loadSGFFile(file)
    expect(tree.root.data.FF).toEqual(['4'])
    expect(tree.root.children[0]!.data.B).toEqual(['dd'])
  })

  test('downloadSGF creates downloadable SGF', () => {
    let tree = createGameTree(19)
    tree = appendMove(tree, [3, 3], 1)

    // Mock URL.createObjectURL and document.createElement
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createdUrls: string[] = []
    let clickedAnchor: HTMLAnchorElement | null = null

    URL.createObjectURL = (_blob: Blob) => {
      const url = `blob:mock-${createdUrls.length}`
      createdUrls.push(url)
      return url
    }
    URL.revokeObjectURL = () => {}

    const originalCreateElement = document.createElement
    document.createElement = (tagName: string) => {
      const el = originalCreateElement.call(document, tagName)
      if (tagName === 'a') {
        el.click = () => {
          clickedAnchor = el as HTMLAnchorElement
        }
      }
      return el
    }

    try {
      downloadSGF(tree, 'game.sgf', 19)
      expect(createdUrls.length).toBe(1)
      expect(clickedAnchor).not.toBeNull()
      expect(clickedAnchor!.download).toBe('game.sgf')
      expect(clickedAnchor!.href).toBe(createdUrls[0])
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      document.createElement = originalCreateElement
    }
  })
})
