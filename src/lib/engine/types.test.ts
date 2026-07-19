// ============================================================================
// src/lib/engine/types.test.ts
// Verifies type guards and shape contracts for the engine types surface.
// ============================================================================

import { describe, expect, test } from 'vitest'
import {
  EngineError,
  HUMAN_SL_PROFILES,
  isHumanSLProfile,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type EngineMove,
  type EngineSettings,
  type EngineStatus,
  type GTPCommand,
  type GTPResponse,
  type HumanSLProfile,
  type InitialStone,
  type MoveInfo,
  type RootInfo,
  type Rules,
  type Vertex,
} from './types.ts'

// ============================================================================
// isHumanSLProfile — the primary deliverable
// ============================================================================

describe('isHumanSLProfile', () => {
  // -------- valid inputs --------

  test('returns true for rank_ profiles (kyu ranks)', () => {
    expect(isHumanSLProfile('rank_20k')).toBe(true)
    expect(isHumanSLProfile('rank_15k')).toBe(true)
    expect(isHumanSLProfile('rank_10k')).toBe(true)
    expect(isHumanSLProfile('rank_5k')).toBe(true)
    expect(isHumanSLProfile('rank_1k')).toBe(true)
  })

  test('returns true for rank_ profiles (dan ranks)', () => {
    expect(isHumanSLProfile('rank_1d')).toBe(true)
    expect(isHumanSLProfile('rank_2d')).toBe(true)
    expect(isHumanSLProfile('rank_5d')).toBe(true)
    expect(isHumanSLProfile('rank_9d')).toBe(true)
  })

  test('returns true for preaz_ profiles (kyu + dan ranks)', () => {
    expect(isHumanSLProfile('preaz_20k')).toBe(true)
    expect(isHumanSLProfile('preaz_10k')).toBe(true)
    expect(isHumanSLProfile('preaz_1k')).toBe(true)
    expect(isHumanSLProfile('preaz_1d')).toBe(true)
    expect(isHumanSLProfile('preaz_9d')).toBe(true)
  })

  test('returns true for proyear_ profiles (boundary years)', () => {
    expect(isHumanSLProfile('proyear_1800')).toBe(true) // lower bound
    expect(isHumanSLProfile('proyear_1900')).toBe(true)
    expect(isHumanSLProfile('proyear_1950')).toBe(true)
    expect(isHumanSLProfile('proyear_2000')).toBe(true)
    expect(isHumanSLProfile('proyear_2020')).toBe(true)
    expect(isHumanSLProfile('proyear_2021')).toBe(true)
    expect(isHumanSLProfile('proyear_2022')).toBe(true)
    expect(isHumanSLProfile('proyear_2023')).toBe(true) // upper bound
  })

  test('narrows type to HumanSLProfile when used as a type guard', () => {
    const input: unknown = 'rank_10k'
    if (isHumanSLProfile(input)) {
      // After narrowing, input is HumanSLProfile — assignment must compile.
      const narrowed: HumanSLProfile = input
      expect(narrowed).toBe('rank_10k')
    } else {
      throw new Error('expected rank_10k to be a valid HumanSLProfile')
    }
  })

  // -------- invalid inputs (adversarial) --------

  test('returns false for arbitrary garbage string', () => {
    expect(isHumanSLProfile('invalid')).toBe(false)
  })

  test('returns false for malformed rank strings', () => {
    expect(isHumanSLProfile('rank_xyz')).toBe(false)
    expect(isHumanSLProfile('rank_0k')).toBe(false)
    expect(isHumanSLProfile('rank_21k')).toBe(false) // kyu stops at 20k
    expect(isHumanSLProfile('rank_0d')).toBe(false) // dan starts at 1d
    expect(isHumanSLProfile('rank_10d')).toBe(false) // dan stops at 9d
    expect(isHumanSLProfile('rank_1e')).toBe(false) // bogus suffix
    expect(isHumanSLProfile('preaz_21k')).toBe(false)
    expect(isHumanSLProfile('preaz_10d')).toBe(false)
  })

  test('returns false for out-of-range proyear values', () => {
    expect(isHumanSLProfile('proyear_1799')).toBe(false) // below lower bound
    expect(isHumanSLProfile('proyear_1800_ish')).toBe(false)
    expect(isHumanSLProfile('proyear_2024')).toBe(false) // above upper bound
    expect(isHumanSLProfile('proyear_9999')).toBe(false)
  })

  test('returns false for case / whitespace variants', () => {
    expect(isHumanSLProfile('RANK_10K')).toBe(false) // case-sensitive
    expect(isHumanSLProfile(' rank_10k')).toBe(false) // leading whitespace
    expect(isHumanSLProfile('rank_10k ')).toBe(false) // trailing whitespace
    expect(isHumanSLProfile('rank_ 10k')).toBe(false) // inner whitespace
  })

  test('returns false for wrong prefix', () => {
    expect(isHumanSLProfile('ranks_10k')).toBe(false)
    expect(isHumanSLProfile('rank10k')).toBe(false)
    expect(isHumanSLProfile('preaz10k')).toBe(false)
    expect(isHumanSLProfile('proyear10k')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isHumanSLProfile('')).toBe(false)
  })

  test('returns false for non-string inputs', () => {
    expect(isHumanSLProfile(null)).toBe(false)
    expect(isHumanSLProfile(undefined)).toBe(false)
    expect(isHumanSLProfile(123)).toBe(false)
    expect(isHumanSLProfile(0)).toBe(false)
    expect(isHumanSLProfile(true)).toBe(false)
    expect(isHumanSLProfile(false)).toBe(false)
    expect(isHumanSLProfile({})).toBe(false)
    expect(isHumanSLProfile({ profile: 'rank_10k' })).toBe(false)
    expect(isHumanSLProfile([])).toBe(false)
    expect(isHumanSLProfile(['rank_10k'])).toBe(false)
  })

  test('accepts every entry in the HUMAN_SL_PROFILES constant', () => {
    // Exhaustively confirms the const array and the type guard are in sync.
    for (const profile of HUMAN_SL_PROFILES) {
      expect(isHumanSLProfile(profile)).toBe(true)
    }
  })
})

