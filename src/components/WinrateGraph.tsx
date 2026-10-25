/*
 * WinrateGraph — SVG winrate-over-moves chart for the currently selected
 * branch (no chart dependency; plain SVG like the ownership overlay).
 *
 * Data: one point per analyzed move node on the current path, with the
 * winrate normalized to BLACK's perspective (top = Black winning).
 * Clicking a point navigates the board to that tree node. Points exist
 * only where analysis data is cached (session cache or SGF-embedded KA);
 * the full-tree batch analysis fills every branch.
 */
import type { WinratePoint } from '../lib/treeLayout.ts'

export interface WinrateGraphProps {
  points: readonly WinratePoint[]
  currentNodeId: string | null
  onPointClick: (nodeId: string) => void
}

const VIEW_W = 300
const VIEW_H = 110
const PAD_LEFT = 30
const PAD_RIGHT = 8
const PAD_TOP = 10
const PAD_BOTTOM = 18

export function WinrateGraph({
  points,
  currentNodeId,
  onPointClick,
}: WinrateGraphProps) {
  if (points.length === 0) {
    return (
      <div
        id="winrate-graph-empty"
        style={{
          background: '#16162a',
          borderRadius: '6px',
          border: '1px solid #3b3b5c',
          color: '#8a8ab0',
          fontSize: '12px',
          padding: '10px 12px',
        }}
      >
        승률 그래프 — 분석 결과가 없습니다. 전체 분석을 실행하거나 수를
        탐색해 분석해 보세요.
      </div>
    )
  }

  const maxMove = Math.max(...points.map((p) => p.moveNumber), 1)
  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const x = (moveNumber: number): number =>
    PAD_LEFT + (moveNumber / maxMove) * plotW
  const y = (winrate: number): number => PAD_TOP + (1 - winrate) * plotH

  // Consecutive analyzed points are connected; isolated points stand alone.
  const sorted = [...points].sort((a, b) => a.moveNumber - b.moveNumber)
  const segments: string[][] = []
  let currentSegment: string[] = []
  let prev: WinratePoint | null = null
  for (const point of sorted) {
    if (prev !== null && point.moveNumber === prev.moveNumber + 1) {
      currentSegment.push(`${x(point.moveNumber)},${y(point.winrate)}`)
    } else {
      if (currentSegment.length > 0) segments.push(currentSegment)
      currentSegment = [`${x(point.moveNumber)},${y(point.winrate)}`]
    }
    prev = point
  }
  if (currentSegment.length > 0) segments.push(currentSegment)

  const midY = y(0.5)

  return (
    <div
      style={{
        background: '#16162a',
        borderRadius: '6px',
        border: '1px solid #3b3b5c',
        padding: '4px',
      }}
    >
      <svg
        id="winrate-graph"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label="승률 그래프"
        style={{ display: 'block' }}
      >
        {/* Frame + 50% line */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="#3b3b5c"
          strokeWidth={1}
        />
        <line
          x1={PAD_LEFT}
          y1={midY}
          x2={PAD_LEFT + plotW}
          y2={midY}
          stroke="#3b3b5c"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        {/* Y labels (Black perspective) */}
        <text x={PAD_LEFT - 4} y={PAD_TOP + 4} className="winrate-graph-label" textAnchor="end">
          흑 100
        </text>
        <text x={PAD_LEFT - 4} y={midY + 3} className="winrate-graph-label" textAnchor="end">
          50
        </text>
        <text x={PAD_LEFT - 4} y={PAD_TOP + plotH + 4} className="winrate-graph-label" textAnchor="end">
          백 0
        </text>
        {/* X labels */}
        <text x={PAD_LEFT} y={VIEW_H - 4} className="winrate-graph-label" textAnchor="start">
          0
        </text>
        <text
          x={PAD_LEFT + plotW}
          y={VIEW_H - 4}
          className="winrate-graph-label"
          textAnchor="end"
        >
          {maxMove}수
        </text>

        {/* Series */}
        {segments.map((segment, i) => (
          <polyline
            key={`segment-${i}`}
            points={segment.join(' ')}
            fill="none"
            stroke="#5a7fb5"
            strokeWidth={1.5}
          />
        ))}
        {sorted.map((point) => {
          const isCurrent = point.nodeId === currentNodeId
          return (
            <g
              key={point.nodeId}
              data-winrate-point={point.nodeId}
              data-move-number={point.moveNumber}
              data-winrate={point.winrate.toFixed(3)}
              role="button"
              tabIndex={0}
              aria-label={`${point.moveNumber}수 승률 ${(point.winrate * 100).toFixed(0)}%`}
              style={{ cursor: 'pointer' }}
              onClick={() => onPointClick(point.nodeId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPointClick(point.nodeId)
                }
              }}
            >
              <title>{`${point.moveNumber}수 — 흑 ${(point.winrate * 100).toFixed(1)}%`}</title>
              {/* Larger invisible hit target */}
              <circle
                cx={x(point.moveNumber)}
                cy={y(point.winrate)}
                r={6}
                fill="transparent"
              />
              <circle
                cx={x(point.moveNumber)}
                cy={y(point.winrate)}
                r={isCurrent ? 4 : 2.5}
                fill={isCurrent ? '#5a7fb5' : '#8a9cc9'}
                stroke={isCurrent ? '#cdd8f0' : 'none'}
                strokeWidth={1}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
