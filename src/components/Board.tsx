/*
 * Board - Preact wrapper around @sabaki/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 * Flashes a red border for 200ms when an illegal move is attempted.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Goban, type Map, type Marker, type Vertex } from '@sabaki/shudan'

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

  const vertexSize =
    containerWidth > 0
      ? Math.floor(containerWidth / boardSize)
      : 24

  const ghostStoneMap = useMemo<Map<{ sign: 1 | -1; faint: true } | null>>(
    () => {
      if (hoveredVertex === null) return undefined as never
      const [hx, hy] = hoveredVertex
      if (signMap[hy]?.[hx] !== 0) return undefined as never
      return signMap.map((row, y) =>
        row.map((_, x) =>
          x === hx && y === hy ? { sign: currentPlayer, faint: true } : null,
        ),
      )
    },
    [hoveredVertex, signMap, currentPlayer],
  )

  const handleMouseEnter = (_evt: MouseEvent, vertex: Vertex) => {
    setHoveredVertex(vertex)
  }

  const handleMouseLeave = () => {
    setHoveredVertex(null)
  }

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
        {...(markerMap !== undefined ? { markerMap } : {})}
      />
    </div>
  )
}
