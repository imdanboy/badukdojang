/*
 * SettingsModal — non-core settings, separated from the game screen
 * (OGS pattern: game screen exposes only instant toggles).
 * Tabs: 엔진 (engine tuning) / 보드 (theme + coordinates).
 */
import { useState } from 'react'
import { useBoardTheme } from '@kaya/themes'
import type { BuiltInThemeId } from '@kaya/themes'
import { Modal } from './Modal.tsx'
import { EngineSettingsForm } from './EngineSettingsForm.tsx'
import type { EngineSettings } from '../lib/engineSettings.ts'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  engineSettings: EngineSettings
  onEngineSettingsChange: (settings: EngineSettings) => void
  humanModelAvailable?: boolean | null
  showCoordinates: boolean
  onToggleCoordinates: () => void
}

type Tab = 'engine' | 'board'

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  border: 'none',
  borderBottom: active ? '2px solid #5a7fb5' : '2px solid transparent',
  borderRadius: '4px 4px 0 0',
  background: active ? '#2a2a4e' : 'transparent',
  color: active ? '#e0e0e0' : '#a0a0b0',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: active ? 600 : 400,
})

function ThemePicker() {
  const { boardTheme, setBoardTheme, availableThemes } = useBoardTheme()

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      id="theme-picker"
    >
      <span style={{ opacity: 0.7 }}>바둑판 테마</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: '10px',
        }}
      >
        {availableThemes.map((theme) => {
          const active = theme.id === boardTheme
          return (
            <button
              key={theme.id}
              type="button"
              className="theme-card"
              data-theme-id={theme.id}
              aria-pressed={active}
              onClick={() => setBoardTheme(theme.id as BuiltInThemeId)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '8px',
                borderRadius: '8px',
                border: active ? '2px solid #5a7fb5' : '1px solid #3b3b5c',
                background: '#2a2a4e',
                cursor: 'pointer',
                color: '#e0e0e0',
                fontSize: '12px',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'flex',
                  width: '100%',
                  height: '48px',
                  borderRadius: '4px',
                  background: theme.board.backgroundColor,
                  border: `1px solid ${theme.board.borderColor}`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: theme.stones.black.backgroundColor,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}
                />
                <span
                  style={{
                    display: 'inline-block',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: theme.stones.white.backgroundColor,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}
                />
              </span>
              {theme.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsModal({
  open,
  onClose,
  engineSettings,
  onEngineSettingsChange,
  humanModelAvailable,
  showCoordinates,
  onToggleCoordinates,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('engine')

  if (!open) return null

  return (
    <Modal title="설정" onClose={onClose} closeButtonId="settings-close">
      <div
        style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #3b3b5c' }}
        role="tablist"
        aria-label="설정 카테고리"
      >
        <button
          type="button"
          id="settings-tab-engine"
          role="tab"
          aria-selected={tab === 'engine'}
          style={tabStyle(tab === 'engine')}
          onClick={() => setTab('engine')}
        >
          엔진
        </button>
        <button
          type="button"
          id="settings-tab-board"
          role="tab"
          aria-selected={tab === 'board'}
          style={tabStyle(tab === 'board')}
          onClick={() => setTab('board')}
        >
          보드
        </button>
      </div>

      {tab === 'engine' ? (
        <EngineSettingsForm
          settings={engineSettings}
          onChange={onEngineSettingsChange}
          humanModelAvailable={humanModelAvailable}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <ThemePicker />
          <div style={{ width: '100%', height: '1px', background: '#3b3b5c' }} />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              id="coordinates-checkbox"
              checked={showCoordinates}
              onChange={onToggleCoordinates}
              style={{ cursor: 'pointer' }}
            />
            Coordinates
          </label>
        </div>
      )}
    </Modal>
  )
}
