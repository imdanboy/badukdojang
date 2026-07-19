import type { ComputedScore } from '../lib/scoring.ts'

export interface ScoringModalProps {
  score: ComputedScore
  onAccept: () => void
  onCancel: () => void
}

export function ScoringModal({ score, onAccept, onCancel }: ScoringModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: '12px',
          padding: '24px 32px',
          minWidth: '280px',
          maxWidth: '90vw',
          color: '#e0e0e0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid #3b3b5c',
          pointerEvents: 'auto',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '20px',
            textAlign: 'center',
            color: '#f0f0f0',
          }}
        >
          계가 결과
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 24px',
            marginBottom: '16px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
              흑
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {score.blackTerritory + score.blackStonesOnBoard}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>
              집 {score.blackTerritory} + 돌 {score.blackStonesOnBoard}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
              백
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {score.whiteTerritory + score.whiteStonesOnBoard}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>
              집 {score.whiteTerritory} + 돌 {score.whiteStonesOnBoard}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderTop: '1px solid #3b3b5c',
            borderBottom: '1px solid #3b3b5c',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          <span>덤 (komi)</span>
          <span>{score.komi.toFixed(1)}</span>
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: '22px',
            fontWeight: 700,
            color: score.margin > 0 ? '#8ab4f8' : score.margin < 0 ? '#f28b82' : '#e0e0e0',
            marginBottom: '20px',
          }}
        >
          {score.resultText}
        </div>

        <div
          style={{
            fontSize: '12px',
            opacity: 0.7,
            textAlign: 'center',
            marginBottom: '16px',
          }}
        >
          바둑판의 돌을 클릭하면 사활을 수동으로 변경할 수 있습니다.
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              background: '#3b3b5c',
              color: '#e0e0e0',
            }}
          >
            취소
          </button>
          <button
            onClick={onAccept}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              background: '#5a7fb5',
              color: '#fff',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
