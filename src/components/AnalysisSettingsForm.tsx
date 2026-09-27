import type { AnalysisSettings } from '../lib/engineSettings.ts'
import {
  MAX_ANALYSIS_THREADS,
  MAX_ANALYSIS_TIME,
  MAX_MAX_VISITS,
  MIN_ANALYSIS_THREADS,
  MIN_ANALYSIS_TIME,
  MIN_MAX_VISITS,
  normalizeAnalysisSettings,
} from '../lib/engineSettings.ts'

interface AnalysisSettingsFormProps {
  settings: AnalysisSettings
  onChange: (settings: AnalysisSettings) => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
}

const inputStyle: React.CSSProperties = {
  width: '96px',
  padding: '6px 8px',
  border: '1px solid #3b3b5c',
  borderRadius: '4px',
  background: '#2a2a4e',
  color: '#e0e0e0',
  fontSize: '14px',
}

export function AnalysisSettingsForm({ settings, onChange }: AnalysisSettingsFormProps) {
  const update = (patch: Partial<AnalysisSettings>) => {
    onChange(normalizeAnalysisSettings({ ...settings, ...patch }))
  }

  return (
    <div
      id="analysis-settings-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <div style={{ opacity: 0.7, fontSize: '13px' }}>
        분석 표시가 켜져 있으면 다음 분석 요청부터 변경값이 적용됩니다.
      </div>
      <label style={rowStyle}>
        <span>최대 방문 수</span>
        <input
          id="analysis-max-visits"
          type="number"
          min={MIN_MAX_VISITS}
          max={MAX_MAX_VISITS}
          step={1}
          value={settings.maxVisits}
          onChange={(e) => update({ maxVisits: Number(e.currentTarget.value) })}
          style={inputStyle}
        />
      </label>
      <label style={rowStyle}>
        <span>최대 분석 시간 (초)</span>
        <input
          id="analysis-max-time"
          type="number"
          min={MIN_ANALYSIS_TIME}
          max={MAX_ANALYSIS_TIME}
          step={0.5}
          value={settings.maxTime}
          onChange={(e) => update({ maxTime: Number(e.currentTarget.value) })}
          style={inputStyle}
        />
      </label>
      <label style={rowStyle}>
        <span>병렬 탐색 스레드</span>
        <input
          id="analysis-search-threads"
          type="number"
          min={MIN_ANALYSIS_THREADS}
          max={MAX_ANALYSIS_THREADS}
          step={1}
          value={settings.numSearchThreads}
          onChange={(e) => update({ numSearchThreads: Number(e.currentTarget.value) })}
          style={inputStyle}
        />
      </label>
    </div>
  )
}
