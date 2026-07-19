// ============================================================================
// src/lib/engine/types.ts
// Strict TypeScript type definitions for the KataGo engine integration surface.
// Pure type declarations + narrow type guards. No business logic.
//
// Reference: https://github.com/lightvector/KataGo
//   - cpp/configs/gtp_human5k_example.cfg (Human-SL profile list)
//   - docs/GTP_Extensions.md (GTP)
//   - docs/Analysis_Engine.md (JSON analysis engine)
//   - cpp/neuralnet/sgfmetadata.cpp (canonical Human-SL profile source of truth)
// ============================================================================

import type { Vertex } from '@sabaki/go-board'

// Re-export the existing Vertex type so engine consumers don't need to know
// which dependency it came from. Single import surface for engine code.
export type { Vertex }

// ============================================================================
// GTP (Go Text Protocol) — line-based command/response
//   Command:  <id?> <name> <args...>\n
//   Success:  = <id?> <content>\n\n
//   Error:    ? <id?> <message>\n\n
// ============================================================================

export interface GTPCommand {
  readonly id?: number
  readonly name: string
  readonly args: readonly string[]
}

export interface GTPResponse {
  readonly id?: number
  readonly success: boolean
  readonly content: string
}

// ============================================================================
// KataGo Analysis Engine — JSON request/response (one JSON object per line)
// ============================================================================

/**
 * A single initial stone for handicap setup.
 * Color is encoded as a GTP-style color letter; coordinates are [x, y].
 */
export type InitialStone = readonly [
  color: 'B' | 'W',
  vertex: readonly [x: number, y: number],
]

/**
 * Per-query settings override map. Mirrors the JSON shape KataGo accepts.
 * Values mirror the union KataGo's `overrideSettings` accepts: strings, numbers,
 * and booleans. The element type is closed (no escape hatches).
 */
export type AnalyzeOverrideValue = string | number | boolean

export interface AnalyzeRequest {
  readonly id: string
  readonly boardXSize: number
  readonly boardYSize: number
  readonly rules: Rules
  readonly komi: number
  readonly moves: readonly string[]
  readonly initialStones?: readonly InitialStone[]

  // Search budget
  readonly maxVisits?: number
  readonly maxTime?: number
  readonly maxPlayouts?: number

  // Analysis content toggles
  readonly includeOwnership?: boolean
  readonly includeOwnershipStdev?: boolean
  readonly includePolicy?: boolean
  readonly includePVVisits?: boolean
  readonly includePVEdgeVisits?: boolean
  readonly includeNoResultValue?: boolean
  readonly includeMovesOwnership?: boolean
  readonly includeScoreLeadProbability?: boolean

  // Per-query settings override
  readonly overrideSettings?: Readonly<Record<string, AnalyzeOverrideValue>>

  // Move restrictions (KataGo encodes moves as `y * boardXSize + x`)
  readonly avoidMoves?: readonly number[]
  readonly allowMoves?: readonly number[]

  // Search behaviour at the root
  readonly rootPolicyTemperature?: number
  readonly rootFpuReductionMax?: number

  // Reporting cadence
  readonly reportDuringSearchEvery?: number
}

export interface RootInfo {
  readonly xSize: number
  readonly ySize: number
  readonly komi: number
  readonly visits: number
  readonly lcb: number
  readonly utility: number
  readonly winrate: number
  readonly scoreLead: number
  readonly scoreSelfplay: number
  readonly scoreStdev: number
  readonly noResultProbability: number
  readonly ownership?: readonly number[]
  readonly policy?: readonly number[]
  readonly passOwnership?: number
  readonly humanPolicy?: readonly number[]
}

export interface MoveInfo {
  readonly x: number
  /** -1 indicates a pass; KataGo reserves negative-y for "resign"-like sentinel */
  readonly y: number
  readonly visits: number
  readonly lcb: number
  readonly utility: number
  readonly winrate: number
  readonly scoreLead: number
  readonly scoreSelfplay: number
  readonly scoreStdev: number
  readonly prior: number
  readonly noResultValue?: number
  readonly order: number
  readonly pv?: readonly string[]
  readonly pvVisits?: readonly number[]
  readonly pvEdgeVisits?: readonly number[]
  readonly weight?: number
  readonly edgeWeight?: number
  readonly isSymmetryOf?: number
  readonly humanPolicy?: readonly number[]
}

export interface BestMoveInfo {
  readonly move: string
  readonly visits: number
  readonly winrate: number
  readonly scoreLead: number
  readonly pv?: readonly string[]
}

export interface AnalyzeResponse {
  readonly id: string
  readonly turnNumber?: number
  readonly field?: string
  readonly rootInfo?: RootInfo
  readonly moveInfos?: readonly MoveInfo[]
  readonly ownership?: readonly number[]
  readonly policy?: readonly number[]
  readonly humanPolicy?: readonly number[]
  readonly policyPass?: number
  readonly winrate?: number
  readonly scoreLead?: number
  readonly bestMoves?: readonly BestMoveInfo[]
  readonly completed?: boolean
}

