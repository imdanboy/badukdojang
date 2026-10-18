// ============================================================================
// src/lib/analysisSgf.ts
// SGF (KA) analysis serialization.
//
// Analysis results persist into the SGF file as a custom property so saved
// games reopen with their analysis intact (other SGF editors simply ignore
// the property). Two properties are used:
//
//   KA (per move node)  — one position's result, compressed JSON:
//       { "w": winrate, "s": scoreLead, "v": visits,
//         "m": [{ "m": move, "w": winrate, "s": scoreLead, "v": visits }],
//         "o": ownership string }
//     Follows the Kaya `KA` convention; `o` packs the 19x19 ownership
//     floats into 19x19 chars (level = round(v * 9) + 9 → 'A'..'S').
//
//   KAM (root node) — provenance metadata, plain JSON:
//       { engine, model, analysisModel, maxVisits, maxTime,
//         numSearchThreads, komi, rules, date }
//     Written once per game; lets the reader judge how much to trust the
//     embedded results (a b6c96/50-visit analysis ≠ b18c384/800-visit).
// ============================================================================

import type { AnalyzeResponse } from './engine/types.ts'

// --- Ownership codec ---------------------------------------------------------

/** Quantization levels per side (value → round(v * 9) + 9 → 0..18). */
const OWNERSHIP_LEVELS = 9
const OWNERSHIP_CHAR_BASE = 65 // 'A'

/** Encode a flat ownership array into 19x19 SGF-safe chars ('A'..'S'). */
export function encodeOwnership(ownership: readonly number[]): string {
  let out = ''
  for (let i = 0; i < ownership.length; i++) {
    const v = Math.max(-1, Math.min(1, ownership[i] ?? 0))
    out += String.fromCharCode(OWNERSHIP_CHAR_BASE + Math.round(v * OWNERSHIP_LEVELS) + OWNERSHIP_LEVELS)
  }
  return out
}

/** Decode an ownership string back into a flat float array. */
export function decodeOwnership(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const level = s.charCodeAt(i) - OWNERSHIP_CHAR_BASE - OWNERSHIP_LEVELS
    out.push(level / OWNERSHIP_LEVELS)
  }
  return out
}

// --- KA (per-position) --------------------------------------------------------

/** Compressed KA JSON (Kaya-compatible short keys). */
interface KaData {
  w: number
  s: number
  v?: number
  m?: Array<{
    m: string
    w?: number
    s?: number
    v?: number
  }>
  o?: string
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Serialize an analysis response into the KA property value. */
export function analysisToKa(analysis: AnalyzeResponse): string {
  const ka: KaData = {
    w: round3(analysis.winrate ?? 0),
    s: round3(analysis.scoreLead ?? 0),
  }
  if (analysis.visits !== undefined) ka.v = analysis.visits
  if (analysis.bestMoves !== undefined && analysis.bestMoves.length > 0) {
    ka.m = analysis.bestMoves.map((bm) => ({
      m: bm.move,
      w: round3(bm.winrate),
      s: round3(bm.scoreLead),
      v: bm.visits,
    }))
  }
  if (analysis.ownership !== undefined && analysis.ownership.length > 0) {
    ka.o = encodeOwnership(analysis.ownership)
  }
  return JSON.stringify(ka)
}

/** Parse a KA property value back into an analysis response. Null on garbage. */
export function analysisFromKa(ka: string | undefined | null): AnalyzeResponse | null {
  if (ka === undefined || ka === null || ka === '') return null
  try {
    const raw = JSON.parse(ka) as KaData
    if (typeof raw.w !== 'number' || typeof raw.s !== 'number') return null
    return {
      id: 'ka',
      winrate: raw.w,
      scoreLead: raw.s,
      ...(raw.v !== undefined ? { visits: raw.v } : {}),
      ...(raw.o !== undefined ? { ownership: decodeOwnership(raw.o) } : {}),
      ...(raw.m !== undefined
        ? {
            bestMoves: raw.m.map((m) => ({
              move: m.m,
              visits: m.v ?? 0,
              winrate: m.w ?? 0,
              scoreLead: m.s ?? 0,
            })),
          }
        : {}),
    }
  } catch {
    return null
  }
}

// --- KAM (root provenance metadata) -------------------------------------------

/**
 * Provenance of an embedded analysis run — what produced it, with what
 * budget, when. Lets a reader judge (and the app invalidate) trust.
 */
export interface AnalysisMetadata {
  /** Engine build string, e.g. "1.16.4+g170-b15c192-s1672M+...". */
  readonly engine: string
  /** Main (play) model file name. */
  readonly model: string
  /** Analysis engine's model file name. */
  readonly analysisModel: string
  readonly maxVisits: number
  readonly maxTime: number
  readonly numSearchThreads: number
  readonly komi: number
  readonly rules: string
  /** ISO date of the analysis run. */
  readonly date: string
}

export function metadataToSgf(metadata: AnalysisMetadata): string {
  return JSON.stringify(metadata)
}

export function metadataFromSgf(raw: string | undefined | null): AnalysisMetadata | null {
  if (raw === undefined || raw === null || raw === '') return null
  try {
    const m = JSON.parse(raw) as Partial<AnalysisMetadata>
    if (
      typeof m.engine !== 'string' ||
      typeof m.analysisModel !== 'string' ||
      typeof m.maxVisits !== 'number'
    ) {
      return null
    }
    return {
      engine: m.engine,
      model: m.model ?? '',
      analysisModel: m.analysisModel,
      maxVisits: m.maxVisits,
      maxTime: m.maxTime ?? 0,
      numSearchThreads: m.numSearchThreads ?? 1,
      komi: m.komi ?? 0,
      rules: m.rules ?? '',
      date: m.date ?? '',
    }
  } catch {
    return null
  }
}
