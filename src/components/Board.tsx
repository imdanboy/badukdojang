/*
 * Board - React wrapper around @kaya/shudan's <Goban>.
 * Measures the container (both width and height) via ResizeObserver and
 * computes vertexSize as a fixed pixel number (Shudan requires numeric
 * vertexSize, not CSS) so the board fills the largest square that fits the
 * actual available slot — not just the column width.
 * Flashes a red border for 200ms when an illegal move is attempted.
 * The board theme is read from BoardThemeProvider context — the single
 * source of truth (no duplicated theme state in App).
 * Ownership overlay: OGS-style solid square marks sized by confidence,
 * rendered as an SVG layer aligned to the Goban's measured content area.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Goban } from '@kaya/shudan'
import type { BoardMap, HeatVertex, Marker, SignMap, Vertex } from '@kaya/shudan'
import { useBoardTheme } from '@kaya/themes'
import { ownershipMarks } from '../lib/ownership.ts'
import { policyMarks } from '../lib/policy.ts'

export interface BoardProps {
  signMap: SignMap
  boardSize: number
  markerMap?: BoardMap<Marker | null> | undefined
  onVertexClick?: ((evt: React.MouseEvent, vertex: Vertex) => void) | undefined
  flashTrigger?: number
  showCoordinates?: boolean
  currentPlayer: 1 | -1
  aiGhostVertex?: Vertex | null
  aiFlashVertex?: Vertex | null
  /** KataGo ownership flat array (length boardSize^2, [-1,1]). null/undefined = no data. */
  ownership?: readonly number[] | null
  /** Toggle the ownership overlay on/off. */
  showOwnership?: boolean
  /** KataGo policy probabilities for empty vertices. */
  policy?: readonly number[] | null
  /** Toggle the policy probability overlay on/off. */
  showPolicy?: boolean
  /** Top-N candidate moves to render as score-lead/visit markers. */
  candidateMoves?: CandidateMoveMarker[] | undefined
  /** Vertices to dim (e.g., dead stones in scoring mode). */
  dimmedVertices?: Vertex[] | undefined
  /** When true, suppress the faint hover ghost stone (e.g., opponent's turn). */
  hoverGhostDisabled?: boolean
}

export interface CandidateMoveMarker {
  readonly vertex: Vertex
  readonly scoreLead: number
  readonly visits: number
}

/** Rect of the Goban's board-content area in wrapper coordinates. */
interface ContentRect {
  left: number
  top: number
  size: number
}

/** Content-box size of the board slot available to the Goban. */
interface ContainerSize {
  width: number
  height: number
}

