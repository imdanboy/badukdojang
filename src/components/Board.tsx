/*
 * Board - React wrapper around @kaya/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 * Flashes a red border for 200ms when an illegal move is attempted.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Goban } from '@kaya/shudan'
import type { BoardMap, HeatVertex, Marker, SignMap, Vertex } from '@kaya/shudan'
import { ownershipToGrid } from '../lib/ownership.ts'

export type ThemeName =
  | 'hikaru'
  | 'shell-slate'
  | 'yunzi'
  | 'happy-stones'
  | 'kifu'
  | 'baduktv'

export interface BoardProps {
  signMap: SignMap
  boardSize: number
  markerMap?: BoardMap<Marker | null> | undefined
  onVertexClick?: ((evt: React.MouseEvent, vertex: Vertex) => void) | undefined
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
  /** Vertices to dim (e.g., dead stones in scoring mode). */
  dimmedVertices?: Vertex[] | undefined
}

export function Board({
  signMap,
  boardSize,
  markerMap,
  onVertexClick,
  flashTrigger = 0,
  showCoordinates = true,
  themeName = 'hikaru',
  currentPlayer,
  aiGhostVertex = null,
  aiFlashVertex = null,
  ownership = null,
  showOwnership = false,
  candidateMoves = undefined,
  dimmedVertices = undefined,
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
    const timer = setTimeout(() => {
      // AI flash effect is handled by transient marker state in parent
    }, 500)
    return () => clearTimeout(timer)
  }, [aiFlashVertex])

  const vertexSize =
    containerWidth > 0
      ? Math.floor(containerWidth / boardSize)
      : 24

  const ghostMarker = useMemo<Marker | null>(() => {
    if (aiGhostVertex !== null) {
      return { type: 'circle' }
    }
    if (hoveredVertex === null) return null
    return { type: 'circle' }
  }, [aiGhostVertex, hoveredVertex])

  const ownershipMap = useMemo<number[][] | undefined>(() => {
    if (!showOwnership || ownership === null) return undefined
    return ownershipToGrid(ownership, boardSize)
  }, [showOwnership, ownership, boardSize])

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

  const handleMouseMove = (_evt: React.MouseEvent, vertex: Vertex) => {
    setHoveredVertex(vertex)
  }

  const containerStyle: CSSProperties = {
    width: '100%',
    maxWidth: '600px',
    display: 'flex',
    justifyContent: 'center',
    border: flashError ? '3px solid red' : '3px solid transparent',
    transition: 'border-color 50ms ease',
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <Goban
        className={`shudan-theme-${themeName}`}
        vertexSize={vertexSize}
        signMap={signMap}
        showCoordinates={showCoordinates}
        currentPlayer={currentPlayer}
        onVertexMouseMove={handleMouseMove}
        {...(dimmedVertices !== undefined ? { dimmedVertices } : {})}
        {...(onVertexClick !== undefined ? { onVertexClick } : {})}
        {...(ghostMarker !== null ? { ghostMarker } : {})}
        {...(combinedMarkerMap !== undefined ? { markerMap: combinedMarkerMap } : {})}
        {...(ownershipMap !== undefined ? { ownershipMap } : {})}
        {...(heatMap !== undefined ? { heatMap } : {})}
      />
    </div>
  )
}
