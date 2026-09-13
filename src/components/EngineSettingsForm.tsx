/*
 * EngineSettingsForm — engine tuning controls (tab content for SettingsModal).
 * Controls engine ON/OFF, thinking time, difficulty, temperature, rules,
 * play style, and the advanced KataGo knobs. All state flows through the
 * controlled `settings` prop; persistence happens in useEngine.
 */
import { useState } from 'react'
import {
  applyDifficulty,
  applyPlayStyle,
  clamp,
  formatKyu,
  MAX_DIFFICULTY,
  MAX_DOUBLING,
  MAX_HUMAN_PROP,
  MAX_MAX_VISITS,
  MAX_NOISE,
  MAX_THINKING_TIME,
  MIN_DIFFICULTY,
  MIN_DOUBLING,
  MIN_HUMAN_PROP,
  MIN_MAX_VISITS,
  MIN_NOISE,
  MIN_THINKING_TIME,
  normalizeSettings,
  RULES_LABELS,
} from '../lib/engineSettings.ts'
import type { EngineSettings, HumanSLProfile, Rules } from '../lib/engineSettings.ts'

// Compact list offered in the Advanced dropdown. KataGo supports many more
// (rank_*, preaz_*, proyear_*); all kyu/dan buckets suffice for tuning.
const HUMAN_SL_PROFILE_OPTIONS: readonly HumanSLProfile[] = [
  'rank_20k', 'rank_15k', 'rank_10k', 'rank_5k', 'rank_1k',
  'rank_1d', 'rank_2d', 'rank_3d', 'rank_4d', 'rank_5d', 'rank_6d', 'rank_7d', 'rank_8d', 'rank_9d',
]

export interface EngineSettingsFormProps {
  settings: EngineSettings
  onChange: (settings: EngineSettings) => void
  humanModelAvailable?: boolean | null | undefined
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  opacity: 0.7,
  minWidth: '80px',
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #3b3b5c',
  borderRadius: '4px',
  background: '#2a2a4e',
  color: '#e0e0e0',
  fontSize: '14px',
  cursor: 'pointer',
}

const sliderStyle: React.CSSProperties = {
  cursor: 'pointer',
  accentColor: '#5a7fb5',
  flex: '1',
  minWidth: '120px',
}

