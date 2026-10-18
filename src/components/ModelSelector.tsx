/*
 * ModelSelector — shared model picker for the settings tabs.
 *
 * Lists KataGo model files found by the bridge (next to the main model)
 * and switches the loaded model for the given target:
 * - 'main'      → respawns both GTP and analysis processes
 * - 'analysis'  → respawns only the analysis process
 *
 * Shows the model filename in the dropdown and the absolute path of the
 * currently loaded model below it.
 */
import { useEffect, useState } from 'react'
import * as katagoAdapter from '../lib/engine/katagoAdapter.ts'
import type { ModelSwitchTarget } from '../lib/engine/katagoAdapter.ts'

export interface ModelSelectorProps {
  target: ModelSwitchTarget
  /** Called after a successful switch (e.g. re-init engine params). */
  onModelChanged?: (() => void | Promise<void>) | undefined
}

const labelStyle: React.CSSProperties = {
  opacity: 0.7,
  minWidth: '80px',
  paddingTop: '6px',
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #3b3b5c',
  borderRadius: '4px',
  background: '#2a2a4e',
  color: '#e0e0e0',
  fontSize: '14px',
  cursor: 'pointer',
  maxWidth: '100%',
}

const idPrefix = (target: ModelSwitchTarget): string =>
  target === 'analysis' ? 'analysis' : 'engine'

export function ModelSelector({ target, onModelChanged }: ModelSelectorProps) {
  const [models, setModels] = useState<readonly katagoAdapter.ModelInfo[] | null>(null)
  const [currentMainPath, setCurrentMainPath] = useState<string | null>(null)
  const [currentAnalysisPath, setCurrentAnalysisPath] = useState<string | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const refresh = async (): Promise<void> => {
    const result = await katagoAdapter.listModels()
    setModels(result.models)
    setCurrentMainPath(result.currentModelPath)
    setCurrentAnalysisPath(result.currentAnalysisModelPath)
  }

  // Load the bridge-side model list once when the form mounts.
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        if (controller.signal.aborted) return
        await refresh()
      } catch (err) {
        if (controller.signal.aborted) return
        setModelsError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => controller.abort()
  }, [])

  const handleModelChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ): Promise<void> => {
    const modelPath = e.currentTarget.value
    setSwitching(true)
    setModelsError(null)
    try {
      await katagoAdapter.switchModel(modelPath, target)
      await onModelChanged?.()
      await refresh()
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err))
    } finally {
      setSwitching(false)
    }
  }

  const currentPath = target === 'analysis' ? currentAnalysisPath : currentMainPath
  const prefix = idPrefix(target)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <label htmlFor={`${prefix}-model-select`} style={labelStyle}>
        모델
      </label>
      <div
        id={`${prefix}-model-section`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: 1,
          minWidth: 0,
        }}
      >
        {models !== null && models.length > 0 ? (
          <select
            id={`${prefix}-model-select`}
            value={currentPath ?? ''}
            onChange={(e) => void handleModelChange(e)}
            disabled={switching}
            style={{
              ...selectStyle,
              opacity: switching ? 0.5 : 1,
            }}
          >
            {models.map((m) => (
              <option key={m.path} value={m.path}>
                {m.name}
              </option>
            ))}
          </select>
        ) : models !== null ? (
          <span style={{ opacity: 0.6, fontSize: '12px' }}>
            사용 가능한 모델 파일이 없습니다.
          </span>
        ) : null}
        {currentPath !== null && (
          <span
            id={`${prefix}-model-path`}
            style={{ opacity: 0.55, fontSize: '11px', wordBreak: 'break-all' }}
            title="현재 로드된 모델 절대경로"
          >
            {currentPath}
          </span>
        )}
        {switching && (
          <span style={{ fontSize: '12px', color: '#7aa5e0' }}>
            모델 교체 중… (엔진 재시작, 몇 초 걸립니다)
          </span>
        )}
        {modelsError !== null && (
          <span style={{ color: '#e74c3c', fontSize: '11px' }}>
            {modelsError}
          </span>
        )}
      </div>
    </div>
  )
}
