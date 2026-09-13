/*
 * Engine settings pure-logic unit tests.
 * Covers: difficulty→profile mapping, normalization/clamping,
 * localStorage round-trips, and the applyDifficulty/applyPlayStyle
 * transition helpers used by both the settings form and the new-game modal.
 */
import { describe, expect, test, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  applyDifficulty,
  applyPlayStyle,
  difficultyToProfile,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from './engineSettings.ts'
import type { EngineSettings } from './engineSettings.ts'

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

  test('strong play style forces maxVisits=800', () => {
    const result = normalizeSettings({ playStyle: 'strong', maxVisits: 40 })
    expect(result.maxVisits).toBe(800)
  })

  test('human play style derives maxVisits from difficulty (10k → 300)', () => {
    const result = normalizeSettings({ playStyle: 'human', difficulty: 10 })
    expect(result.maxVisits).toBe(300)
  })

  test('human play style respects explicit maxVisits override', () => {
    const result = normalizeSettings({ playStyle: 'human', difficulty: 10, maxVisits: 50 })
    expect(result.maxVisits).toBe(50)
  })

  test('derives humanSLProfile from difficulty when missing', () => {
    const result = normalizeSettings({ difficulty: 15 })
    expect(result.humanSLProfile).toBe('rank_15k')
  })

  test('invalid rules falls back to korean', () => {
    const result = normalizeSettings({ rules: 'invalid' as never })
    expect(result.rules).toBe('korean')
  })

  test('human play style maps difficulty to playoutDoublingAdvantage', () => {
    expect(normalizeSettings({ playStyle: 'human', difficulty: 20 }).playoutDoublingAdvantage).toBe(-1.5)
    expect(normalizeSettings({ playStyle: 'human', difficulty: 12 }).playoutDoublingAdvantage).toBe(-0.75)
    expect(normalizeSettings({ playStyle: 'human', difficulty: 8 }).playoutDoublingAdvantage).toBe(-0.25)
    expect(normalizeSettings({ playStyle: 'human', difficulty: 3 }).playoutDoublingAdvantage).toBe(0.0)
    expect(normalizeSettings({ playStyle: 'human', difficulty: 1 }).playoutDoublingAdvantage).toBe(0.0)
  })

  test('strong play style forces playoutDoublingAdvantage 0.0', () => {
    expect(normalizeSettings({ playStyle: 'strong', difficulty: 20 }).playoutDoublingAdvantage).toBe(0.0)
  })

  test('humanSLChosenMoveProp defaults to 1.0 and clamps to [0,1]', () => {
    expect(normalizeSettings({}).humanSLChosenMoveProp).toBe(1.0)
    expect(normalizeSettings({ humanSLChosenMoveProp: -1 }).humanSLChosenMoveProp).toBe(0)
    expect(normalizeSettings({ humanSLChosenMoveProp: 2 }).humanSLChosenMoveProp).toBe(1)
  })

  test('humanMoveMode defaults to native', () => {
    expect(normalizeSettings({}).humanMoveMode).toBe('native')
    expect(normalizeSettings({ humanMoveMode: 'policySampler' }).humanMoveMode).toBe('policySampler')
  })
})

describe('applyDifficulty', () => {
  test('updates difficulty, profile, and resets manual temperature', () => {
    const base: EngineSettings = {
      ...DEFAULT_SETTINGS,
      manualTemperature: 2.5,
    }
    const result = applyDifficulty(base, 5)
    expect(result.difficulty).toBe(5)
    expect(result.humanSLProfile).toBe('rank_5k')
    expect(result.manualTemperature).toBe(-1)
  })

  test('clamps out-of-range difficulty', () => {
    expect(applyDifficulty(DEFAULT_SETTINGS, 99).difficulty).toBe(20)
    expect(applyDifficulty(DEFAULT_SETTINGS, -3).difficulty).toBe(1)
  })
})

describe('applyPlayStyle', () => {
  test('strong sets maxVisits=800 and resets manual temperature', () => {
    const result = applyPlayStyle({ ...DEFAULT_SETTINGS, manualTemperature: 3 }, 'strong')
    expect(result.playStyle).toBe('strong')
    expect(result.maxVisits).toBe(800)
    expect(result.manualTemperature).toBe(-1)
  })

  test('human derives maxVisits and profile from difficulty', () => {
    const strong: EngineSettings = {
      ...DEFAULT_SETTINGS,
      difficulty: 10,
      playStyle: 'strong',
      maxVisits: 800,
    }
    const result = applyPlayStyle(strong, 'human')
    expect(result.playStyle).toBe('human')
    expect(result.maxVisits).toBe(300)
    expect(result.humanSLProfile).toBe('rank_10k')
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
    const custom: EngineSettings = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      thinkingTime: 15,
      difficulty: 5,
      rules: 'chinese',
      playStyle: 'strong',
      maxVisits: 800,
      humanSLProfile: 'rank_5k',
      chosenMoveTemperature: 0,
      wideRootNoise: 0,
      playoutDoublingAdvantage: 0,
      humanSLChosenMoveProp: 0.5,
      humanMoveMode: 'policySampler',
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

  test('ignores legacy UI-only fields from older versions', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, advancedOpen: true }),
    )
    const loaded = loadSettings()
    expect(loaded).toEqual(DEFAULT_SETTINGS)
  })
})
