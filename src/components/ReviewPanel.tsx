/*
 * ReviewPanel — "리뷰" section of the right function column:
 *   1. 수 번호 표시 모드 — 놓아보기 전용: "전체 수순"(현재 경로 1부터)과
 *      "번호 표시"(선택 노드 이후 착수만 1로, 이미 놓인 돌은 무번호).
 *      같은 버튼 재클릭 = 끄기. 전체 수순이 켜진 동안 번호 표시는 비활성.
 *   2. 기보 트리 토글 — the game-tree dock at the bottom of the shell is
 *      hidden by default; this button shows/hides it (one-screen layout).
 *   3. 승률 그래프 토글 — the winrate-graph dock at the bottom of the shell
 *      (full-tree analysis + chart) is hidden by default; this button
 *      shows/hides it.
 *
 * The tree visualization and the winrate graph/analysis controls are NOT
 * here — they render in the bottom docks (.tree-dock / .graph-dock in App)
 * so both get the entire app content width. Exactly one of each exists.
 * Visual language matches the other panels (#1a1a2e / #3b3b5c / #5a7fb5).
 */
import type { GameMode, MoveNumberMode } from '../lib/types.ts'

export interface ReviewPanelProps {
  /** 놓아보기(selfplay) 전용 패널: 수 번호 버튼은 AI 모드에서 숨는다. */
  gameMode: GameMode
  /** 수 번호 모드: 'hidden' | 'all' | 'fromCurrent' (놓아보기 전용). */
  moveNumberMode: MoveNumberMode
  /** 현재 좌표 경로에 실제 번호 라벨이 보이는지 (시작점이 경로 밖이면 false). */
  moveNumberLabelsVisible: boolean
  /** 'all' | 'fromCurrent' 요청 — 활성 버튼 재클릭(끄기)도 이 콜백이 처리한다. */
  onMoveNumberModeSelect: (mode: Exclude<MoveNumberMode, 'hidden'>) => void
  /** 기보 트리 독(dock) 표시 여부 — 기본 숨김, 토글 버튼으로만 등장. */
  treeVisible: boolean
  onToggleTree: () => void
  /** 승률 그래프 독(dock) 표시 여부 — 기본 숨김, 토글 버튼으로만 등장. */
  winrateDockVisible: boolean
  onToggleWinrateDock: () => void
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '13px',
  minWidth: 0,
}

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '14px',
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

export function ReviewPanel({
  gameMode,
  moveNumberMode,
  moveNumberLabelsVisible,
  onMoveNumberModeSelect,
  treeVisible,
  onToggleTree,
  winrateDockVisible,
  onToggleWinrateDock,
}: ReviewPanelProps) {
  return (
    <section
      className="review-panel"
      style={panelStyle}
      aria-label="리뷰"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span style={titleStyle}>리뷰</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <button
            id="tree-toggle"
            style={smallBtnStyle(treeVisible, false)}
            aria-pressed={treeVisible}
            title="기보 트리를 화면 아래에 열거나 닫습니다"
            onClick={onToggleTree}
          >
            기보 트리
          </button>
          <button
            id="winrate-dock-toggle"
            style={smallBtnStyle(winrateDockVisible, false)}
            aria-pressed={winrateDockVisible}
            title="승률 그래프(전체 분석) 독을 화면 아래에 열거나 닫습니다"
            onClick={onToggleWinrateDock}
          >
            승률 그래프
          </button>
        </div>
      </div>

      {gameMode === 'selfplay' && (
        <div
          role="group"
          aria-label="수 번호 표시"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
            fontSize: '12px',
          }}
        >
          <span style={{ opacity: 0.7 }}>번호</span>
          <button
            id="move-number-all"
            style={smallBtnStyle(moveNumberMode === 'all', false)}
            aria-pressed={moveNumberMode === 'all'}
            title="현재 경로의 모든 착수를 1부터 번호로 표시합니다. 다시 누르면 끕니다."
            onClick={() => onMoveNumberModeSelect('all')}
          >
            전체 수순
          </button>
          <button
            id="move-number-from-current"
            style={smallBtnStyle(
              moveNumberMode === 'fromCurrent',
              moveNumberMode === 'all',
            )}
            aria-pressed={moveNumberMode === 'fromCurrent'}
            disabled={moveNumberMode === 'all'}
            title={
              moveNumberMode === 'all'
                ? '전체 수순이 켜져 있어 사용할 수 없습니다'
                : '지금 선택한 노드 이후의 착수만 1부터 매깁니다 (이미 놓인 돌은 번호 없음). 다시 누르면 끕니다.'
            }
            onClick={() => onMoveNumberModeSelect('fromCurrent')}
          >
            번호 표시
          </button>
          {moveNumberMode === 'fromCurrent' && (
            <span
              id="move-number-anchor-hint"
              style={{ fontSize: '11px', opacity: 0.65 }}
            >
              {moveNumberLabelsVisible
                ? '선택 노드 이후 착수부터 1번'
                : '시작점이 현재 경로 밖 — 이동 후 다시 누르세요'}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
