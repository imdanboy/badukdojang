/*
 * Board - Preact wrapper around @sabaki/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { Goban, type Map, type Marker, type Vertex } from '@sabaki/shudan'

export interface BoardProps {
  signMap: Map<0 | 1 | -1>
  boardSize: number
  markerMap?: Map<Marker | null>
  onVertexClick?: (evt: MouseEvent, vertex: Vertex) => void
}

export function Board({
  signMap,
  boardSize,
  markerMap,
  onVertexClick,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

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

  // Shudan needs a fixed pixel number; fall back to a sane default
  // until the first ResizeObserver callback fires.
  const vertexSize =
    containerWidth > 0
      ? Math.floor(containerWidth / boardSize)
      : 24

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: '600px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Goban
        vertexSize={vertexSize}
        signMap={signMap}
        markerMap={markerMap}
        showCoordinates={true}
        fuzzyStonePlacement={true}
        animateStonePlacement={true}
        onVertexClick={onVertexClick}
      />
    </div>
  )
}