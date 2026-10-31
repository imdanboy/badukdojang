import * as React from 'react'
/*
 * AnalysisPanel - Real-time position analysis display.
 * Sits below the board. Shows:
 *   - Winrate: Black's winrate as a horizontal bar with a 50% center marker.
 *   - Score lead: estimated territory difference ("집 차이: 흑 +5.3" or
 *     "백 +2.1") using `scoreLead` from the KataGo analysis response.
 *
 * Fetches are driven by the parent (App.tsx) via katagoAdapter.requestAnalysis
 * after every move; this component is purely presentational.
 *
 * Design system: matches EngineSettings / ControlBar dark theme.
 *   panel bg #1a1a2e, border #3b3b5c, accent #5a7fb5, text #e0e0e0.
 */
import type { AnalyzeResponse } from '../lib/engine/types.ts'

export interface AnalysisPanelProps {
  /** Latest analysis response, or null when none available yet. */
  analysis: AnalyzeResponse | null
  /** True while a fetch is in-flight. */
  loading: boolean
  /** Error message from the last fetch, or null. */
  error: string | null
  /** Whether the engine is enabled. When off, the panel is dormant. */
  engineEnabled: boolean
  /** Vertical board-side display on desktop; horizontal panel on narrow layouts. */
  orientation?: 'horizontal' | 'vertical'
}

// --- Style helpers (match EngineSettings / ControlBar design system) --------

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '14px',
  width: '100%',
  maxWidth: '600px',
}

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '15px',
}

const barContainerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  height: '24px',
  borderRadius: '4px',
  overflow: 'hidden',
  border: '1px solid #3b3b5c',
}

const blackFillStyle = (pct: number): React.CSSProperties => ({
  width: `${pct}%`,
  background: '#1a1a1a',
  transition: 'width 0.3s ease',
})

const whiteFillStyle = (pct: number): React.CSSProperties => ({
  width: `${pct}%`,
  background: '#e8e8e8',
  transition: 'width 0.3s ease',
})

const centerMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '50%',
  width: '2px',
  background: '#5a7fb5',
  transform: 'translateX(-50%)',
  zIndex: 2,
}

const legendStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '12px',
  opacity: 0.8,
}

const mutedStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: '13px',
}

const scoreLeadStyle: React.CSSProperties = {
  fontSize: '13px',
  fontVariantNumeric: 'tabular-nums',
}

// --- Helpers ---------------------------------------------------------------

/**
 * Extract Black's winrate (0-1) from an AnalyzeResponse.
 * The bridge surfaces `rootInfo.winrate` as the top-level `winrate` field,
 * already in Black's perspective. Returns null when absent or NaN.
 */
export function getBlackWinrate(analysis: AnalyzeResponse | null): number | null {
  if (analysis === null) return null
  const wr = analysis.winrate
  if (typeof wr !== 'number' || Number.isNaN(wr)) return null
  return wr
}

/** Format a 0-1 winrate as a percentage string with one decimal, e.g. 0.532 → "53.2". */
export function formatWinratePct(winrate: number): string {
  return (winrate * 100).toFixed(1)
}

/**
 * Extract the raw `scoreLead` value (territory difference in points) from
 * an AnalyzeResponse. Returns null when absent, NaN, or non-finite.
 *
 * Convention: positive = Black ahead, negative = White ahead.
 */
export function getScoreLead(analysis: AnalyzeResponse | null): number | null {
  if (analysis === null) return null
  const sl = analysis.scoreLead
  if (typeof sl !== 'number' || !Number.isFinite(sl)) return null
  return sl
}

/**
 * Format a `scoreLead` value as a Korean territory-difference label.
 *
 *   formatScoreLead(5.3)  -> "흑 +5.3"
 *   formatScoreLead(-2.1) -> "백 +2.1"
 *   formatScoreLead(0)    -> "0.0"
 *   formatScoreLead(NaN)  -> "—"
 */
export function formatScoreLead(scoreLead: number): string {
  if (!Number.isFinite(scoreLead)) return '—'
  if (scoreLead > 0) return `흑 +${scoreLead.toFixed(1)}`
  if (scoreLead < 0) return `백 +${Math.abs(scoreLead).toFixed(1)}`
  return '0.0'
}

