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
import { AnalysisSettingsForm } from './AnalysisSettingsForm.tsx'
import type { AnalysisSettings, EngineSettings } from '../lib/engineSettings.ts'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  engineSettings: EngineSettings
  onEngineSettingsChange: (settings: EngineSettings) => void
  analysisSettings: AnalysisSettings
  onAnalysisSettingsChange: (settings: AnalysisSettings) => void
  humanModelAvailable?: boolean | null
  /** Re-initializes the engine after a main model switch (bridge respawns processes). */
  onModelChanged?: (() => void | Promise<void>) | undefined
  /** Notifies the app after an analysis-model switch (model identity refresh). */
  onAnalysisModelChanged?: (() => void | Promise<void>) | undefined
  showCoordinates: boolean
  onToggleCoordinates: () => void
}

type Tab = 'engine' | 'analysis' | 'board'

const THEME_DESCRIPTIONS: Record<BuiltInThemeId, string> = {
  hikaru:
    '금빛 그라데이션과 나뭇결이 표현된 판에, 음영과 반사광이 강조된 만화풍 돌을 놓은 테마예요. 돌의 실제 재질은 따로 명시돼 있지 않습니다.',
  'shell-slate':
    '비자나무판 위에 검은 슬레이트돌과 흰 조개돌을 놓은 전통적인 조합이에요. 흑돌은 차분하고 어두우며, 백돌에는 조개층을 연상시키는 은은한 광택과 줄무늬가 보입니다.',
  yunzi:
    '따뜻한 색의 비자나무판과 중국 운자석 스타일의 돌을 조합했어요. 흑백돌 모두 표면에 잔잔한 입자감이 있고, 둥글고 도톰한 입체감이 강조됩니다.',
  'happy-stones':
    '밝고 선명한 주황빛 나뭇결 판에 유리처럼 반짝이는 돌을 놓은 테마예요. 흑돌은 어두운 유리 같은 광택, 백돌은 밝은 반사광이 도드라집니다.',
  kifu: '나무판 대신 흰 바탕에 검은 격자선을 사용해 기보 인쇄물처럼 표현했어요. 흑백돌도 그림자나 질감 없이 평면적으로 그려져 수순과 도형을 깔끔하게 보기 좋습니다.',
  baduktv:
    '부드러운 황갈색 나뭇결 판에 매끈하고 유리알 같은 흑백돌을 놓은 한국 바둑 방송풍 테마예요. 돌 모양에도 작은 변화를 줘 실제 대국판처럼 덜 균일하게 보입니다.',
}

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
  const selectedTheme = availableThemes.find((theme) => theme.id === boardTheme)

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
      {selectedTheme && (
        <section
          aria-live="polite"
          aria-label={`${selectedTheme.name} 테마 소개`}
          style={{
            padding: '12px 14px',
            border: '1px solid #3b3b5c',
            borderRadius: '8px',
            background: '#22223d',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            {selectedTheme.name}
          </strong>
          <p style={{ margin: 0, color: '#c4c4d2', fontSize: '14px', lineHeight: 1.6 }}>
            {THEME_DESCRIPTIONS[selectedTheme.id as BuiltInThemeId]}
          </p>
        </section>
      )}
    </div>
  )
}

export function SettingsModal({
  open,
  onClose,
  engineSettings,
  onEngineSettingsChange,
  analysisSettings,
  onAnalysisSettingsChange,
  humanModelAvailable,
  onModelChanged,
  onAnalysisModelChanged,
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
          id="settings-tab-analysis"
          role="tab"
          aria-selected={tab === 'analysis'}
          style={tabStyle(tab === 'analysis')}
          onClick={() => setTab('analysis')}
        >
          분석
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
          onModelChanged={onModelChanged}
        />
      ) : tab === 'analysis' ? (
        <AnalysisSettingsForm
          settings={analysisSettings}
          onChange={onAnalysisSettingsChange}
          onModelChanged={onAnalysisModelChanged}
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
