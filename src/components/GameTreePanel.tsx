/*
 * GameTreePanel — compact visualization of the COMPLETE SGF game tree
 * (all variation branches). Pure SVG, no extra dependency.
 *
 * Layout comes from lib/treeLayout.ts (depth = column, DFS branch rows).
 * The selected line (root → current node) is highlighted; clicking any
 * node navigates the board to that exact state via GameState.navigateToNode.
 * Long/wide trees scroll inside a bounded container so the right function
 * column stays compact (desktop) and usable on mobile.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { GameTree } from '../lib/gameTree.ts'
import { layoutGameTree } from '../lib/treeLayout.ts'

export interface GameTreePanelProps {
  tree: GameTree
  /** Bumped by the parent on every tree change/navigation. */
  moveVersion: number
  onNodeClick: (nodeId: string) => void
}

const COL_SPACING = 15
const ROW_SPACING = 17
const NODE_RADIUS = 4.5
const MAX_HEIGHT = 150

const panelStyle: React.CSSProperties = {
  background: '#16162a',
  borderRadius: '6px',
  border: '1px solid #3b3b5c',
}

export function GameTreePanel({
  tree,
  moveVersion,
  onNodeClick,
}: GameTreePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const layout = useMemo(
    () => layoutGameTree(tree),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, moveVersion],
  )

  const currentNodeId = String(tree.currentId ?? tree.root.id)
  const current = layout.byId.get(currentNodeId)

  // Keep the current node visible when navigation happens off-panel
  // (playback buttons, new moves).
  useEffect(() => {
    const container = scrollRef.current
    if (container == null || current == null) return
    const el = container.querySelector<HTMLElement>(
      `[data-tree-node="${current.id}"]`,
    )
    if (el == null || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current?.id])

  const width = (layout.maxCol + 1) * COL_SPACING
  const height = (layout.maxRow + 1) * ROW_SPACING

  const cx = (col: number): number => col * COL_SPACING + COL_SPACING / 2
  const cy = (row: number): number => row * ROW_SPACING + ROW_SPACING / 2

  return (
    <div
      ref={scrollRef}
      className="game-tree-panel"
      style={{ ...panelStyle, maxHeight: MAX_HEIGHT, overflow: 'auto' }}
      data-testid="game-tree-panel"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="기보 트리"
        style={{ display: 'block' }}
      >
        {/* Edges — path edges highlighted */}
        {layout.nodes.map((node) => {
          if (node.parentId == null) return null
          const parent = layout.byId.get(node.parentId)
          if (parent == null) return null
          return (
            <line
              key={`edge-${node.id}`}
              x1={cx(parent.col)}
              y1={cy(parent.row)}
              x2={cx(node.col)}
              y2={cy(node.row)}
              stroke={node.onPath && parent.onPath ? '#5a7fb5' : '#3b3b5c'}
              strokeWidth={node.onPath && parent.onPath ? 2 : 1}
              pointerEvents="none"
            />
          )
        })}
        {/* Nodes */}
        {layout.nodes.map((node) => {
          const isCurrent = node.id === currentNodeId
          const isRoot = node.parentId == null
          const color = isCurrent
            ? '#5a7fb5'
            : node.onPath
              ? '#8a9cc9'
              : '#4a4a6a'
          return (
            <g
              key={node.id}
              data-tree-node={node.id}
              data-on-path={node.onPath ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={
                isRoot
                  ? '시작 노드'
                  : `${node.moveNumber ?? ''}수 노드`.trim()
              }
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
              onClick={() => onNodeClick(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onNodeClick(node.id)
                }
              }}
            >
              <title>
                {isRoot
                  ? '시작'
                  : `${node.moveNumber ?? '?'}수`}
              </title>
              <circle
                cx={cx(node.col)}
                cy={cy(node.row)}
                r={NODE_RADIUS + (isCurrent ? 1.5 : 0)}
                fill={isRoot ? 'none' : color}
                stroke={color}
                strokeWidth={isRoot ? 1.5 : 1}
              />
              {isCurrent && (
                <circle
                  cx={cx(node.col)}
                  cy={cy(node.row)}
                  r={NODE_RADIUS + 3}
                  fill="none"
                  stroke="#5a7fb5"
                  strokeWidth={1.5}
                  opacity={0.7}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