// ============================================================================
// HUMAN_SL_PROFILES — structural / size assertions
// ============================================================================

describe('HUMAN_SL_PROFILES constant', () => {
  test('contains exactly 29 rank_ profiles (20 kyu + 9 dan)', () => {
    const rankProfiles = HUMAN_SL_PROFILES.filter((p) => p.startsWith('rank_'))
    expect(rankProfiles).toHaveLength(29)
  })

  test('contains exactly 29 preaz_ profiles (20 kyu + 9 dan)', () => {
    const preazProfiles = HUMAN_SL_PROFILES.filter((p) => p.startsWith('preaz_'))
    expect(preazProfiles).toHaveLength(29)
  })

  test('contains exactly 224 proyear_ profiles (1800..2023)', () => {
    const proyearProfiles = HUMAN_SL_PROFILES.filter((p) => p.startsWith('proyear_'))
    expect(proyearProfiles).toHaveLength(224)
  })

  test('total count is 282 (29 + 29 + 224)', () => {
    expect(HUMAN_SL_PROFILES).toHaveLength(282)
  })
})

// ============================================================================
// EngineError — discriminated error class
// ============================================================================

describe('EngineError', () => {
  test('stores the code and message', () => {
    const err = new EngineError('TIMEOUT', 'kata-go did not respond in 30s')
    expect(err.code).toBe('TIMEOUT')
    expect(err.message).toBe('kata-go did not respond in 30s')
    expect(err.name).toBe('EngineError')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(EngineError)
  })

  test('supports every code variant', () => {
    const codes = ['ENGINE_OFFLINE', 'INVALID_RESPONSE', 'TIMEOUT'] as const
    for (const code of codes) {
      const err = new EngineError(code, `${code} test`)
      expect(err.code).toBe(code)
    }
  })
})

// ============================================================================
// Compile-time shape checks — if these compile, the structural types hold.
// ============================================================================

