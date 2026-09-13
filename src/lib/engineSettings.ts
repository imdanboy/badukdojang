/*
 * Engine settings pure logic — types, defaults, persistence, and
 * difficulty→KataGo parameter mapping. UI lives in components/.
 */

export type Rules = 'chinese' | 'japanese' | 'korean' | 'aga'

export type HumanSLProfile =
  | 'rank_20k'
  | 'rank_15k'
  | 'rank_10k'
  | 'rank_5k'
  | 'rank_1k'
  | 'rank_1d'
  | 'rank_2d'
  | 'rank_3d'
  | 'rank_4d'
  | 'rank_5d'
  | 'rank_6d'
  | 'rank_7d'
  | 'rank_8d'
  | 'rank_9d'

export type PlayStyle = 'human' | 'strong'

/**
 * Human move selection strategy.
 * - `native`        — KataGo `genmove` with `humanSLProfile` + MCTS. Tunable
 *                     via maxVisits / humanSLChosenMoveProp / temperature. Default.
 * - `policySampler` — fetch 1-visit policy and sample client-side (the original
 *                     weak-sampler path). Kept as opt-in fallback.
 */
export type HumanMoveMode = 'native' | 'policySampler'

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
  playoutDoublingAdvantage: number
  humanSLChosenMoveProp: number // 0..1, 1 = human policy, 0 = pure MCTS
  humanMoveMode: HumanMoveMode
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
  maxVisits: 300,
  manualTemperature: -1,
  chosenMoveTemperature: 1.5,
  wideRootNoise: 0.04,
  playoutDoublingAdvantage: -0.25,
  humanSLChosenMoveProp: 1.0,
  humanMoveMode: 'native',
}

export const MIN_THINKING_TIME = 1
export const MAX_THINKING_TIME = 30
export const MIN_DIFFICULTY = 1
export const MAX_DIFFICULTY = 20

const STRONG_MAX_VISITS = 800

// Advanced knob bounds
export const MIN_MAX_VISITS = 1
export const MAX_MAX_VISITS = 2000
export const MIN_DOUBLING = -3.0
export const MAX_DOUBLING = 1.0
export const MIN_NOISE = 0.0
export const MAX_NOISE = 1.0
export const MIN_HUMAN_PROP = 0.0
export const MAX_HUMAN_PROP = 1.0

export const RULES_LABELS: Record<Rules, string> = {
  chinese: '중국식',
  japanese: '일본식',
  korean: '한국식',
  aga: 'AGA',
}

// --- Utilities -------------------------------------------------------------

/** Clamp a number to [min, max] — guards against malformed/negative input. */
export function clamp(value: number, min: number, max: number): number {
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
  if (kyu >= 18) return 20
  if (kyu >= 13) return 80
  if (kyu >= 8) return 300
  if (kyu >= 3) return 600
  return 1000
}

function difficultyToNoise(kyu: number): number {
  if (kyu >= 18) return 0.3
  if (kyu >= 13) return 0.15
  if (kyu >= 8) return 0.04
  if (kyu >= 3) return 0.0
  return 0.0
}

function difficultyToDoublingAdvantage(kyu: number): number {
  if (kyu >= 16) return -1.5
  if (kyu >= 11) return -0.75
  if (kyu >= 6) return -0.25
  if (kyu >= 3) return 0.0
  return 0.0
}

function difficultyToTemperature(kyu: number): number {
  if (kyu >= 18) return 3.0
  if (kyu >= 14) return 2.0
  if (kyu >= 9) return 1.5
  if (kyu >= 4) return 0.8
  return 0.3
}

/** Format kyu value for display, e.g. 10 → "10급", 1 → "1급". */
export function formatKyu(kyu: number): string {
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
  const humanMoveMode: HumanMoveMode =
    partial.humanMoveMode === 'policySampler' ? 'policySampler' : 'native'
  const humanSLProfile =
    partial.humanSLProfile ?? difficultyToProfile(difficulty)
  const maxVisits =
    playStyle === 'strong'
      ? STRONG_MAX_VISITS
      : clamp(
          partial.maxVisits ?? difficultyToVisits(difficulty),
          MIN_MAX_VISITS,
          MAX_MAX_VISITS,
        )
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
  const wideRootNoise = clamp(
    playStyle === 'strong' ? 0.0
      : partial.wideRootNoise ?? difficultyToNoise(difficulty),
    MIN_NOISE, MAX_NOISE,
  )
  const playoutDoublingAdvantage = clamp(
    playStyle === 'strong' ? 0.0
      : partial.playoutDoublingAdvantage ?? difficultyToDoublingAdvantage(difficulty),
    MIN_DOUBLING, MAX_DOUBLING,
  )
  const humanSLChosenMoveProp = clamp(
    partial.humanSLChosenMoveProp ?? DEFAULT_SETTINGS.humanSLChosenMoveProp,
    MIN_HUMAN_PROP, MAX_HUMAN_PROP,
  )

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
    playoutDoublingAdvantage,
    humanSLChosenMoveProp,
    humanMoveMode,
  }
}

/** Apply a difficulty change: re-derive profile, reset manual temperature. */
export function applyDifficulty(
  settings: EngineSettings,
  kyu: number,
): EngineSettings {
  const difficulty = clamp(kyu, MIN_DIFFICULTY, MAX_DIFFICULTY)
  return normalizeSettings({
    ...settings,
    difficulty,
    humanSLProfile: difficultyToProfile(difficulty),
    manualTemperature: -1,
  })
}

/** Apply a play-style change: human ↔ strong with derived maxVisits. */
export function applyPlayStyle(
  settings: EngineSettings,
  style: PlayStyle,
): EngineSettings {
  if (style === 'strong') {
    return normalizeSettings({
      ...settings,
      playStyle: 'strong',
      maxVisits: STRONG_MAX_VISITS,
      manualTemperature: -1,
    })
  }
  return normalizeSettings({
    ...settings,
    playStyle: 'human',
    maxVisits: difficultyToVisits(settings.difficulty),
    humanSLProfile: difficultyToProfile(settings.difficulty),
    manualTemperature: -1,
  })
}
