/*
 * Board - Preact wrapper around @sabaki/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 * Flashes a red border for 200ms when an illegal move is attempted.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Goban, type Map, type Marker, type Vertex, type GhostStone } from '@sabaki/shudan'
import { ownershipCircles } from '../lib/ownership.ts'

export type ThemeName = 'shinkaya' | 'walnut' | 'classic'

export interface BoardProps {
  signMap: Map<0 | 1 | -1>
  boardSize: number
  markerMap?: Map<Marker | null> | undefined
  onVertexClick?: ((evt: MouseEvent, vertex: Vertex) => void) | undefined
  flashTrigger?: number
  showCoordinates?: boolean
  themeName?: ThemeName
  currentPlayer: 1 | -1
  aiGhostVertex?: Vertex | null
  aiFlashVertex?: Vertex | null
  /** KataGo ownership flat array (length boardSize^2, [-1,1]). null/undefined = no data. */
  ownership?: readonly number[] | null
  /** Toggle the ownership heatmap overlay on/off. */
  showOwnership?: boolean
  /** Top-N candidate move vertices to render as letter markers (A, B, C...). */
  candidateMoves?: Vertex[] | undefined
}

export function Board({
  signMap,
  boardSize,
  markerMap,
  onVertexClick,
  flashTrigger = 0,
  showCoordinates = true,
  themeName = 'shinkaya',
  currentPlayer,
  aiGhostVertex = null,
  aiFlashVertex = null,
  ownership = null,
  showOwnership = false,
  candidateMoves = undefined,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [flashError, setFlashError] = useState(false)
  const [hoveredVertex, setHoveredVertex] = useState<Vertex | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el === null) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (flashTrigger === 0) return
    setFlashError(true)
    const timer = setTimeout(() => setFlashError(false), 200)
    return () => clearTimeout(timer)
  }, [flashTrigger])

  useEffect(() => {
    if (aiFlashVertex === null) return undefined
    const [fx, fy] = aiFlashVertex
    const target = containerRef.current?.querySelector(
      `.shudan-vertex[data-x="${fx}"][data-y="${fy}"]`,
    )
    if (!(target instanceof HTMLElement)) return undefined
    target.classList.add('ai-move-flash')
    const timer = setTimeout(() => {
      target.classList.remove('ai-move-flash')
    }, 500)
    return () => {
      clearTimeout(timer)
      target.classList.remove('ai-move-flash')
    }
  }, [aiFlashVertex])

  const vertexSize =
    containerWidth > 0
      ? Math.floor(containerWidth / boardSize)
      : 24

  const ghostStoneMap = useMemo<Map<GhostStone | null>>(
    () => {
      if (aiGhostVertex !== null) {
        const [gx, gy] = aiGhostVertex
        return signMap.map((row, y) =>
          row.map((_, x) =>
            x === gx && y === gy
              ? { sign: currentPlayer, type: 'good', faint: false }
              : null,
          ),
        )
      }

      if (hoveredVertex === null) return undefined as never
      const [hx, hy] = hoveredVertex
      if (signMap[hy]?.[hx] !== 0) return undefined as never
      return signMap.map((row, y) =>
        row.map((_, x) =>
          x === hx && y === hy ? { sign: currentPlayer, faint: true } : null,
        ),
      )
    },
    [hoveredVertex, signMap, currentPlayer, aiGhostVertex],
  )

  const handleMouseEnter = (_evt: MouseEvent, vertex: Vertex) => {
    setHoveredVertex(vertex)
  }

  const handleMouseLeave = () => {
    setHoveredVertex(null)
  }

  const circles = useMemo(
    () =>
      showOwnership && ownership
        ? ownershipCircles(ownership, signMap, boardSize)
        : [],
    [showOwnership, ownership, signMap, boardSize],
  )

  // Merge the last-move markerMap (circle) with candidate letter markers
  // (A, B, C). Candidates override the last-move circle at overlapping
  // vertices since the letter is more informative for study/hint mode.
  const combinedMarkerMap = useMemo<Map<Marker | null> | undefined>(() => {
    const hasCandidates =
      candidateMoves !== undefined && candidateMoves.length > 0
    if (markerMap === undefined && !hasCandidates) return undefined

    const map: Map<Marker | null> = signMap.map((row) => row.map(() => null))
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
    if (hasCandidates) {
      const letters = ['A', 'B', 'C']
      candidateMoves!.forEach((v, i) => {
        if (i >= letters.length) return
        const [cx, cy] = v
        const row = map[cy]
        if (row !== undefined && cx >= 0 && cx < row.length) {
          row[cx] = { type: 'label', label: letters[i]! }
        }
      })
    }
    return map
  }, [markerMap, candidateMoves, signMap])

  const shudanBorderEm = 0.15
  const shudanCoordMarginEm = showCoordinates ? 1 : 0
  const shudanPaddingEm = showCoordinates ? 0 : 0.25
  const contentOffset = (shudanBorderEm + shudanCoordMarginEm + shudanPaddingEm) * vertexSize
  const contentSize = boardSize * vertexSize
  const showOverlay = circles.length > 0

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: '600px',
        display: 'flex',
        justifyContent: 'center',
        border: flashError ? '3px solid red' : '3px solid transparent',
        transition: 'border-color 50ms ease',
      }}
    >
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <Goban
          className={`shudan-theme-${themeName}`}
          vertexSize={vertexSize}
          signMap={signMap}
          showCoordinates={showCoordinates}
          fuzzyStonePlacement={false}
          animateStonePlacement={true}
          ghostStoneMap={ghostStoneMap}
          onVertexMouseEnter={handleMouseEnter}
          onVertexMouseLeave={handleMouseLeave}
          {...(onVertexClick !== undefined ? { onVertexClick } : {})}
          {...(combinedMarkerMap !== undefined ? { markerMap: combinedMarkerMap } : {})}
        />
        {showOverlay && (
          <svg
            className="ownership-overlay"
            viewBox={`0 0 ${boardSize} ${boardSize}`}
            style={{
              position: 'absolute',
              left: `${contentOffset}px`,
              top: `${contentOffset}px`,
              width: `${contentSize}px`,
              height: `${contentSize}px`,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <g>
              {circles.map((c, i) => (
                <circle
                  key={i}
                  cx={c.cx}
                  cy={c.cy}
                  r={0.32}
                  fill={c.fill}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  )
}
