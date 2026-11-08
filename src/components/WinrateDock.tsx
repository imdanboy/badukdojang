/*
 * WinrateDock — bottom, full-content-width dock for the winrate graph and
 * the full-tree batch analysis (전체 분석) that feeds it.
 *
 * Hidden by default; toggled from the ReviewPanel's `승률 그래프` button
 * (one-screen layout, like the game-tree dock below it). Before a run has
 * been started it shows an EMPTY graph state — no chart points are drawn
 * from nothing; as soon as the full-tree run starts (and while/after it
 * runs, incl. cancel/complete/error), the WinrateGraph plots the cached
 * results of the selected line and updates live as they land.
 *
 * The dock is vertically resizable via the same pointer/keyboard separator
 * pattern as .tree-resizer; the height lives in App (sandwiched with the
 * tree dock so both visible docks always fit one screen).
 */
import type { GameState } from '../lib/gameState.ts'
import type { WinratePoint } from '../lib/treeLayout.ts'
import type { TreeAnalysisState } from '../hooks/useTreeAnalysis.ts'
import { getMoveList } from '../lib/gameTree.ts'
import { getSelectedLineMoveCount } from '../lib/treeLayout.ts'
import { WinrateGraph } from './WinrateGraph.tsx'

export interface WinrateDockProps {
  gameState: GameState
  engineEnabled: boolean
  treeAnalysis: TreeAnalysisState & {
    readonly start: () => void
    readonly cancel: () => void
  }
  winratePoints: readonly WinratePoint[]
  onGraphNodeClick: (nodeId: string) => void
  dockHeight: number
  dragging: boolean
  minHeight: number
  maxHeight: number
  onResizerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizerPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizerPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizerPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizerKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '14px',
  color: '#e0e0e0',
}

const smallBtnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '12px',
  opacity: disabled ? 0.5 : 1,
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

const cancelBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  background: '#b55a5a',
  color: '#fff',
}

function statusText(state: TreeAnalysisState): string | null {
  switch (state.status) {
    case 'complete':
      return state.total === 0
        ? '분석할 착수가 없습니다.'
        : `전체 분석 완료 — ${state.total}국면`
    case 'cancelled':
      return `취소됨 — ${state.completed}/${state.total} 완료 (재실행 시 이어서)`
    case 'error':
      return `분석 오류: ${state.error ?? '알 수 없는 오류'}`
    default:
      return null
  }
}

/** No chart points until the user starts a full analysis from this dock. */
const EMPTY_POINTS: readonly WinratePoint[] = []

export function WinrateDock({
  gameState,
  engineEnabled,
  treeAnalysis,
  winratePoints,
  onGraphNodeClick,
  dockHeight,
  dragging,
  minHeight,
  maxHeight,
  onResizerPointerDown,
  onResizerPointerMove,
  onResizerPointerUp,
  onResizerPointerCancel,
  onResizerKeyDown,
}: WinrateDockProps) {
  const isRunning = treeAnalysis.status === 'running'
  const analysisStarted = treeAnalysis.status !== 'idle'
  const completed = treeAnalysis.completed
  const total = treeAnalysis.total
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const status = statusText(treeAnalysis)
  const currentMoveNumber = getMoveList(gameState.gameTree).length
  const lineMoveCount = getSelectedLineMoveCount(gameState.gameTree)
  const currentNodeId = String(
    gameState.gameTree.currentId ?? gameState.gameTree.root.id,
  )

  return (
    <section
      className="graph-dock"
      data-testid="winrate-dock"
      aria-label="승률 그래프"
      style={{ height: `${dockHeight}px` }}
    >
      <div
        className="graph-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="승률 그래프 높이 조절"
        aria-valuemin={minHeight}
        aria-valuemax={maxHeight}
        aria-valuenow={dockHeight}
        tabIndex={0}
        data-dragging={dragging ? 'true' : undefined}
        onPointerDown={onResizerPointerDown}
        onPointerMove={onResizerPointerMove}
        onPointerUp={onResizerPointerUp}
        onPointerCancel={onResizerPointerCancel}
        onKeyDown={onResizerKeyDown}
      />
      <div className="graph-dock-body">
        <div className="graph-dock-graph">
          <WinrateGraph
            points={analysisStarted ? winratePoints : EMPTY_POINTS}
            currentNodeId={currentNodeId}
            onPointClick={onGraphNodeClick}
          />
        </div>

        <aside className="graph-dock-sidebar" aria-label="승률 그래프 정보 및 분석">
          <span className="graph-dock-title" style={titleStyle}>
            승률 그래프
          </span>
          <div
            className="graph-dock-move-position"
            data-testid="winrate-move-position"
            aria-label={`현재 ${currentMoveNumber}수, 전체 ${lineMoveCount}수`}
            aria-live="polite"
          >
            <span>현재 착수</span>
            <strong>
              {currentMoveNumber}
              <small> / {lineMoveCount}수</small>
            </strong>
          </div>

          {isRunning ? (
            <button
              id="tree-analysis-cancel"
              className="graph-dock-analysis-button"
              style={cancelBtnStyle}
              onClick={treeAnalysis.cancel}
              title="전체 분석 취소"
            >
              취소
            </button>
          ) : (
            <button
              id="tree-analysis-start"
              className="graph-dock-analysis-button"
              style={smallBtnStyle(false, !engineEnabled)}
              disabled={!engineEnabled}
              onClick={treeAnalysis.start}
              title={
                engineEnabled
                  ? '기보 트리의 모든 착수 국면을 분석합니다'
                  : '엔진이 꺼져 있습니다'
              }
            >
              전체 분석
            </button>
          )}

          {isRunning && (
            <div
              id="tree-analysis-progress"
              className="graph-dock-progress"
              aria-live="polite"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>분석 중…</span>
                <span>
                  {completed}/{total}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  background: '#3b3b5c',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: '#5a7fb5',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {!isRunning && status !== null && (
            <div
              id="tree-analysis-status"
              className="graph-dock-status"
              role="status"
              style={{
                opacity: status.startsWith('분석 오류') ? 1 : 0.75,
                color: status.startsWith('분석 오류') ? '#e06666' : undefined,
              }}
            >
              {status}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
