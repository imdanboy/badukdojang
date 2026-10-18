import * as React from 'react'
import type { AnalyzeResponse } from '../lib/engine/types.ts'
import type { AnalysisSettings } from '../lib/engineSettings.ts'
import type { AnalysisMetadata } from '../lib/analysisSgf.ts'

interface AnalysisSummaryProps {
  analysis: AnalyzeResponse | null
  loading: boolean
  error: string | null
  durationMs: number | null
  settings: AnalysisSettings
  /** Provenance of an SGF-embedded analysis run (KAM), if present. */
  metadata?: AnalysisMetadata | null | undefined
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '13px',
  width: '100%',
  maxWidth: '600px',
}

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '15px',
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '12px',
  fontVariantNumeric: 'tabular-nums',
}

function formatDuration(durationMs: number | null): string {
  return durationMs === null ? '—' : `${(durationMs / 1000).toFixed(2)}초`
}

function formatVisits(visits: number | undefined): string {
  return visits === undefined ? '—' : visits.toLocaleString()
}

export function AnalysisSummary({
  analysis,
  loading,
  error,
  durationMs,
  settings,
  metadata,
}: AnalysisSummaryProps) {
  return (
    <div style={panelStyle} id="analysis-summary">
      <span style={titleStyle}>분석 요약</span>
      {metadata !== null && metadata !== undefined && (
        <div
          id="analysis-metadata"
          style={{
            fontSize: '11px',
            lineHeight: 1.5,
            opacity: 0.75,
            background: '#16162a',
            borderRadius: '4px',
            padding: '6px 8px',
          }}
        >
          불러온 분석 — 모델: {metadata.analysisModel || '알 수 없음'}
          {metadata.maxVisits > 0 && ` · 방문 한도 ${metadata.maxVisits.toLocaleString()}`}
          {metadata.date !== '' && ` · ${metadata.date.slice(0, 10)}`}
          <br />
          엔진 {metadata.engine || '알 수 없음'}
          {metadata.numSearchThreads > 0 && ` · 스레드 ${metadata.numSearchThreads}`}
        </div>
      )}
      <div style={rowStyle}>
        <span>분석 시간</span>
        <span>{formatDuration(durationMs)}</span>
      </div>
      <div style={rowStyle}>
        <span>총 방문 수</span>
        <span>{formatVisits(analysis?.visits)}</span>
      </div>
      <div style={rowStyle}>
        <span>분석 스레드</span>
        <span>{settings.numSearchThreads}</span>
      </div>
      <div style={rowStyle}>
        <span>탐색 한도</span>
        <span>
          {settings.maxVisits?.toLocaleString() ?? '—'}회 / {settings.maxTime ?? '—'}초
        </span>
      </div>
      {loading && <span style={{ opacity: 0.65 }}>분석 중…</span>}
      {error !== null && <span style={{ color: '#e06666' }}>{error}</span>}
    </div>
  )
}
