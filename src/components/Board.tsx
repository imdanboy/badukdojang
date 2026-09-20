/*
 * Board - React wrapper around @kaya/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 * Flashes a red border for 200ms when an illegal move is attempted.
 * The board theme is read from BoardThemeProvider context — the single
 * source of truth (no duplicated theme state in App).
 * Ownership overlay: OGS-style nested-square marks sized by confidence,
 * rendered as an SVG layer aligned to the Goban's measured content area.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Goban } from '@kaya/shudan'
import type { BoardMap, HeatVertex, Marker, SignMap, Vertex } from '@kaya/shudan'
import { useBoardTheme } from '@kaya/themes'
import { ownershipMarks } from '../lib/ownership.ts'

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
  /** Top-N candidate move vertices to render as letter markers (A, B, C...). */
  candidateMoves?: Vertex[] | undefined
  /** Vertices to dim (e.g., dead stones in scoring mode). */
  dimmedVertices?: Vertex[] | undefined
}

/** Rect of the Goban's board-content area in wrapper coordinates. */
interface ContentRect {
  left: number
  top: number
  size: number
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
  candidateMoves = undefined,
  dimmedVertices = undefined,
}: BoardProps) {
  const { boardTheme } = useBoardTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [contentRect, setContentRect] = useState<ContentRect | null>(null)
  const [flashError, setFlashError] = useState(false)

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

  // Measure the actual board-content area (`.shudan-content` inside the
  // Goban DOM) instead of reconstructing Goban's coordinate padding
  // arithmetic — immune to any future padding changes in Shudan.
  useEffect(() => {
    if (!showOwnership) {
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
  }, [showOwnership, containerWidth, boardSize])

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

  const vertexSize =
    containerWidth > 0
      ? Math.floor(containerWidth / boardSize)
      : 24

  // Ghost preview: no marker passed → Goban renders a faint ghost stone
  // (currentPlayer color, ~0.35 opacity) on the hovered empty vertex,
  // so the user can see whose turn it is before clicking.
  // AI ghost keeps the hollow circle marker.
  const ghostMarker = useMemo<Marker | null>(() => {
    if (aiGhostVertex !== null) {
      return { type: 'circle' }
    }
    return null
  }, [aiGhostVertex])

  // Ownership marks skip candidate-move vertices: the A/B/C letter markers
  // are drawn there, and the nested-square overlay would stack on top and
  // make the letters unreadable.
  const ownershipMarksList = useMemo(() => {
    if (!showOwnership || ownership === null) return null
    const occupiedByCandidates = new Set(
      (candidateMoves ?? []).map((v) => `${v[0]}-${v[1]}`),
    )
    return ownershipMarks(ownership, signMap, boardSize).filter(
      (m) => !occupiedByCandidates.has(`${m.cx - 0.5}-${m.cy - 0.5}`),
    )
  }, [showOwnership, ownership, signMap, boardSize, candidateMoves])

  // Merge the last-move markerMap (circle) with candidate letter markers
  // (A, B, C). Candidates override the last-move circle at overlapping
  // vertices since the letter is more informative for study/hint mode.
  const combinedMarkerMap = useMemo<BoardMap<Marker | null> | undefined>(() => {
    const hasCandidates =
      candidateMoves !== undefined && candidateMoves.length > 0
    if (markerMap === undefined && !hasCandidates) return undefined

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

  const heatMap = useMemo<BoardMap<HeatVertex> | undefined>(() => {
    if (candidateMoves === undefined || candidateMoves.length === 0) {
      return undefined
    }
    const map: BoardMap<HeatVertex> = signMap.map((row) =>
      row.map(() => null),
    )
    const strengths = [9, 6, 3]
    candidateMoves.forEach((v, i) => {
      if (i >= strengths.length) return
      const [cx, cy] = v
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
    border: flashError ? '3px solid red' : '3px solid transparent',
    transition: 'border-color 50ms ease',
  }

  return (
    <div ref={containerRef} style={containerStyle} className="board-container">
      <div ref={wrapRef} className="board-goban-wrap" style={{ position: 'relative' }}>
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
        {ownershipMarksList !== null && contentRect !== null && (
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
            {ownershipMarksList.map((m) => {
              const half = m.size / 2
              const inner = m.size * 0.55
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
                    className="ownership-mark-outer"
                  />
                  <rect
                    x={m.cx - inner / 2}
                    y={m.cy - inner / 2}
                    width={inner}
                    height={inner}
                    className="ownership-mark-inner"
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