export function Board({
  signMap,
  boardSize,
  markerMap,
  onVertexClick,
  flashTrigger = 0,
  showCoordinates = true,
  currentPlayer,
  aiGhostVertex = null,
  aiFlashVertex = null,
  ownership = null,
  showOwnership = false,
  policy = null,
  showPolicy = false,
  candidateMoves = undefined,
  dimmedVertices = undefined,
  hoverGhostDisabled = false,
}: BoardProps) {
  const { boardTheme } = useBoardTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  })
  const [contentRect, setContentRect] = useState<ContentRect | null>(null)
  const [flashError, setFlashError] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (el === null) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Measure the actual board-content area (`.shudan-content` inside the
  // Goban DOM) instead of reconstructing Goban's coordinate padding
  // arithmetic — immune to any future padding changes in Shudan.
  useEffect(() => {
    if (!showOwnership && !showPolicy && (candidateMoves?.length ?? 0) === 0) {
      setContentRect(null)
      return
    }
    const wrapEl = wrapRef.current
    const contentEl = wrapEl?.querySelector('.shudan-content')
    if (wrapEl === null || wrapEl === undefined || contentEl === null || contentEl === undefined) {
      return
    }

    const update = () => {
      const wrapRect = wrapEl.getBoundingClientRect()
      const rect = contentEl.getBoundingClientRect()
      setContentRect({
        left: rect.left - wrapRect.left,
        top: rect.top - wrapRect.top,
        size: rect.width,
      })
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [showOwnership, showPolicy, candidateMoves?.length, containerSize.width, containerSize.height, boardSize])

  useEffect(() => {
    if (flashTrigger === 0) return
    setFlashError(true)
    const timer = setTimeout(() => setFlashError(false), 200)
    return () => clearTimeout(timer)
  }, [flashTrigger])

  useEffect(() => {
    if (aiFlashVertex === null) return undefined
    const timer = setTimeout(() => {
      // AI flash effect is handled by transient marker state in parent
    }, 500)
    return () => clearTimeout(timer)
  }, [aiFlashVertex])

  // Fit the largest square that fills the measured slot in BOTH dimensions.
  // Shudan's chrome (coordinate labels + Goban padding) adds a fixed number
  // of vertex units around the boardSize×boardSize grid; we derive the exact
  // factors from Goban's inline padding/coordinate styles so the square grid
  // geometry stays intact and nothing overflows (verified in-browser):
  //   - coordinates hidden: width = height = boardSize × vertexSize
  //   - coordinates shown:
  //       width  = (0.5 pad + 1 label col) × 2 chrome → boardSize + 3 units
  //       height = 0.6 top pad + 0.6 top coord + 0.5 CoordY margin + 0.3
  //                bottom coord (its -0.3 margin) + 0.4 bottom pad
  //              → boardSize + 2.4 units (fractional — see wrap sizing below)
  // Both fits are taken so desktop prefers the smaller (height-bound) side
  // and mobile stays width-bound exactly as before.
  //
  // The wrapper is explicitly sized to the computed chrome box (integer
  // height via ceil) so that layouts where the container is content-sized
  // (mobile) re-measure a deterministic integer of our own choosing — the
  // fractional chrome height (e.g. 21.4 × 16 = 342.4 rendered as 342.375)
  // would otherwise floor into a full vertex drop and lock the board one
  // step smaller. On desktop the container is stretched to the true slot,
  // so the measured values are the genuine available space. A sub-pixel
  // epsilon covers fractional slot end/heights; the resulting overflow
  // (≤ divisor × epsilon ≈ ~1px) is invisible and absorbed by the border
  // flash allowance.
  const divisorW = boardSize + (showCoordinates ? 3 : 0)
  const divisorH = boardSize + (showCoordinates ? 2.4 : 0)
  const EPSILON = 0.5
  const { width: availW, height: availH } = containerSize
  const vertexSize =
    availW > 0
      ? Math.max(
          4,
          Math.floor(
            Math.min(
              (availW + EPSILON) / divisorW,
              availH > 0 ? (availH + EPSILON) / divisorH : Number.POSITIVE_INFINITY,
            ),
          ),
        )
      : 24
  // Explicit integer wrapper size derived from our own fit choice — keeps
  // content-sized (mobile) re-measurements deterministic (see above).
  const chromeWidth = Math.round(divisorW * vertexSize)
  const chromeHeight = Math.ceil(divisorH * vertexSize)

  // Ghost preview: no marker passed → Goban renders a faint ghost stone
  // (currentPlayer color, ~0.35 opacity) on the hovered empty vertex,
  // so the user can see whose turn it is before clicking.
  // AI ghost keeps the hollow circle marker; while the opponent's (AI's)
  // turn blocks any placement, `{ type: 'none' }` suppresses the hover
  // ghost entirely.
  const ghostMarker = useMemo<Marker | null>(() => {
    if (aiGhostVertex !== null) {
      return { type: 'circle' }
    }
    if (hoverGhostDisabled) {
      return { type: 'none' }
    }
    return null
  }, [aiGhostVertex, hoverGhostDisabled])

  // Ownership marks skip candidate-move vertices: the numeric candidate
  // marker is drawn there, and the overlays would stack on top of each other.
  const ownershipMarksList = useMemo(() => {
    if (!showOwnership || ownership === null) return null
    const occupiedByCandidates = new Set(
      (candidateMoves ?? []).map((m) => `${m.vertex[0]}-${m.vertex[1]}`),
    )
    return ownershipMarks(ownership, signMap, boardSize).filter(
      (m) => !occupiedByCandidates.has(`${m.cx - 0.5}-${m.cy - 0.5}`),
    )
  }, [showOwnership, ownership, signMap, boardSize, candidateMoves])

  const policyMarksList = useMemo(() => {
    if (!showPolicy || policy === null) return null
    const candidateKeys = new Set(
      (candidateMoves ?? []).map((m) => `${m.vertex[0]}-${m.vertex[1]}`),
    )
    return policyMarks(policy, signMap, boardSize).filter(
      (m) => !candidateKeys.has(`${m.vertex[0]}-${m.vertex[1]}`),
    )
  }, [showPolicy, policy, signMap, boardSize, candidateMoves])

  const policyRange = useMemo(() => {
    if (policyMarksList === null || policyMarksList.length === 0) return null
    let min = policyMarksList[0]!.probability
    let max = min
    for (const mark of policyMarksList) {
      min = Math.min(min, mark.probability)
      max = Math.max(max, mark.probability)
    }
    return { min, max }
  }, [policyMarksList])

  // Keep the last-move/scoring markers in Goban. Candidate details are drawn
  // in the SVG overlay below so two numeric values fit on each move.
  const combinedMarkerMap = useMemo<BoardMap<Marker | null> | undefined>(() => {
    if (markerMap === undefined) return undefined

    const map: BoardMap<Marker | null> = signMap.map((row) =>
      row.map(() => null),
    )
    if (markerMap !== undefined) {
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y]!.length; x++) {
          const m = markerMap[y]?.[x]
          if (m !== undefined && m !== null) {
            map[y]![x] = m
          }
        }
      }
    }
    return map
  }, [markerMap, signMap])

  const heatMap = useMemo<BoardMap<HeatVertex> | undefined>(() => {
    if (candidateMoves === undefined || candidateMoves.length === 0) {
      return undefined
    }
    const map: BoardMap<HeatVertex> = signMap.map((row) =>
      row.map(() => null),
    )
    const strengths = [9, 6, 3]
    candidateMoves.forEach((candidate, i) => {
      if (i >= strengths.length) return
      const [cx, cy] = candidate.vertex
      const row = map[cy]
      if (row !== undefined && cx >= 0 && cx < row.length) {
        row[cx] = { strength: strengths[i]! }
      }
    })
    return map
  }, [candidateMoves, signMap])

  const containerStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    border: flashError ? '3px solid red' : '3px solid transparent',
    transition: 'border-color 50ms ease',
  }

  return (
    <div ref={containerRef} style={containerStyle} className="board-container">
      <div
        ref={wrapRef}
        className="board-goban-wrap"
        style={{ position: 'relative', width: chromeWidth, height: chromeHeight }}
      >
        <Goban
          className={`shudan-theme-${boardTheme}`}
          vertexSize={vertexSize}
          signMap={signMap}
          showCoordinates={showCoordinates}
          currentPlayer={currentPlayer}
          {...(dimmedVertices !== undefined ? { dimmedVertices } : {})}
          {...(onVertexClick !== undefined ? { onVertexClick } : {})}
          {...(ghostMarker !== null ? { ghostMarker } : {})}
          {...(combinedMarkerMap !== undefined ? { markerMap: combinedMarkerMap } : {})}
          {...(heatMap !== undefined ? { heatMap } : {})}
        />
        {(ownershipMarksList !== null || policyMarksList !== null || candidateMoves !== undefined) && contentRect !== null && (
          <svg
            className="ownership-overlay"
            viewBox={`0 0 ${boardSize} ${boardSize}`}
            style={{
              position: 'absolute',
              top: contentRect.top,
              left: contentRect.left,
              width: contentRect.size,
              height: contentRect.size,
              pointerEvents: 'none',
            }}
          >
            {policyMarksList?.map((m) => {
              const range = policyRange!
              const normalized =
                range.max === range.min
                  ? 1
                  : (m.probability - range.min) / (range.max - range.min)
              // Red marks are low, yellow is the midpoint, and green is high.
              // HSL hue interpolation keeps the whole range continuous.
              const hue = normalized * 120
              return (
                <g key={`policy-${m.vertex[0]}-${m.vertex[1]}`}>
                  <circle
                    cx={m.cx}
                    cy={m.cy}
                    r="0.38"
                    className="policy-probability-circle"
                    style={{ fill: `hsl(${hue} 82% 48%)` }}
                  />
                  <text
                    x={m.cx}
                    y={m.cy}
                    className="policy-probability"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {(m.probability * 100).toFixed(1)}
                  </text>
                </g>
              )
            })}
            {candidateMoves?.map((candidate, index) => {
              const [x, y] = candidate.vertex
              const cx = x + 0.5
              const cy = y + 0.5
              const scoreLead = `${candidate.scoreLead >= 0 ? '+' : ''}${candidate.scoreLead.toFixed(1)}`
              return (
                <g key={`candidate-${x}-${y}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r="0.43"
                    className={`candidate-info-circle${index === 0 ? ' candidate-info-circle-primary' : ''}`}
                  />
                  <text
                    x={cx}
                    y={cy - 0.11}
                    className="candidate-info"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {scoreLead}
                  </text>
                  <text
                    x={cx}
                    y={cy + 0.15}
                    className="candidate-info"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {candidate.visits}
                  </text>
                </g>
              )
            })}
            {ownershipMarksList?.map((m) => {
              const half = m.size / 2
              return (
                <g
                  key={`${m.cx}-${m.cy}`}
                  className={`ownership-mark ownership-mark_${m.sign === 1 ? 'black' : 'white'}`}
                >
                  <rect
                    x={m.cx - half}
                    y={m.cy - half}
                    width={m.size}
                    height={m.size}
                    className="ownership-mark-square"
                  />
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
