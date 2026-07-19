/*
 * EngineSettings unit tests.
 * Covers: rendering, slider bounds (malformed input), toggle behavior,
 * localStorage round-trip (stale state), and play-style interactions.
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import {
  EngineSettings,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  difficultyToProfile,
  normalizeSettings,
  loadSettings,
  saveSettings,
} from './EngineSettings.tsx'
import type { EngineSettings as EngineSettingsType } from './EngineSettings.tsx'

// --- Utilities -------------------------------------------------------------

function renderPanel(
  overrides: Partial<EngineSettingsType> = {},
): {
  onChange: ReturnType<typeof vi.fn>
  settings: EngineSettingsType
} {
  const onChange = vi.fn()
  const settings = { ...DEFAULT_SETTINGS, ...overrides }
  render(<EngineSettings settings={settings} onChange={onChange} />)
  return { onChange, settings }
}

// --- Tests -----------------------------------------------------------------

describe('difficultyToProfile', () => {
  test('maps 20 kyu to rank_20k', () => {
    expect(difficultyToProfile(20)).toBe('rank_20k')
  })

  test('maps 10 kyu (default) to rank_10k', () => {
    expect(difficultyToProfile(10)).toBe('rank_10k')
  })

  test('maps 1 kyu (strongest) to rank_1k', () => {
    expect(difficultyToProfile(1)).toBe('rank_1k')
  })

  test('maps 15 kyu to rank_15k', () => {
    expect(difficultyToProfile(15)).toBe('rank_15k')
  })

  test('maps 5 kyu to rank_5k', () => {
    expect(difficultyToProfile(5)).toBe('rank_5k')
  })
})

describe('normalizeSettings', () => {
  test('returns defaults for empty input', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  test('clamps negative thinking time to 1', () => {
    const result = normalizeSettings({ thinkingTime: -5 })
    expect(result.thinkingTime).toBe(1)
  })

  test('clamps thinking time above 30 to 30', () => {
    const result = normalizeSettings({ thinkingTime: 999 })
    expect(result.thinkingTime).toBe(30)
  })

  test('clamps 0 kyu to 1 (cannot set 0 kyu)', () => {
    const result = normalizeSettings({ difficulty: 0 })
    expect(result.difficulty).toBe(1)
  })

  test('clamps difficulty above 20 to 20', () => {
    const result = normalizeSettings({ difficulty: 50 })
    expect(result.difficulty).toBe(20)
  })

  test('NaN thinking time falls back to min', () => {
    const result = normalizeSettings({ thinkingTime: NaN })
    expect(result.thinkingTime).toBe(1)
  })

  test('strong play style forces maxVisits=500', () => {
    const result = normalizeSettings({ playStyle: 'strong', maxVisits: 40 })
    expect(result.maxVisits).toBe(500)
  })

  test('human play style derives maxVisits from difficulty', () => {
    const result = normalizeSettings({ playStyle: 'human', maxVisits: 500 })
    expect(result.maxVisits).toBe(25)
  })

  test('derives humanSLProfile from difficulty when missing', () => {
    const result = normalizeSettings({ difficulty: 15 })
    expect(result.humanSLProfile).toBe('rank_15k')
  })

  test('invalid rules falls back to korean', () => {
    const result = normalizeSettings({ rules: 'invalid' as never })
    expect(result.rules).toBe('korean')
  })
})

describe('loadSettings / saveSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('returns defaults when localStorage is empty', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  test('round-trips settings through localStorage', () => {
    const custom: EngineSettingsType = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      thinkingTime: 15,
      difficulty: 5,
      rules: 'chinese',
      playStyle: 'strong',
      maxVisits: 500,
      humanSLProfile: 'rank_5k',
      chosenMoveTemperature: 0,
      wideRootNoise: 0,
    }
    saveSettings(custom)
    const loaded = loadSettings()
    expect(loaded).toEqual(custom)
  })

  test('handles malformed JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  test('normalizes partial/malformed stored values', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ thinkingTime: -10, difficulty: 0 }),
    )
    const loaded = loadSettings()
    expect(loaded.thinkingTime).toBe(1)
    expect(loaded.difficulty).toBe(1)
  })
})

describe('EngineSettings component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('renders panel with header and all controls', () => {
    renderPanel()
    expect(screen.getByText(/엔진 설정/)).toBeTruthy()
    expect(screen.getByText('생각 시간')).toBeTruthy()
    expect(screen.getByText('난이도')).toBeTruthy()
    expect(screen.getByText('규칙')).toBeTruthy()
    expect(screen.getByText('인간 스타일')).toBeTruthy()
    expect(screen.getByText('강한 AI')).toBeTruthy()
  })

  test('engine toggle switches enabled state', () => {
    const { onChange } = renderPanel({ enabled: false })
    const toggle = screen.getByLabelText('엔진 켜기')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledTimes(1)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.enabled).toBe(true)
  })

  test('thinking time slider calls onChange with clamped value', () => {
    const { onChange } = renderPanel({ enabled: true })
    const slider = screen.getByLabelText('생각 시간') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '20' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.thinkingTime).toBe(20)
  })

  test('difficulty slider updates humanSLProfile', () => {
    const { onChange } = renderPanel({ enabled: true, playStyle: 'human' })
    const slider = screen.getByLabelText('난이도') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '5' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.difficulty).toBe(5)
    expect(newSettings.humanSLProfile).toBe('rank_5k')
  })

  test('강한 AI button sets maxVisits=500 and playStyle=strong', () => {
    const { onChange } = renderPanel({ enabled: true, playStyle: 'human' })
    const strongBtn = screen.getByText('강한 AI')
    fireEvent.click(strongBtn)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.playStyle).toBe('strong')
    expect(newSettings.maxVisits).toBe(500)
  })

  test('인간 스타일 button derives maxVisits from difficulty', () => {
    const { onChange } = renderPanel({
      enabled: true,
      playStyle: 'strong',
      maxVisits: 500,
    })
    const humanBtn = screen.getByText('인간 스타일')
    fireEvent.click(humanBtn)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.playStyle).toBe('human')
    expect(newSettings.maxVisits).toBe(25)
    expect(newSettings.humanSLProfile).toBe('rank_10k')
  })

  test('rules dropdown changes rules', () => {
    const { onChange } = renderPanel({ enabled: true, rules: 'korean' })
    const select = screen.getByLabelText('규칙') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'chinese' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettingsType
    expect(newSettings.rules).toBe('chinese')
  })

  test('header click toggles expand/collapse', () => {
    renderPanel()
    const header = screen.getByText(/엔진 설정/)
    // Body should be visible initially (expanded by default)
    expect(screen.getByText('생각 시간')).toBeTruthy()
    // Click header to collapse
    fireEvent.click(header)
    // Body controls should no longer be in the document
    expect(screen.queryByText('생각 시간')).toBeNull()
  })

  test('persists settings to localStorage on change', () => {
    // Use a stateful wrapper so the useEffect actually fires with new settings
    function Wrapper() {
      const [settings, setSettings] = useState<EngineSettingsType>({
        ...DEFAULT_SETTINGS,
        enabled: false,
      })
      return <EngineSettings settings={settings} onChange={setSettings} />
    }
    render(<Wrapper />)
    const toggle = screen.getByLabelText('엔진 켜기')
    fireEvent.click(toggle)
    // The component's useEffect should have saved the updated settings
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!) as EngineSettingsType
    expect(parsed.enabled).toBe(true)
  })
})