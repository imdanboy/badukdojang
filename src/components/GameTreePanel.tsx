/*
 * GameTreePanel — full-width visualization of the COMPLETE SGF game tree
 * (all variation branches). Pure SVG, no extra dependency.
 *
 * Rendered inside the bottom tree dock (see App — toggled from the
 * ReviewPanel) so long lines and variation forks get the whole app content
 * width; with `fill` the panel stretches to the dock's height and very
 * long/wide trees scroll inside the panel on both axes (the page never
 * scrolls). Node visuals are OGS-like stones: every move (passes included)
 * is a black/white numbered stone node; the root, setup/comment-only nodes,
 * and passes keep their distinct (hollow/dashed/neutral) look.
 *
 * Layout comes from lib/treeLayout.ts (depth = column, DFS branch rows).
 * The selected line (root → current node) is highlighted; clicking any
 * node navigates the board to that exact state via GameState.navigateToNode.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { GameTree } from '../lib/gameTree.ts'
import type { TreeLayoutNode } from '../lib/treeLayout.ts'
import { layoutGameTree } from '../lib/treeLayout.ts'

export interface GameTreePanelProps {
  tree: GameTree
  /** Bumped by the parent on every tree change/navigation. */
  moveVersion: number
  onNodeClick: (nodeId: string) => void
  /** Fill the parent's height (tree dock) instead of the standalone cap. */
  fill?: boolean
}

/* Wider pitch/radius suited to in-node numbers at full app width. */
const COL_SPACING = 36
const ROW_SPACING = 32
const NODE_RADIUS = 13
const FONT_SIZE = 13
const FONT_SIZE_SMALL = 10 // ≥3-digit move numbers
/* Standalone (non-fill) vertical cap so huge variation trees never dominate
   the page: the panel scrolls internally on both axes below that bound. In
   the tree dock (`fill`) the dock's height replaces this cap. */
const MAX_HEIGHT = 'clamp(180px, 42vh, 420px)'

const COLORS = {
  bg: '#16162a',
  border: '#3b3b5c',
  edge: '#3b3b5c',
  pathEdge: '#5a7fb5',
  accent: '#5a7fb5',
  black: '#141418',
  blackEdge: '#6a6a8a',
  white: '#f2f2ee',
  whiteEdge: '#b9b9c6',
  neutral: '#8a8ab0',
  numberLight: '#f2f2ee',
  numberDark: '#15151a',
}

const panelStyle: React.CSSProperties = {
  background: '#16162a',
  borderRadius: '8px',
  border: '1px solid #3b3b5c',
  width: '100%',
}

type NodeKind = 'root' | 'move' | 'pass' | 'meta'

function kindOf(node: TreeLayoutNode, isRoot: boolean): NodeKind {
  if (isRoot) return 'root'
  if (node.moveNumber === null) return 'meta'
  return node.isPass ? 'pass' : 'move'
}