// --- Component -------------------------------------------------------------

export function AnalysisPanel({
  analysis,
  loading,
  error,
  engineEnabled,
  orientation = 'horizontal',
}: AnalysisPanelProps) {
  const blackWinrate = getBlackWinrate(analysis)
  const hasWinrate = engineEnabled && blackWinrate !== null && error === null
  const blackPct = hasWinrate ? Number(formatWinratePct(blackWinrate)) : 50
  const whitePct = 100 - blackPct
  const scoreLead = engineEnabled && error === null ? getScoreLead(analysis) : null

  if (orientation === 'vertical') {
    const scoreLabel =
      scoreLead === null || scoreLead === 0
        ? ''
        : `; ${scoreLead > 0 ? '흑' : '백'} ${Math.abs(scoreLead).toFixed(1)}집 우세`
    const state = !engineEnabled
      ? 'disabled'
      : error !== null
        ? 'error'
        : loading
          ? 'loading'
          : hasWinrate
            ? 'ready'
            : 'idle'

    return (
      <div
        className="analysis-panel-vertical"
        id="winrate-board-panel"
        data-state={state}
        role="img"
        aria-label={`흑 승률 ${hasWinrate ? `${blackPct.toFixed(1)}%` : '—'}, 백 승률 ${hasWinrate ? `${whitePct.toFixed(1)}%` : '—'}${scoreLabel}`}
        title={error ?? undefined}
      >
        <div className="winrate-vertical-track" id="winrate-vertical-bar">
          <div
            className="winrate-vertical-black"
            style={{ height: `${blackPct}%` }}
            data-winrate={hasWinrate ? blackPct : undefined}
          />
          <div
            className="winrate-vertical-white"
            style={{ height: `${whitePct}%` }}
            data-winrate={hasWinrate ? whitePct : undefined}
          />
          {scoreLead !== null && scoreLead > 0 && (
            <span className="winrate-vertical-score winrate-vertical-score-black">
              {scoreLead.toFixed(1)}
            </span>
          )}
          {scoreLead !== null && scoreLead < 0 && (
            <span className="winrate-vertical-score winrate-vertical-score-white">
              {Math.abs(scoreLead).toFixed(1)}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (!engineEnabled) {
    return (
      <div className="analysis-panel-horizontal" style={panelStyle} id="analysis-panel" data-state="disabled">
        <span style={titleStyle}>승률</span>
        <span style={mutedStyle}>승률 분석을 위해 엔진을 켜주세요.</span>
      </div>
    )
  }

  const scoreLeadText = scoreLead === null ? '—' : formatScoreLead(scoreLead)

  if (!hasWinrate && !loading && error === null) {
    return (
      <div className="analysis-panel-horizontal" style={panelStyle} id="analysis-panel" data-state="idle">
        <span style={titleStyle}>승률</span>
        <span style={mutedStyle}>분석 대기 중…</span>
        <span id="score-lead">집 차이: —</span>
      </div>
    )
  }

  return (
    <div className="analysis-panel-horizontal" style={panelStyle} id="analysis-panel" data-state="ready">
      <span style={titleStyle} id="winrate-label">
        승률
      </span>

      <div style={barContainerStyle} id="winrate-bar">
        <div
          style={blackFillStyle(blackPct)}
          id="winrate-bar-black"
          aria-hidden="true"
        />
        <div
          style={whiteFillStyle(whitePct)}
          id="winrate-bar-white"
          aria-hidden="true"
        />
        <div style={centerMarkerStyle} aria-hidden="true" />
      </div>

      <div style={legendStyle}>
        <span>흑</span>
        <span>백</span>
      </div>

      <div style={scoreLeadStyle} id="score-lead">
        집 차이: {error !== null ? '—' : scoreLeadText}
      </div>

      {loading && (
        <span style={mutedStyle} id="winrate-loading">
          분석 중…
        </span>
      )}
      {error !== null && (
        <span
          style={{ ...mutedStyle, color: '#e06666' }}
          id="winrate-error"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}
