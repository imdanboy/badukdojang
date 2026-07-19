/*
 * EngineSettings - Collapsible engine settings panel (UI skeleton).
 * Sits below ControlBar. Controls engine ON/OFF, thinking time,
 * difficulty (kyu → humanSLProfile), rules, and play style
 * (인간 스타일 / 강한 AI). Persists to localStorage.
 *
 * No engine connection — UI-only skeleton.
 */
import { useEffect, useState } from 'preact/hooks'

// --- Types -----------------------------------------------------------------

export type Rules = 'chinese' | 'japanese' | 'korean' | 'aga'

export type HumanSLProfile =
  | 'rank_20k'
  | 'rank_15k'
  | 'rank_10k'
  | 'rank_5k'
  | 'rank_1k'
  | 'rank_1d'
  | 'rank_9d'

export type PlayStyle = 'human' | 'strong'

export interface EngineSettings {
  enabled: boolean
  thinkingTime: number // 1-30 seconds
  difficulty: number // 1-20 kyu (20 = weakest, 1 = strongest kyu)
  rules: Rules
  playStyle: PlayStyle
  humanSLProfile: HumanSLProfile
  maxVisits: number
  manualTemperature: number // -1 = auto (use difficulty), 0-10 = manual override
  chosenMoveTemperature: number
  wideRootNoise: number
}

export interface EngineSettingsProps {
  settings: EngineSettings
  onChange: (settings: EngineSettings) => void
  humanModelAvailable?: boolean | null
}

// --- Constants -------------------------------------------------------------

export const STORAGE_KEY = 'badukdojang-engine-settings'

export const DEFAULT_SETTINGS: EngineSettings = {
  enabled: false,
  thinkingTime: 5,
  difficulty: 10,
  rules: 'korean',
  playStyle: 'human',
  humanSLProfile: 'rank_10k',
  maxVisits: 25,
  manualTemperature: -1,
  chosenMoveTemperature: 1.5,
  wideRootNoise: 0.15,
}

const MIN_THINKING_TIME = 1
const MAX_THINKING_TIME = 30
const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 20

const STRONG_MAX_VISITS = 500

const RULES_LABELS: Record<Rules, string> = {
  chinese: '중국식',
  japanese: '일본식',
  korean: '한국식',
  aga: 'AGA',
}

// --- Utilities -------------------------------------------------------------

/** Clamp a number to [min, max] — guards against malformed/negative input. */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Map a 1-20 kyu slider value to the nearest HumanSLProfile bucket.
 * 20k (weakest) → rank_20k, 1k (strongest kyu) → rank_1k.
 * Dan profiles (rank_1d, rank_9d) are defined for future extension
 * but unreachable from the 1-20 kyu slider range.
 */
export function difficultyToProfile(kyu: number): HumanSLProfile {
  if (kyu >= 18) return 'rank_20k'
  if (kyu >= 13) return 'rank_15k'
  if (kyu >= 8) return 'rank_10k'
  if (kyu >= 3) return 'rank_5k'
  return 'rank_1k'
}

function difficultyToVisits(kyu: number): number {
  return Math.max(10, Math.round(50 - 2.5 * kyu))
}

function difficultyToNoise(kyu: number): number {
  if (kyu >= 16) return 0.5
  if (kyu >= 11) return 0.3
  if (kyu >= 6) return 0.15
  if (kyu >= 3) return 0.05
  return 0.0
}

function difficultyToTemperature(kyu: number): number {
  if (kyu >= 18) return 5.0
  if (kyu >= 14) return 3.0
  if (kyu >= 9) return 1.5
  if (kyu >= 4) return 0.3
  return 0.1
}

/** Format kyu value for display, e.g. 10 → "10급", 1 → "1급". */
function formatKyu(kyu: number): string {
  return `${kyu}급`
}

/**
 * Load settings from localStorage, falling back to defaults.
 * Malformed/missing JSON is silently replaced by defaults.
 */
export function loadSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<EngineSettings>
    return normalizeSettings(parsed)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Persist settings to localStorage. */
export function saveSettings(settings: EngineSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage may be unavailable (private mode, quota) — silently ignore.
  }
}

/**
 * Normalize a partial/external settings object into a valid EngineSettings,
 * clamping all numeric fields and deriving humanSLProfile/maxVisits.
 */
