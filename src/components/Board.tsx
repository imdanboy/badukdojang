/*
 * Board - Preact wrapper around @sabaki/shudan's <Goban>.
 * Measures container width via ResizeObserver and computes vertexSize
 * as a fixed pixel number (Shudan requires numeric vertexSize, not CSS).
 * Flashes a red border for 200ms when an illegal move is attempted.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { Goban, type Map, type Marker, type Vertex } from '@sabaki/shudan'

export interface BoardProps {
  signMap: Map<0 | 1 | -1>
  boardSize: number
  markerMap?: Map<Marker | null> | undefined
  onVertexClick?: ((evt: MouseEvent, vertex: Vertex) => void) | undefined
  flashTrigger?: number
}

export function Board({
  signMap,
  boardSize,
  markerMap,
  onVertexClick,
  flashTrigger = 0,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
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

  useEffect(() => {
    if (flashTrigger === 0) return
    setFlashError(true)
    const timer = setTimeout(() => setFlashError(false), 200)
    return () => clearTimeout(timer)
  }, [flashTrigger])

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
        border: flashError ? '3px solid red' : '3px solid transparent',
        transition: 'border-color 50ms ease',
      }}
    >
      <Goban
        vertexSize={vertexSize}
        signMap={signMap}
        showCoordinates={true}
        fuzzyStonePlacement={true}
        animateStonePlacement={true}
        {...(onVertexClick !== undefined ? { onVertexClick } : {})}
        {...(markerMap !== undefined ? { markerMap } : {})}
      />
    </div>
  )
}
