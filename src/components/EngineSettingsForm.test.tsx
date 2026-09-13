/*
 * EngineSettingsForm unit tests.
 * Covers: rendering, engine toggle, slider clamping, play-style buttons,
 * and rules dropdown behavior of the settings-modal engine tab.
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { EngineSettingsForm } from './EngineSettingsForm.tsx'
import { DEFAULT_SETTINGS } from '../lib/engineSettings.ts'
import type { EngineSettings } from '../lib/engineSettings.ts'

// --- Utilities -------------------------------------------------------------

function renderForm(
  overrides: Partial<EngineSettings> = {},
): {
  onChange: ReturnType<typeof vi.fn>
  settings: EngineSettings
} {
  const onChange = vi.fn()
  const settings = { ...DEFAULT_SETTINGS, ...overrides }
  render(
    <EngineSettingsForm
      settings={settings}
      onChange={onChange}
      humanModelAvailable={true}
    />,
  )
  return { onChange, settings }
}

// --- Tests -----------------------------------------------------------------

describe('EngineSettingsForm component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('renders panel with all controls', () => {
    renderForm()
    expect(screen.getByText('엔진 설정')).toBeTruthy()
    expect(screen.getByText('생각 시간')).toBeTruthy()
    expect(screen.getByText('난이도')).toBeTruthy()
    expect(screen.getByText('규칙')).toBeTruthy()
    expect(screen.getByText('인간 스타일')).toBeTruthy()
    expect(screen.getByText('강한 AI')).toBeTruthy()
  })

  test('engine toggle switches enabled state', () => {
    const { onChange } = renderForm({ enabled: false })
    const toggle = screen.getByLabelText('엔진 켜기')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledTimes(1)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.enabled).toBe(true)
  })

  test('thinking time slider calls onChange with clamped value', () => {
    const { onChange } = renderForm({ enabled: true })
    const slider = screen.getByLabelText('생각 시간') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '20' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.thinkingTime).toBe(20)
  })

  test('difficulty slider updates humanSLProfile', () => {
    const { onChange } = renderForm({ enabled: true, playStyle: 'human' })
    const slider = screen.getByLabelText('난이도') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '5' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.difficulty).toBe(5)
    expect(newSettings.humanSLProfile).toBe('rank_5k')
  })

  test('강한 AI button sets maxVisits=800 and playStyle=strong', () => {
    const { onChange } = renderForm({ enabled: true, playStyle: 'human' })
    const strongBtn = screen.getByText('강한 AI')
    fireEvent.click(strongBtn)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.playStyle).toBe('strong')
    expect(newSettings.maxVisits).toBe(800)
  })

  test('인간 스타일 button derives maxVisits from difficulty', () => {
    const { onChange } = renderForm({
      enabled: true,
      playStyle: 'strong',
      maxVisits: 800,
    })
    const humanBtn = screen.getByText('인간 스타일')
    fireEvent.click(humanBtn)
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.playStyle).toBe('human')
    expect(newSettings.maxVisits).toBe(300)
    expect(newSettings.humanSLProfile).toBe('rank_10k')
  })

  test('rules dropdown changes rules', () => {
    const { onChange } = renderForm({ enabled: true, rules: 'korean' })
    const select = screen.getByLabelText('규칙') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'chinese' } })
    const newSettings = onChange.mock.calls[0]![0] as EngineSettings
    expect(newSettings.rules).toBe('chinese')
  })

  test('advanced section toggles open and closed', () => {
    renderForm()
    const advancedToggle = screen.getByText(/고급 설정/)
    expect(screen.queryByText('maxVisits')).toBeNull()

    fireEvent.click(advancedToggle)
    expect(screen.getByText('인간 급수')).toBeTruthy()

    fireEvent.click(advancedToggle)
    expect(screen.queryByText('인간 급수')).toBeNull()
  })

  test('shows Human-SL warning when model unavailable and human style', () => {
    render(
      <EngineSettingsForm
        settings={{ ...DEFAULT_SETTINGS, playStyle: 'human' }}
        onChange={() => {}}
        humanModelAvailable={false}
      />,
    )
    expect(screen.getByText(/Human-SL 모델이 설정되지 않았습니다/)).toBeTruthy()
  })
})
