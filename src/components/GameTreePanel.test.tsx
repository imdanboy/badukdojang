/*
 * GameTreePanel unit tests.
 * Covers: numbered black/white stone nodes, pass nodes stay numbered and
 * neutral, root/setup/comment nodes are distinguishable (no number), and
 * node click navigation fires for every node kind.
 */
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { appendMove, appendPass, createGameTree, navigateToNode } from '../lib/gameTree.ts'
import type { GameTree } from '../lib/gameTree.ts'
import { sgfToTree } from '../lib/sgfIo.ts'
import { GameTreePanel } from './GameTreePanel.tsx'

/** Build root → B1 → W2 with a variation fork at W2 → B3'. */
function buildTreeWithFork(): { tree: GameTree; ids: string[] } {
  let tree = createGameTree(9)
  tree = appendMove(tree, [0, 0], 1) // black 1
  const m1 = String(tree.root.children[0]!.id)
  tree = appendMove(tree, [1, 1], -1) // white 2
  const m2 = String(tree.currentId!)
  tree = appendMove(tree, [2, 2], 1) // black 3 (main line)
  const atM2 = navigateToNode(tree, m2)
  tree = appendMove(atM2!, [5, 5], 1) // black 3' (variation)
  const m3var = String(tree.currentId!)
  return { tree, ids: [m1, m2, m3var] }
}

function renderPanel(tree: GameTree, onNodeClick: (id: string) => void = () => {}) {
  render(<GameTreePanel tree={tree} moveVersion={0} onNodeClick={onNodeClick} />)
  return {
    onNodeClick,
    panel: document.querySelector('[data-testid="game-tree-panel"]')!,
  }
}

describe('GameTreePanel', () => {
  test('move nodes are numbered black/white stones; root is hollow and unnumbered', () => {
    const { tree, ids } = buildTreeWithFork() // cursor at the variation branch
    const { panel } = renderPanel(tree)

    // Root: hollow starting node, no in-node number.
    const root = panel.querySelector('[data-tree-node="root"]')!
    expect(root.getAttribute('data-node-kind')).toBe('root')
    expect(root.getAttribute('aria-label')).toBe('시작 노드')
    expect(root.querySelector('.tree-node-number')).toBeNull()

    // Every move node carries its in-node number.
    for (const id of ids) {
      const node = panel.querySelector(`[data-tree-node="${id}"]`)!
      expect(node).not.toBeNull()
      expect(node.getAttribute('data-node-kind')).toBe('move')
      expect(node.querySelector('.tree-node-number')).not.toBeNull()
    }

    const m1 = panel.querySelector(`[data-tree-node="${ids[0]}"]`)!
    expect(m1.querySelector('.tree-node-number')!.textContent).toBe('1')
    expect(m1.querySelector('circle')!.getAttribute('data-stone-black')).toBe('true')
    expect(m1.querySelector('circle')!.getAttribute('data-stone-white')).toBeNull()

    const m2 = panel.querySelector(`[data-tree-node="${ids[1]}"]`)!
    expect(m2.querySelector('.tree-node-number')!.textContent).toBe('2')
    expect(m2.querySelector('circle')!.getAttribute('data-stone-white')).toBe('true')
    expect(m2.querySelector('circle')!.getAttribute('data-stone-black')).toBeNull()
  })

  test('passes are numbered and render as a distinct neutral node (not a stone)', () => {
    let tree = createGameTree(9)
    tree = appendMove(tree, [0, 0], 1)
    tree = appendPass(tree, -1)

    const { panel } = renderPanel(tree)
    const passNode = panel.querySelector(`[data-tree-node="${String(tree.currentId)}"]`)!
    expect(passNode.getAttribute('data-node-kind')).toBe('pass')
    expect(passNode.getAttribute('aria-label')).toContain('패스 노드')
    // Still numbered...
    expect(passNode.querySelector('.tree-node-number')!.textContent).toBe('2')
    // ...but not a black/white stone.
    const circle = passNode.querySelector('circle')!
    expect(circle.getAttribute('data-stone-black')).toBeNull()
    expect(circle.getAttribute('data-stone-white')).toBeNull()
  })

  test('setup/comment-only nodes stay distinguishable and unnumbered', () => {
    const tree = sgfToTree('(;FF[4]GM[1]SZ[9];B[aa];C[mid note];W[bb])')
    const { panel } = renderPanel(tree)

    const metaNode = panel.querySelectorAll('[data-node-kind="meta"]')[0]!
    expect(metaNode).not.toBeNull()
    expect(metaNode.querySelector('.tree-node-number')).toBeNull()
    // All node kinds coexist in a single tree view.
    expect(panel.querySelector('[data-node-kind="root"]')).not.toBeNull()
    expect(panel.querySelectorAll('[data-node-kind="move"]').length).toBe(2)
  })

  test('clicking any node (move, variation, root) delegates navigation', () => {
    const { tree, ids } = buildTreeWithFork()
    const onNodeClick = vi.fn()
    const { panel } = renderPanel(tree, onNodeClick)

    for (const id of ids) {
      fireEvent.click(panel.querySelector(`[data-tree-node="${id}"]`)!)
    }
    fireEvent.click(panel.querySelector('[data-tree-node="root"]')!)
    expect(onNodeClick).toHaveBeenCalledTimes(4)
    expect(onNodeClick).toHaveBeenLastCalledWith('root')
  })

  test('the current node and path are marked for highlighting', () => {
    const { tree, ids } = buildTreeWithFork() // cursor at the variation tip
    const { panel } = renderPanel(tree)
    // Variation tip is the current node and sits on the highlighted path.
    const current = panel.querySelector(`[data-tree-node="${ids[2]}"]`)!
    expect(current.getAttribute('data-on-path')).toBe('true')
    const currentCount = panel.querySelectorAll(
      '[data-tree-node="root"][data-on-path="true"]',
    ).length
    expect(currentCount).toBe(1)
    // Main-line tip is NOT on the current path.
    const offPath = panel.querySelector(`[data-node-kind="move"][data-on-path="false"]`)
    expect(offPath).not.toBeNull()
  })

  test('fill mode stretches to the dock parent and keeps internal scrolling', () => {
    const tree = createGameTree(9)
    render(
      <div style={{ height: '300px' }}>
        <GameTreePanel tree={tree} moveVersion={0} onNodeClick={() => {}} fill />
      </div>,
    )
    const panel = document.querySelector('[data-testid="game-tree-panel"]') as HTMLElement
    // Dock mode: no standalone height cap; the dock's height rules instead.
    expect(panel.style.height).toBe('100%')
    expect(panel.style.maxHeight).toBe('none')
    // Internal scrolling on both axes (never page-level).
    expect(panel.style.overflow).toBe('auto')
  })
})