describe('structural type contracts (compile-time)', () => {
  test('Vertex re-export resolves to @sabaki/go-board Vertex', () => {
    const v: Vertex = [3, 4]
    expect(v[0]).toBe(3)
    expect(v[1]).toBe(4)
  })

  test('EngineMove accepts vertex, "pass", and "resign"', () => {
    const moves: EngineMove[] = [[0, 0], 'pass', 'resign']
    expect(moves).toHaveLength(3)
  })

  test('EngineStatus is the documented literal union', () => {
    const statuses: EngineStatus[] = ['idle', 'thinking', 'error']
    expect(statuses).toHaveLength(3)
  })

  test('Rules is the documented literal union', () => {
    const rules: Rules[] = [
      'chinese',
      'japanese',
      'korean',
      'aga',
      'tromp-taylor',
      'new-zealand',
      'stone-scoring',
    ]
    expect(rules).toHaveLength(7)
  })

  test('GTPCommand and GTPResponse can be constructed with required fields', () => {
    const cmd: GTPCommand = { name: 'genmove', args: ['B'] }
    const ok: GTPResponse = { id: 1, success: true, content: 'D4' }
    const err: GTPResponse = { id: 2, success: false, content: 'unknown command' }
    expect(cmd.args).toEqual(['B'])
    expect(ok.content).toBe('D4')
    expect(err.success).toBe(false)
  })

  test('GTPCommand allows omitted id (anonymous form)', () => {
    const cmd: GTPCommand = { name: 'quit', args: [] }
    expect(cmd.id).toBeUndefined()
    expect(cmd.args).toEqual([])
  })

  test('AnalyzeRequest shape compiles for typical KataGo JSON query', () => {
    const req: AnalyzeRequest = {
      id: 'q-1',
      boardXSize: 19,
      boardYSize: 19,
      rules: 'korean',
      komi: 6.5,
      moves: ['B D4', 'W Q16'],
      maxVisits: 200,
      includeOwnership: true,
      includePolicy: true,
      initialStones: [
        ['B', [3, 3]],
        ['B', [15, 15]],
        ['B', [3, 15]],
        ['B', [15, 3]],
      ],
      overrideSettings: {
        humanSLProfile: 'rank_10k',
        humanSLChosenMoveProp: 1.0,
        rootSymmetryPruning: true,
      },
    }
    expect(req.id).toBe('q-1')
    expect(req.initialStones).toHaveLength(4)
  })

  test('RootInfo and MoveInfo shapes compile', () => {
    const root: RootInfo = {
      xSize: 19,
      ySize: 19,
      komi: 6.5,
      visits: 200,
      lcb: 0.5,
      utility: 0.1,
      winrate: 0.55,
      scoreLead: 1.2,
      scoreSelfplay: 1.0,
      scoreStdev: 2.3,
      noResultProbability: 0.01,
      ownership: Array.from({ length: 19 * 19 }, () => 0),
    }
    const move: MoveInfo = {
      x: 3,
      y: 3,
      visits: 100,
      lcb: 0.5,
      utility: 0.1,
      winrate: 0.55,
      scoreLead: 1.0,
      scoreSelfplay: 1.0,
      scoreStdev: 2.0,
      prior: 0.1,
      order: 0,
      pv: ['D4', 'Q16'],
    }
    expect(root.xSize).toBe(19)
    expect(move.order).toBe(0)
  })

  test('AnalyzeResponse shape compiles with optional fields omitted', () => {
    const resp: AnalyzeResponse = { id: 'q-1' }
    expect(resp.id).toBe('q-1')
    expect(resp.rootInfo).toBeUndefined()
  })

  test('EngineSettings shape compiles with all required + optional fields', () => {
    const s: EngineSettings = {
      maxTime: 30,
      maxVisits: 200,
      numSearchThreads: 2,
      rules: 'korean',
      komi: 6.5,
      humanSLProfile: 'rank_10k',
    }
    expect(s.numSearchThreads).toBe(2)
  })

  test('EngineSettings accepts absence of humanSLProfile (exactOptionalPropertyTypes)', () => {
    const s: EngineSettings = {
      maxTime: 30,
      maxVisits: 200,
      numSearchThreads: 2,
      rules: 'japanese',
      komi: 6.5,
    }
    expect(s.humanSLProfile).toBeUndefined()
  })

  test('InitialStone tuple is readonly 2-element', () => {
    const stone: InitialStone = ['B', [3, 4]]
    expect(stone[0]).toBe('B')
    expect(stone[1][0]).toBe(3)
    expect(stone[1][1]).toBe(4)
  })
})