export function normalizeSettings(
  partial: Partial<EngineSettings>,
): EngineSettings {
  const playStyle: PlayStyle = partial.playStyle === 'strong' ? 'strong' : 'human'
  const difficulty = clamp(
    partial.difficulty ?? DEFAULT_SETTINGS.difficulty,
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
  )
  const humanSLProfile =
    partial.humanSLProfile ?? difficultyToProfile(difficulty)
  const maxVisits =
    playStyle === 'strong' ? STRONG_MAX_VISITS : difficultyToVisits(difficulty)
  const manualTemperature = clamp(
    partial.manualTemperature ?? DEFAULT_SETTINGS.manualTemperature,
    -1, 10,
  )
  const chosenMoveTemperature = clamp(
    manualTemperature >= 0 ? manualTemperature
      : playStyle === 'strong' ? 0.0
      : difficultyToTemperature(difficulty),
    0, 5,
  )
  const wideRootNoise =
    playStyle === 'strong' ? 0.0 : difficultyToNoise(difficulty)

  return {
    enabled: partial.enabled ?? DEFAULT_SETTINGS.enabled,
    thinkingTime: clamp(
      partial.thinkingTime ?? DEFAULT_SETTINGS.thinkingTime,
      MIN_THINKING_TIME,
      MAX_THINKING_TIME,
    ),
    difficulty,
    rules: partial.rules && partial.rules in RULES_LABELS
      ? partial.rules
      : DEFAULT_SETTINGS.rules,
    playStyle,
    humanSLProfile,
    maxVisits,
    manualTemperature,
    chosenMoveTemperature,
    wideRootNoise,
  }
}

// --- Style helpers (match ControlBar design system) ------------------------

const panelStyle: preact.JSX.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '10px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '14px',
  width: '100%',
  maxWidth: '600px',
}

const headerStyle: preact.JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  cursor: 'pointer',
  userSelect: 'none',
}

const sectionStyle: preact.JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const labelStyle: preact.JSX.CSSProperties = {
  opacity: 0.7,
  minWidth: '80px',
}

const selectStyle: preact.JSX.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #3b3b5c',
  borderRadius: '4px',
  background: '#2a2a4e',
  color: '#e0e0e0',
  fontSize: '14px',
  cursor: 'pointer',
}

const sliderStyle: preact.JSX.CSSProperties = {
  cursor: 'pointer',
  accentColor: '#5a7fb5',
  flex: '1',
  minWidth: '120px',
}

const dividerStyle: preact.JSX.CSSProperties = {
  width: '100%',
  height: '1px',
  background: '#3b3b5c',
  margin: '0',
}

const btnStyle = (active: boolean): preact.JSX.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

// --- Component -------------------------------------------------------------

export function EngineSettings({
  settings,
  onChange,
  humanModelAvailable,
}: EngineSettingsProps) {
  const [expanded, setExpanded] = useState(true)

  // Persist to localStorage whenever settings change.
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const update = (patch: Partial<EngineSettings>): void => {
    onChange(normalizeSettings({ ...settings, ...patch }))
  }

  const toggleEnabled = () => update({ enabled: !settings.enabled })

  const toggleExpanded = () => setExpanded((prev) => !prev)

  const handleThinkingTime = (e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value)
    update({ thinkingTime: clamp(value, MIN_THINKING_TIME, MAX_THINKING_TIME) })
  }

  const handleDifficulty = (e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value)
    const clamped = clamp(value, MIN_DIFFICULTY, MAX_DIFFICULTY)
    update({ difficulty: clamped, humanSLProfile: difficultyToProfile(clamped), manualTemperature: -1 })
  }

  const handleRules = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as Rules
    update({ rules: value })
  }

  const handlePlayStyle = (style: PlayStyle) => {
    if (style === 'strong') {
      update({ playStyle: 'strong', maxVisits: STRONG_MAX_VISITS, manualTemperature: -1 })
    } else {
      update({
        playStyle: 'human',
        maxVisits: difficultyToVisits(settings.difficulty),
        humanSLProfile: difficultyToProfile(settings.difficulty),
        manualTemperature: -1,
      })
    }
  }

  const isHumanStyle = settings.playStyle === 'human'
  const difficultyDisabled = !settings.enabled || !isHumanStyle
  const showHumanModelWarning =
    isHumanStyle && humanModelAvailable === false

  return (
    <div style={panelStyle} id="engine-settings-panel">
      {/* Header — click to expand/collapse */}
      <div
        style={headerStyle}
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        id="engine-settings-header"
      >
        <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
          {expanded ? '\u25BC' : '\u25C0'} 엔진 설정
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ opacity: 0.6, fontSize: '12px' }}>
            {settings.enabled ? '켜짐' : '꺼짐'}
          </span>
          {/* Engine ON/OFF switch */}
          <button
            type="button"
            id="engine-toggle"
            onClick={(e) => {
              e.stopPropagation()
              toggleEnabled()
            }}
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

      {/* Collapsible body */}
      {expanded && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          id="engine-settings-body"
        >
          <div style={dividerStyle} />

          {/* Thinking time slider */}
          <div style={sectionStyle}>
            <label for="engine-thinking-time" style={labelStyle}>
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
            <label for="engine-difficulty" style={labelStyle}>
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
            <label for="engine-temperature" style={labelStyle}>
              랜덤 온도
            </label>
            <input
              id="engine-temperature"
              type="range"
              min={0}
              max={10}
              step={0.1}
              value={settings.manualTemperature >= 0 ? settings.manualTemperature : settings.chosenMoveTemperature}
              onChange={(e) => {
                const value = Number((e.currentTarget as HTMLInputElement).value)
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
            <label for="engine-rules" style={labelStyle}>
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
              onClick={() => handlePlayStyle('human')}
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
              onClick={() => handlePlayStyle('strong')}
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
        </div>
      )}
    </div>
  )
}