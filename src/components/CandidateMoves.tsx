/*
 * CandidateMoves - Sidebar panel showing top-3 engine candidate moves.
 * Each row: letter badge (A/B/C), vertex, winrate%, scoreLead, PV preview.
 * Clicking a row plays that move (study/hint mode). Disabled during AI turn.
 *
 * Design system: matches ControlBar/EngineSettings dark panel
 * (#1a1a2e bg, #5a7fb5 accent, #e0e0e0 text, 8px radius, 600px max-width).
 */
import type { Vertex } from '@sabaki/shudan'

export interface CandidateMove {
  /** Vertex [x, y] or 'pass'. 'resign' is filtered out upstream. */
  readonly vertex: Vertex | 'pass'
  /** Winrate fraction 0-1 from current player's perspective. */
  readonly winrate: number
  /** Score lead in points (positive = current player ahead). */
  readonly scoreLead: number
  /** Principal variation move list (GTP vertex strings, e.g. "D5"). */
  readonly pv: readonly string[]
}

export interface CandidateMovesProps {
  candidates: readonly CandidateMove[]
  onSelectMove: (vertex: Vertex | 'pass') => void
  /** When true, rows are non-interactive (AI thinking, not self-play, etc.). */
  disabled: boolean
}

const LETTERS = ['A', 'B', 'C'] as const
const PV_PREVIEW_LENGTH = 5

function formatVertex(vertex: Vertex | 'pass'): string {
  if (vertex === 'pass') return 'pass'
  const [x, y] = vertex
  const col = String.fromCharCode('A'.charCodeAt(0) + x)
  return `${col}${y + 1}`
}

function formatWinrate(winrate: number): string {
  const pct = winrate * 100
  return `${pct.toFixed(1)}%`
}

function formatScoreLead(scoreLead: number): string {
  const sign = scoreLead >= 0 ? '+' : ''
  return `${sign}${scoreLead.toFixed(1)}`
}

function formatPvPreview(pv: readonly string[]): string {
  return pv.slice(0, PV_PREVIEW_LENGTH).join(' ')
}

const panelStyle: preact.JSX.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '14px',
  width: '100%',
  maxWidth: '600px',
}

const headerStyle: preact.JSX.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '15px',
}

const rowStyle = (disabled: boolean): preact.JSX.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  borderRadius: '4px',
  background: '#2a2a4e',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'background 0.15s ease',
})

const letterBadgeStyle: preact.JSX.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: '#5a7fb5',
  color: '#e0e0e0',
  fontSize: '14px',
  fontWeight: 'bold',
  flexShrink: 0,
}

const vertexStyle: preact.JSX.CSSProperties = {
  fontWeight: 'bold',
  minWidth: '40px',
}

const statStyle: preact.JSX.CSSProperties = {
  minWidth: '56px',
  fontVariantNumeric: 'tabular-nums',
}

const pvStyle: preact.JSX.CSSProperties = {
  flex: 1,
  opacity: 0.7,
  fontSize: '12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export function CandidateMoves({
  candidates,
  onSelectMove,
  disabled,
}: CandidateMovesProps) {
  if (candidates.length === 0) return null

  return (
    <div style={panelStyle} id="candidate-moves-panel">
      <div style={headerStyle}>후보 수 (Candidate Moves)</div>
      {candidates.map((candidate, index) => {
        const letter = LETTERS[index] ?? '?'
        const handleSelect = () => {
          if (disabled) return
          onSelectMove(candidate.vertex)
        }
        return (
          <div
            key={`${letter}-${formatVertex(candidate.vertex)}`}
            className="candidate-move-row"
            data-letter={letter}
            data-vertex={formatVertex(candidate.vertex)}
            style={rowStyle(disabled)}
            onClick={handleSelect}
            role="button"
            tabIndex={disabled ? -1 : 0}
          >
            <span style={letterBadgeStyle}>{letter}</span>
            <span style={vertexStyle}>{formatVertex(candidate.vertex)}</span>
            <span style={statStyle}>
              {formatWinrate(candidate.winrate)}
            </span>
            <span style={statStyle}>
              {formatScoreLead(candidate.scoreLead)}
            </span>
            <span style={pvStyle} title={candidate.pv.join(' ')}>
              {formatPvPreview(candidate.pv) || '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}