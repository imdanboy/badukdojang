/*
 * EngineErrorModal — full-screen engine failure dialog with retry.
 */
import type { EngineError } from '../lib/engine/types.ts'

export interface EngineErrorModalProps {
  error: EngineError
  isRestarting: boolean
  onRestart: () => void
  onDismiss: () => void
}

export function EngineErrorModal({
  error,
  isRestarting,
  onRestart,
  onDismiss,
}: EngineErrorModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          color: '#e0e0e0',
          padding: '24px',
          borderRadius: '12px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          border: '1px solid #3b3b5c',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>엔진 오류</h3>
        <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.5 }}>
          {error.code === 'ENGINE_OFFLINE'
            ? '엔진 연결 실패'
            : error.code === 'TIMEOUT'
              ? '엔진 응답 시간 초과'
              : '엔진 응답 오류'}
          <br />
          <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
            {error.message}
          </span>
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #3b3b5c',
              background: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            닫기
          </button>
          <button
            onClick={onRestart}
            disabled={isRestarting}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#4a9eff',
              color: '#fff',
              cursor: isRestarting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isRestarting ? 0.6 : 1,
            }}
          >
            {isRestarting ? '재시작 중...' : '재시작'}
          </button>
        </div>
      </div>
    </div>
  )
}
