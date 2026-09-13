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

export function TopBar({
  gameMode,
  onGameModeChange,
  soundEnabled,
  onToggleSound,
  onToggleZen,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="top-bar-stone" aria-hidden="true" />
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
          혼자두기
        </button>
        <button
          id="mode-ai"
          style={modeBtnStyle(gameMode === 'ai')}
          onClick={() => onGameModeChange('ai')}
        >
          AI 대국
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
