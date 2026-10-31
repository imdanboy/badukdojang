/*
 * TopBar — slim header: app title, game-mode toggle (left-center),
 * quick toggles (sound / zen / settings) on the right.
 * Non-core settings live behind the gear → SettingsModal (OGS pattern:
 * the game screen exposes only instant toggles).
 */
import type { GameMode } from '../lib/types.ts'

export interface TopBarProps {
  gameMode: GameMode
  onGameModeChange: (mode: GameMode) => void
  engineEnabled: boolean
  showWinrate: boolean
  onToggleWinrate: () => void
  showCandidates: boolean
  onToggleCandidates: () => void
  showPolicy: boolean
  onTogglePolicy: () => void
  showOwnership: boolean
  onToggleOwnership: () => void
  showSummary: boolean
  onToggleSummary: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  onToggleZen: () => void
  onOpenSettings: () => void
}

const modeBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

const iconBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '15px',
  lineHeight: 1,
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

const analysisBtnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '6px 9px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
  opacity: disabled ? 0.55 : 1,
})

type AnalysisIconName = 'winrate' | 'candidates' | 'policy' | 'ownership' | 'summary'

function AnalysisIcon({ name }: { name: AnalysisIconName }) {
  return (
    <svg
      className="analysis-toggle-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'winrate' && (
        <>
          <path d="M3 20h18" />
          <path d="M6 17v-5m6 5V8m6 9V4" />
        </>
      )}
      {name === 'candidates' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 1v3m0 16v3M1 12h3m16 0h3" />
        </>
      )}
      {name === 'policy' && (
        <>
          <path d="m5 6 6 5m2 2 6 5M5 18l6-5m2-2 6-5" />
          <circle cx="4" cy="5" r="2" />
          <circle cx="20" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="4" cy="19" r="2" />
          <circle cx="20" cy="19" r="2" />
        </>
      )}
      {name === 'ownership' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M9 3v18m6-18v18M3 9h18m-18 6h18" />
        </>
      )}
      {name === 'summary' && (
        <>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" />
          <circle cx="4.5" cy="12" r="1" />
          <circle cx="4.5" cy="18" r="1" />
        </>
      )}
    </svg>
  )
}

function AnalysisToggleContent({
  icon,
  label,
}: {
  icon: AnalysisIconName
  label: string
}) {
  return (
    <span className="analysis-toggle-content">
      <AnalysisIcon name={icon} />
      <span>{label}</span>
    </span>
  )
}

export function TopBar({
  gameMode,
  onGameModeChange,
  engineEnabled,
  showWinrate,
  onToggleWinrate,
  showCandidates,
  onToggleCandidates,
  showPolicy,
  onTogglePolicy,
  showOwnership,
  onToggleOwnership,
  showSummary,
  onToggleSummary,
  soundEnabled,
  onToggleSound,
  onToggleZen,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <img className="top-bar-logo" src="/favicon.svg" alt="" aria-hidden="true" />
        <span className="top-bar-title">바둑도장</span>
      </div>

      <nav
        className="top-bar-mode"
        role="group"
        aria-label="게임 모드"
      >
        <button
          id="mode-selfplay"
          style={modeBtnStyle(gameMode === 'selfplay')}
          onClick={() => onGameModeChange('selfplay')}
        >
          놓아보기
        </button>
        <button
          id="mode-ai"
          style={modeBtnStyle(gameMode === 'ai')}
          onClick={() => onGameModeChange('ai')}
        >
          AI 대국
        </button>
      </nav>

      <nav className="top-bar-analysis" role="group" aria-label="분석 표시">
        <button
          id="winrate-toggle"
          style={analysisBtnStyle(showWinrate, !engineEnabled)}
          onClick={onToggleWinrate}
          disabled={!engineEnabled}
          title={engineEnabled ? (showWinrate ? '승률 표시 끔' : '승률 표시 켬') : '엔진이 꺼져 있습니다'}
          aria-pressed={showWinrate}
        >
          <AnalysisToggleContent icon="winrate" label="승률" />
        </button>
        {gameMode === 'selfplay' && (
          <button
            id="candidates-toggle"
            style={analysisBtnStyle(showCandidates, !engineEnabled)}
            onClick={onToggleCandidates}
            disabled={!engineEnabled}
            title={engineEnabled ? (showCandidates ? '후보 수 표시 끔' : '후보 수 표시 켬') : '엔진이 꺼져 있습니다'}
            aria-pressed={showCandidates}
          >
            <AnalysisToggleContent icon="candidates" label="후보수" />
          </button>
        )}
        <button
          id="policy-toggle"
          style={analysisBtnStyle(showPolicy, !engineEnabled)}
          onClick={onTogglePolicy}
          disabled={!engineEnabled}
          title={engineEnabled ? (showPolicy ? '정책망 표시 끔' : '정책망 표시 켬') : '엔진이 꺼져 있습니다'}
          aria-pressed={showPolicy}
        >
          <AnalysisToggleContent icon="policy" label="정책망" />
        </button>
        <button
          id="ownership-toggle"
          style={analysisBtnStyle(showOwnership, !engineEnabled)}
          onClick={onToggleOwnership}
          disabled={!engineEnabled}
          title={engineEnabled ? (showOwnership ? '형세 표시 끔' : '형세 표시 켬') : '엔진이 꺼져 있습니다'}
          aria-pressed={showOwnership}
        >
          <AnalysisToggleContent icon="ownership" label="형세" />
        </button>
        <button
          id="analysis-summary-toggle"
          style={analysisBtnStyle(showSummary, false)}
          onClick={onToggleSummary}
          title={showSummary ? '분석 요약 표시 끔' : '분석 요약 표시 켬'}
          aria-pressed={showSummary}
        >
          <AnalysisToggleContent icon="summary" label="분석 요약" />
        </button>
      </nav>

      <div className="top-bar-actions">
        <button
          id="sound-toggle"
          style={iconBtnStyle(soundEnabled)}
          onClick={onToggleSound}
          title={soundEnabled ? 'Sound On' : 'Sound Off'}
          aria-label={soundEnabled ? '사운드 켜기' : '사운드 끄기'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        <button
          id="zen-toggle"
          style={iconBtnStyle(false)}
          onClick={onToggleZen}
          title="집중 모드"
          aria-label="집중 모드"
        >
          ⛶
        </button>
        <button
          id="settings-button"
          style={iconBtnStyle(false)}
          onClick={onOpenSettings}
          title="설정"
          aria-label="설정"
        >
          ⚙
        </button>
      </div>
    </header>
  )
}