const dividerStyle: React.CSSProperties = {
  width: '100%',
  height: '1px',
  background: '#3b3b5c',
  margin: '0',
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

export function EngineSettingsForm({
  settings,
  onChange,
  humanModelAvailable,
}: EngineSettingsFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const update = (patch: Partial<EngineSettings>): void => {
    onChange(normalizeSettings({ ...settings, ...patch }))
  }

  const toggleEnabled = () => update({ enabled: !settings.enabled })

  const handleThinkingTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.currentTarget.value)
    update({ thinkingTime: clamp(value, MIN_THINKING_TIME, MAX_THINKING_TIME) })
  }

  const handleDifficulty = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(applyDifficulty(settings, Number(e.currentTarget.value)))
  }

  const handleRules = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value as Rules
    update({ rules: value })
  }

  const isHumanStyle = settings.playStyle === 'human'
  const difficultyDisabled = !settings.enabled || !isHumanStyle
  const showHumanModelWarning =
    isHumanStyle && humanModelAvailable === false

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      id="engine-settings-panel"
    >
      {/* Engine ON/OFF switch */}
      <div
        style={{ ...sectionStyle, justifyContent: 'space-between' }}
        id="engine-settings-header"
      >
        <span style={{ fontWeight: 'bold', fontSize: '15px' }}>엔진 설정</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ opacity: 0.6, fontSize: '12px' }}>
            {settings.enabled ? '켜짐' : '꺼짐'}
          </span>
          <button
            type="button"
            id="engine-toggle"
            onClick={toggleEnabled}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              border: 'none',
              background: settings.enabled ? '#5a7fb5' : '#3b3b5c',
              cursor: 'pointer',
              position: 'relative',
              padding: '0',
              transition: 'background 0.2s',
            }}
            aria-label={settings.enabled ? '엔진 끄기' : '엔진 켜기'}
            aria-pressed={settings.enabled}
          >
            <span
              style={{
                display: 'inline-block',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#e0e0e0',
                position: 'absolute',
                top: '3px',
                left: settings.enabled ? '23px' : '3px',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Thinking time slider */}
      <div style={sectionStyle}>
        <label htmlFor="engine-thinking-time" style={labelStyle}>
          생각 시간
        </label>
        <input
          id="engine-thinking-time"
          type="range"
          min={MIN_THINKING_TIME}
          max={MAX_THINKING_TIME}
          value={settings.thinkingTime}
          onChange={handleThinkingTime}
          disabled={!settings.enabled}
          style={{
            ...sliderStyle,
            opacity: settings.enabled ? 1 : 0.4,
          }}
        />
        <span id="engine-thinking-time-value" style={{ minWidth: '50px' }}>
          {settings.thinkingTime}초
        </span>
      </div>

      {/* Difficulty slider */}
      <div style={sectionStyle}>
        <label htmlFor="engine-difficulty" style={labelStyle}>
          난이도
        </label>
        <input
          id="engine-difficulty"
          type="range"
          min={MIN_DIFFICULTY}
          max={MAX_DIFFICULTY}
          value={settings.difficulty}
          onChange={handleDifficulty}
          disabled={difficultyDisabled}
          style={{
            ...sliderStyle,
            opacity: difficultyDisabled ? 0.4 : 1,
          }}
        />
        <span
          id="engine-difficulty-value"
          style={{ minWidth: '70px' }}
        >
          {formatKyu(settings.difficulty)} ({settings.humanSLProfile})
        </span>
      </div>

      {/* Temperature slider */}
      <div style={sectionStyle}>
        <label htmlFor="engine-temperature" style={labelStyle}>
          랜덤 온도
        </label>
        <input
          id="engine-temperature"
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={settings.manualTemperature >= 0 ? settings.manualTemperature : settings.chosenMoveTemperature}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const value = Number(e.currentTarget.value)
            update({ manualTemperature: value })
          }}
          disabled={difficultyDisabled}
          style={{
            ...sliderStyle,
            opacity: difficultyDisabled ? 0.4 : 1,
          }}
        />
        <span
          id="engine-temperature-value"
          style={{ minWidth: '50px' }}
        >
          {settings.chosenMoveTemperature.toFixed(1)}
        </span>
      </div>

      {/* Rules dropdown */}
      <div style={sectionStyle}>
        <label htmlFor="engine-rules" style={labelStyle}>
          규칙
        </label>
        <select
          id="engine-rules"
          value={settings.rules}
          onChange={handleRules}
          disabled={!settings.enabled}
          style={{
            ...selectStyle,
            opacity: settings.enabled ? 1 : 0.4,
          }}
        >
          {(['korean', 'japanese', 'chinese', 'aga'] as Rules[]).map(
            (r) => (
              <option key={r} value={r}>
                {RULES_LABELS[r]}
              </option>
            ),
          )}
        </select>
      </div>

      <div style={dividerStyle} />

      {/* Play style toggle: 인간 스타일 ↔ 강한 AI */}
      <div style={sectionStyle}>
        <span style={labelStyle}>플레이 스타일</span>
        <button
          type="button"
          id="engine-style-human"
          onClick={() => onChange(applyPlayStyle(settings, 'human'))}
          disabled={!settings.enabled}
          style={{
            ...btnStyle(isHumanStyle),
            opacity: settings.enabled ? 1 : 0.4,
          }}
        >
          인간 스타일
        </button>
        <button
          type="button"
          id="engine-style-strong"
          onClick={() => onChange(applyPlayStyle(settings, 'strong'))}
          disabled={!settings.enabled}
          style={{
            ...btnStyle(!isHumanStyle),
            opacity: settings.enabled ? 1 : 0.4,
          }}
        >
          강한 AI
        </button>
        <span
          id="engine-max-visits"
          style={{ opacity: 0.6, fontSize: '12px', marginLeft: 'auto' }}
        >
          maxVisits: {settings.maxVisits}
        </span>
      </div>

      {showHumanModelWarning && (
        <div
          id="engine-human-model-warning"
          style={{
            color: '#e74c3c',
            fontSize: '12px',
            padding: '4px 0',
          }}
        >
          Human-SL 모델이 설정되지 않았습니다.
        </div>
      )}

      {/* Advanced panel toggle */}
      <div style={sectionStyle}>
        <button
          type="button"
          id="engine-advanced-toggle"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          style={{
            ...btnStyle(advancedOpen),
            marginTop: '4px',
            fontSize: '12px',
          }}
        >
          {advancedOpen ? '▼' : '◀'} 고급 설정
        </button>
      </div>

      {advancedOpen && (
        <div
          id="engine-advanced-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '10px 12px',
            background: '#16162a',
            borderRadius: '6px',
            border: '1px solid #2a2a4e',
          }}
        >
          {/* Max visits slider */}
          <div style={sectionStyle}>
            <label htmlFor="engine-max-visits-adv" style={labelStyle}>
              maxVisits
            </label>
            <input
              id="engine-max-visits-adv"
              type="range"
              min={MIN_MAX_VISITS}
              max={MAX_MAX_VISITS}
              step={1}
              value={settings.maxVisits}
              onChange={(e) => update({ maxVisits: Number(e.currentTarget.value) })}
              disabled={!settings.enabled}
              style={sliderStyle}
            />
            <span style={{ minWidth: '60px' }}>
              {settings.maxVisits}
            </span>
          </div>

          {/* humanSLProfile dropdown */}
          <div style={sectionStyle}>
            <label htmlFor="engine-human-profile" style={labelStyle}>
              인간 급수
            </label>
            <select
              id="engine-human-profile"
              value={settings.humanSLProfile}
              onChange={(e) => update({ humanSLProfile: e.currentTarget.value as HumanSLProfile })}
              disabled={!isHumanStyle}
              style={{ ...selectStyle, opacity: isHumanStyle ? 1 : 0.4 }}
            >
              {HUMAN_SL_PROFILE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* humanSLChosenMoveProp slider (key knob) */}
          <div style={sectionStyle}>
            <label htmlFor="engine-human-prop" style={labelStyle}>
              인간 수 비율
            </label>
            <input
              id="engine-human-prop"
              type="range"
              min={MIN_HUMAN_PROP}
              max={MAX_HUMAN_PROP}
              step={0.05}
              value={settings.humanSLChosenMoveProp}
              onChange={(e) => update({ humanSLChosenMoveProp: Number(e.currentTarget.value) })}
              disabled={!isHumanStyle}
              style={{ ...sliderStyle, opacity: isHumanStyle ? 1 : 0.4 }}
            />
            <span style={{ minWidth: '40px' }}>
              {settings.humanSLChosenMoveProp.toFixed(2)}
            </span>
          </div>

          {/* playoutDoublingAdvantage slider */}
          <div style={sectionStyle}>
            <label htmlFor="engine-doubling" style={labelStyle}>
              가산점 조정
            </label>
            <input
              id="engine-doubling"
              type="range"
              min={MIN_DOUBLING}
              max={MAX_DOUBLING}
              step={0.05}
              value={settings.playoutDoublingAdvantage}
              onChange={(e) => update({ playoutDoublingAdvantage: Number(e.currentTarget.value) })}
              disabled={!settings.enabled}
              style={sliderStyle}
            />
            <span style={{ minWidth: '50px' }}>
              {settings.playoutDoublingAdvantage.toFixed(2)}
            </span>
          </div>

          {/* wideRootNoise slider */}
          <div style={sectionStyle}>
            <label htmlFor="engine-noise" style={labelStyle}>
              탐험 폭
            </label>
            <input
              id="engine-noise"
              type="range"
              min={MIN_NOISE}
              max={MAX_NOISE}
              step={0.01}
              value={settings.wideRootNoise}
              onChange={(e) => update({ wideRootNoise: Number(e.currentTarget.value) })}
              disabled={!settings.enabled}
              style={sliderStyle}
            />
            <span style={{ minWidth: '40px' }}>
              {settings.wideRootNoise.toFixed(2)}
            </span>
          </div>

          {/* Human move mode toggle */}
          <div style={sectionStyle}>
            <span style={labelStyle}>착수 방식</span>
            <button
              type="button"
              id="engine-move-mode-native"
              onClick={() => update({ humanMoveMode: 'native' })}
              disabled={!isHumanStyle}
              style={{ ...btnStyle(settings.humanMoveMode === 'native'), opacity: isHumanStyle ? 1 : 0.4 }}
            >
              정확한 인간
            </button>
            <button
              type="button"
              id="engine-move-mode-sampler"
              onClick={() => update({ humanMoveMode: 'policySampler' })}
              disabled={!isHumanStyle}
              style={{ ...btnStyle(settings.humanMoveMode === 'policySampler'), opacity: isHumanStyle ? 1 : 0.4 }}
            >
              가벼운 샘플러
            </button>
          </div>

          <div style={{ opacity: 0.55, fontSize: '11px', lineHeight: 1.4 }}>
            인간 수 비율 1.0=인간 policy 그대로, 0.0=순수 MCTS.
            가산점 음수=약화, 양수=흑 유리 가정.
            정확한 인간=KataGo genmove, 가벼운 샘플러=1-visit policy JS 샘플링(구 방식).
          </div>
        </div>
      )}
    </div>
  )
}