export function GameTreePanel({
  tree,
  moveVersion,
  onNodeClick,
  fill = false,
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
  // (playback buttons, new moves, tree clicks). Scrolls ONLY this panel —
  // scrollIntoView() would also scroll the app shell (page-level vertical
  // scroll) toward the tree on every navigation.
  useEffect(() => {
    const container = scrollRef.current
    if (container == null || current == null) return
    const el = container.querySelector<HTMLElement>(
      `[data-tree-node="${current.id}"]`,
    )
    if (el == null) return
    const panelRect = container.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const margin = NODE_RADIUS + 6
    let left: number | null = null
    let top: number | null = null
    if (rect.left < panelRect.left) {
      left = container.scrollLeft - (panelRect.left - rect.left) - margin
    } else if (rect.right > panelRect.right) {
      left = container.scrollLeft + (rect.right - panelRect.right) + margin
    }
    if (rect.top < panelRect.top) {
      top = container.scrollTop - (panelRect.top - rect.top) - margin
    } else if (rect.bottom > panelRect.bottom) {
      top = container.scrollTop + (rect.bottom - panelRect.bottom) + margin
    }
    if (left != null || top != null) {
      container.scrollTo({ left: left ?? container.scrollLeft, top: top ?? container.scrollTop })
    }
  }, [current?.id])

  const width = (layout.maxCol + 1) * COL_SPACING
  const height = (layout.maxRow + 1) * ROW_SPACING

  const cx = (col: number): number => col * COL_SPACING + COL_SPACING / 2
  const cy = (row: number): number => row * ROW_SPACING + ROW_SPACING / 2

  return (
    <div
      ref={scrollRef}
      className="game-tree-panel"
      style={{
        ...panelStyle,
        overflow: 'auto',
        ...(fill
          ? { height: '100%', maxHeight: 'none' }
          : { maxHeight: MAX_HEIGHT }),
      }}
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
        {/* Edges — branch connectors; path edges highlighted */}
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
              stroke={node.onPath && parent.onPath ? COLORS.pathEdge : COLORS.edge}
              strokeWidth={node.onPath && parent.onPath ? 2 : 1}
              pointerEvents="none"
            />
          )
        })}
        {/* Nodes — numbered stone nodes (OGS-like) + distinct meta nodes */}
        {layout.nodes.map((node) => {
          const isRoot = node.parentId == null
          const isCurrent = node.id === currentNodeId
          const kind = kindOf(node, isRoot)
          const numberTestId = node.moveNumber

          let fill: string | undefined
          let stroke = node.onPath ? COLORS.accent : COLORS.edge
          let strokeWidth = 1.5
          let dashed = false
          let numberFill: string | undefined

          switch (kind) {
            case 'root':
              fill = 'none' // hollow — the starting position is not a stone
              break
            case 'move':
              if (node.moveSign === -1) {
                fill = COLORS.white
                stroke = COLORS.whiteEdge
                numberFill = COLORS.numberDark
              } else {
                fill = COLORS.black
                stroke = COLORS.blackEdge
                numberFill = COLORS.numberLight
              }
              break
            case 'pass':
              // Neutral dashed node, still numbered — a pass is not a stone.
              fill = 'none'
              dashed = true
              stroke = COLORS.neutral
              numberFill = COLORS.neutral
              break
            case 'meta':
              // Setup/comment-only node: small hollow dashed circle, no number.
              fill = 'none'
              dashed = true
              stroke = COLORS.edge
              break
          }

          const radius =
            kind === 'meta' ? 6 : kind === 'root' ? NODE_RADIUS + 2 : NODE_RADIUS

          const ariaLabel = (() => {
            if (kind === 'root') return '시작 노드'
            if (kind === 'pass') return `${numberTestId}수 패스 노드`
            if (kind === 'meta') return '설정 노드'
            return `${numberTestId}수 노드`
          })()

          return (
            <g
              key={node.id}
              data-tree-node={node.id}
              data-node-kind={kind}
              data-on-path={node.onPath ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
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
                {(() => {
                  if (kind === 'root') return '시작'
                  if (kind === 'pass') return `${numberTestId}수 (패스)`
                  if (kind === 'meta') return '설정 코멘트'
                  return `${numberTestId}수`
                })()}
              </title>
              <circle
                className={`tree-node-stone tree-node-stone_${kind}`}
                data-stone-black={kind === 'move' && node.moveSign === 1 ? 'true' : undefined}
                data-stone-white={kind === 'move' && node.moveSign === -1 ? 'true' : undefined}
                cx={cx(node.col)}
                cy={cy(node.row)}
                r={radius + (isCurrent ? 1.5 : 0)}
                fill={fill}
                stroke={isCurrent ? COLORS.accent : stroke}
                strokeWidth={isCurrent ? 2.5 : strokeWidth}
                strokeDasharray={dashed ? '4 3' : undefined}
              />
              {isCurrent && (
                <circle
                  cx={cx(node.col)}
                  cy={cy(node.row)}
                  r={radius + 3}
                  fill="none"
                  stroke={COLORS.accent}
                  strokeWidth={1.5}
                  opacity={0.7}
                />
              )}
              {kind === 'move' && numberTestId !== null && (
                <text
                  className="tree-node-number"
                  x={cx(node.col)}
                  y={cy(node.row)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={numberTestId >= 100 ? FONT_SIZE_SMALL : FONT_SIZE}
                  fontWeight={600}
                  fill={numberFill}
                  pointerEvents="none"
                >
                  {numberTestId}
                </text>
              )}
              {kind === 'pass' && numberTestId !== null && (
                <text
                  className="tree-node-number"
                  x={cx(node.col)}
                  y={cy(node.row)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={numberTestId >= 100 ? FONT_SIZE_SMALL : FONT_SIZE}
                  fill={numberFill}
                  pointerEvents="none"
                >
                  {numberTestId}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
