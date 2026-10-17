/*
 * AiAnalysisPanel — shows the last AI opponent's search metadata.
 *
 * Displayed only in AI game mode while the user has toggled it on.
 * Values come from the engine settings actually used for the AI's
 * last `genmove` request plus the measured request duration.
 */
import type { EngineSettings } from '../lib/engine/types.ts'

export interface AiMoveStats {
  /** Time between sending the genmove request and receiving the move, in ms. */
  readonly durationMs: number
  /** Engine settings snapshot used for that move. */
  readonly settings: Pick<
    EngineSettings,
    'maxVisits' | 'maxTime' | 'numSearchThreads'
  >
  /** 1-based move number in the game tree when the AI played. */
  readonly moveNumber: number
}

export interface AiAnalysisPanelProps {
  stats: AiMoveStats | null
  isThinking: boolean
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 16px',
  background: '#1a1a2e',
  borderRadius: '8px',
  color: '#e0e0e0',
  fontSize: '13px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const labelStyle: React.CSSProperties = {
  opacity: 0.7,
}

const valueStyle: React.CSSProperties = {
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
}

export function AiAnalysisPanel({ stats, isThinking }: AiAnalysisPanelProps) {
  return (
    <div id="ai-analysis-panel" style={panelStyle}>
      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
        AI 분석 정보
      </div>

      {isThinking && (
        <div style={{ ...rowStyle, justifyContent: 'flex-start', gap: '8px' }}>
          <span className="ai-thinking-spinner" style={{ opacity: 0.8 }}>
            ◐
          </span>
          <span>AI가 수를 계산 중입니다…</span>
        </div>
      )}

      {!isThinking && stats === null && (
        <div style={{ opacity: 0.6 }}>아직 AI가 수를 두지 않았습니다.</div>
      )}

      {!isThinking && stats !== null && (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>착수</span>
            <span style={valueStyle}>{stats.moveNumber}수</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>분석 시간</span>
            <span style={valueStyle}>{(stats.durationMs / 1000).toFixed(2)}초</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>총 방문 수</span>
            <span style={valueStyle}>{stats.settings.maxVisits.toLocaleString()}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>분석 스레드</span>
            <span style={valueStyle}>{stats.settings.numSearchThreads}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>탐색 한도</span>
            <span style={valueStyle}>{stats.settings.maxTime}초</span>
          </div>
        </>
      )}
    </div>
  )
}