// ============================================================================
// Engine move / status / rules
// ============================================================================

export type EngineMove = Vertex | 'pass' | 'resign'

export type EngineStatus = 'idle' | 'thinking' | 'error'

/**
 * Ruleset names accepted by KataGo's `kata-set-rules` GTP command.
 * `tromp-taylor` is spelled with a hyphen as KataGo's canonical form.
 */
export type Rules =
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'aga'
  | 'tromp-taylor'
  | 'new-zealand'
  | 'stone-scoring'

// ============================================================================
// Human-SL profiles
//   Canonical source: cpp/neuralnet/sgfmetadata.cpp::SGFMetadata::getProfile
//     - `rank_<RANK>` / `preaz_<RANK>`: RANK in {20k..1k, 1d..9d} (29 each)
//     - `proyear_<YEAR>`: integer year in [1800, 2023]
//   The runtime const below is the single source of truth that both the
//   derived literal union AND the type guard consume.
// ============================================================================

export const HUMAN_SL_PROFILES = [
  // rank_ — 20k → 1k (20 entries)
  'rank_20k',
  'rank_19k',
  'rank_18k',
  'rank_17k',
  'rank_16k',
  'rank_15k',
  'rank_14k',
  'rank_13k',
  'rank_12k',
  'rank_11k',
  'rank_10k',
  'rank_9k',
  'rank_8k',
  'rank_7k',
  'rank_6k',
  'rank_5k',
  'rank_4k',
  'rank_3k',
  'rank_2k',
  'rank_1k',
  // rank_ — 1d → 9d (9 entries)
  'rank_1d',
  'rank_2d',
  'rank_3d',
  'rank_4d',
  'rank_5d',
  'rank_6d',
  'rank_7d',
  'rank_8d',
  'rank_9d',
  // preaz_ — 20k → 1k (20 entries)
  'preaz_20k',
  'preaz_19k',
  'preaz_18k',
  'preaz_17k',
  'preaz_16k',
  'preaz_15k',
  'preaz_14k',
  'preaz_13k',
  'preaz_12k',
  'preaz_11k',
  'preaz_10k',
  'preaz_9k',
  'preaz_8k',
  'preaz_7k',
  'preaz_6k',
  'preaz_5k',
  'preaz_4k',
  'preaz_3k',
  'preaz_2k',
  'preaz_1k',
  // preaz_ — 1d → 9d (9 entries)
  'preaz_1d',
  'preaz_2d',
  'preaz_3d',
  'preaz_4d',
  'preaz_5d',
  'preaz_6d',
  'preaz_7d',
  'preaz_8d',
  'preaz_9d',
  // proyear_ — 1800 → 2023 (224 entries)
  'proyear_1800',
  'proyear_1801',
  'proyear_1802',
  'proyear_1803',
  'proyear_1804',
  'proyear_1805',
  'proyear_1806',
  'proyear_1807',
  'proyear_1808',
  'proyear_1809',
  'proyear_1810',
  'proyear_1811',
  'proyear_1812',
  'proyear_1813',
  'proyear_1814',
  'proyear_1815',
  'proyear_1816',
  'proyear_1817',
  'proyear_1818',
  'proyear_1819',
  'proyear_1820',
  'proyear_1821',
  'proyear_1822',
  'proyear_1823',
  'proyear_1824',
  'proyear_1825',
  'proyear_1826',
  'proyear_1827',
  'proyear_1828',
  'proyear_1829',
  'proyear_1830',
  'proyear_1831',
  'proyear_1832',
  'proyear_1833',
  'proyear_1834',
  'proyear_1835',
  'proyear_1836',
  'proyear_1837',
  'proyear_1838',
  'proyear_1839',
  'proyear_1840',
  'proyear_1841',
  'proyear_1842',
  'proyear_1843',
  'proyear_1844',
  'proyear_1845',
  'proyear_1846',
  'proyear_1847',
  'proyear_1848',
  'proyear_1849',
  'proyear_1850',
  'proyear_1851',
  'proyear_1852',
  'proyear_1853',
  'proyear_1854',
  'proyear_1855',
  'proyear_1856',
  'proyear_1857',
  'proyear_1858',
  'proyear_1859',
  'proyear_1860',
  'proyear_1861',
  'proyear_1862',
  'proyear_1863',
  'proyear_1864',
  'proyear_1865',
  'proyear_1866',
  'proyear_1867',
  'proyear_1868',
  'proyear_1869',
  'proyear_1870',
  'proyear_1871',
  'proyear_1872',
  'proyear_1873',
  'proyear_1874',
  'proyear_1875',
  'proyear_1876',
  'proyear_1877',
  'proyear_1878',
  'proyear_1879',
  'proyear_1880',
  'proyear_1881',
  'proyear_1882',
  'proyear_1883',
  'proyear_1884',
  'proyear_1885',
  'proyear_1886',
  'proyear_1887',
  'proyear_1888',
  'proyear_1889',
  'proyear_1890',
  'proyear_1891',
  'proyear_1892',
  'proyear_1893',
  'proyear_1894',
  'proyear_1895',
  'proyear_1896',
  'proyear_1897',
  'proyear_1898',
  'proyear_1899',
  'proyear_1900',
  'proyear_1901',
  'proyear_1902',
  'proyear_1903',
  'proyear_1904',
  'proyear_1905',
  'proyear_1906',
  'proyear_1907',
  'proyear_1908',
  'proyear_1909',
  'proyear_1910',
  'proyear_1911',
  'proyear_1912',
  'proyear_1913',
  'proyear_1914',
  'proyear_1915',
  'proyear_1916',
  'proyear_1917',
  'proyear_1918',
  'proyear_1919',
  'proyear_1920',
  'proyear_1921',
  'proyear_1922',
  'proyear_1923',
  'proyear_1924',
  'proyear_1925',
  'proyear_1926',
  'proyear_1927',
  'proyear_1928',
  'proyear_1929',
  'proyear_1930',
  'proyear_1931',
  'proyear_1932',
  'proyear_1933',
  'proyear_1934',
  'proyear_1935',
  'proyear_1936',
  'proyear_1937',
  'proyear_1938',
  'proyear_1939',
  'proyear_1940',
  'proyear_1941',
  'proyear_1942',
  'proyear_1943',
  'proyear_1944',
  'proyear_1945',
  'proyear_1946',
  'proyear_1947',
  'proyear_1948',
  'proyear_1949',
  'proyear_1950',
  'proyear_1951',
  'proyear_1952',
  'proyear_1953',
  'proyear_1954',
  'proyear_1955',
  'proyear_1956',
  'proyear_1957',
  'proyear_1958',
  'proyear_1959',
  'proyear_1960',
  'proyear_1961',
  'proyear_1962',
  'proyear_1963',
  'proyear_1964',
  'proyear_1965',
  'proyear_1966',
  'proyear_1967',
  'proyear_1968',
  'proyear_1969',
  'proyear_1970',
  'proyear_1971',
  'proyear_1972',
  'proyear_1973',
  'proyear_1974',
  'proyear_1975',
  'proyear_1976',
  'proyear_1977',
  'proyear_1978',
  'proyear_1979',
  'proyear_1980',
  'proyear_1981',
  'proyear_1982',
  'proyear_1983',
  'proyear_1984',
  'proyear_1985',
  'proyear_1986',
  'proyear_1987',
  'proyear_1988',
  'proyear_1989',
  'proyear_1990',
  'proyear_1991',
  'proyear_1992',
  'proyear_1993',
  'proyear_1994',
  'proyear_1995',
  'proyear_1996',
  'proyear_1997',
  'proyear_1998',
  'proyear_1999',
  'proyear_2000',
  'proyear_2001',
  'proyear_2002',
  'proyear_2003',
  'proyear_2004',
  'proyear_2005',
  'proyear_2006',
  'proyear_2007',
  'proyear_2008',
  'proyear_2009',
  'proyear_2010',
  'proyear_2011',
  'proyear_2012',
  'proyear_2013',
  'proyear_2014',
  'proyear_2015',
  'proyear_2016',
  'proyear_2017',
  'proyear_2018',
  'proyear_2019',
  'proyear_2020',
  'proyear_2021',
  'proyear_2022',
  'proyear_2023',
] as const

export type HumanSLProfile = (typeof HUMAN_SL_PROFILES)[number]

const HUMAN_SL_PROFILE_SET: ReadonlySet<string> = new Set(HUMAN_SL_PROFILES)

/**
 * Type guard: returns `true` iff the input is a string and a known
 * Human-SL profile name. Rejects invalid rank strings, out-of-range
 * years, and non-string inputs.
 */
export function isHumanSLProfile(value: unknown): value is HumanSLProfile {
  return typeof value === 'string' && HUMAN_SL_PROFILE_SET.has(value)
}

// ============================================================================
// EngineSettings — user-facing configuration applied to a KataGo instance
// ============================================================================

export interface EngineSettings {
  readonly maxTime: number
  readonly maxVisits: number
  readonly numSearchThreads: number
  readonly chosenMoveTemperature?: number
  readonly wideRootNoise?: number
  readonly rules: Rules
  readonly komi: number
  readonly humanSLProfile?: HumanSLProfile
  readonly boardSize?: number
}

// ============================================================================
// EngineError — discriminated exception for engine-layer failures
// ============================================================================

export type EngineErrorCode = 'ENGINE_OFFLINE' | 'INVALID_RESPONSE' | 'TIMEOUT'

export class EngineError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}
