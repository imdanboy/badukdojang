/*
 * ScreenshotImportModal — 스크린샷 이어하기.
 *
 * 흐름:
 *   choose  : 파일 선택 / 드래그&드롭 / 클립보드 붙여넣기
 *   analyzing: recognizeScreenshot (자동 격자 감지 + 돌 분류)
 *   manual  : 자동 감지 실패 → 스크린샷의 최외곽 교차점 4곳을 클릭 →
 *             크기 선택 → recognizeWithManualCorners
 *   review  : 감지 국면 프리뷰 + 교차점 클릭 토글 보정(힌트 재분류) → 이어하기
 *
 * 결과는 setup SGF(AB/AW) → onImport 로 전달되어 createGameState 로 이어진다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RawImage, BoardCorners, CalibrationHint, DetectedStone } from '@kaya/board-recognition'
import { Modal } from './Modal.tsx'
import { decodeToRawImage } from '../lib/imageDecode.ts'
import {
  recognizeScreenshot,
  recognizeWithManualCorners,
  reclassifyWithHintOverrides,
  stonesToSGF,
  type ScreenshotRecognitionResult,
} from '../lib/screenshotRecognition.ts'

interface ScreenshotImportModalProps {
  title: string
  onClose: () => void
  /** 이어하기 확정 — setup SGF 와 현(盤) 크기 전달. */
  onImport: (sgf: string, boardSize: number, nextTurn: 'B' | 'W') => void
}

type Phase =
  | { kind: 'choose' }
  | { kind: 'analyzing'; raw: RawImage; objectUrl: string; imgW: number; imgH: number }
  | {
      kind: 'manual'
      raw: RawImage
      objectUrl: string
      imgW: number
      imgH: number
      /** 클릭된 격자 끝 교차점 (이미지 좌표) — 4개 되면 진행. */
      points: [number, number][]
      sizeChoice: 9 | 13 | 19
    }
  | {
      kind: 'review'
      raw: RawImage
      objectUrl: string
      imgW: number
      imgH: number
      result: ScreenshotRecognitionResult
      hints: CalibrationHint[]
    }
  | { kind: 'error'; message: string; objectUrl?: string }

export function ScreenshotImportModal(props: ScreenshotImportModalProps) {
  const { onClose, onImport, title } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nextTurnRef = useRef<'B' | 'W'>('B')

  // --- 붙여넣기/드래그 (choose & manual 단계에서 활성) ---------------------------

  const activeForInput =
    phase.kind === 'choose' || phase.kind === 'manual' || phase.kind === 'error'

  useEffect(() => {
    if (!activeForInput) return
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file != null) void startAnalyses(file)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file != null) void startAnalyses(file)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    window.addEventListener('paste', onPaste)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeForInput])

  // --- 이미지 수신 → 인식 --------------------------------------------------------

  async function startAnalyses(file: Blob): Promise<void> {
    const objectUrl = URL.createObjectURL(file)
    try {
      const raw = await decodeToRawImage(file)
      setPhase({ kind: 'analyzing', raw, objectUrl, imgW: raw.width, imgH: raw.height })
      // 메인 스레드 yield — setState 가 반영되어 로딩 UI 가 그려진 후 실행
      await new Promise<void>((r) => setTimeout(r, 30))
      const res = recognizeScreenshot(raw)
      if (res == null) {
        setPhase({ kind: 'manual', raw, objectUrl, imgW: raw.width, imgH: raw.height, points: [], sizeChoice: 19 })
      } else {
        setPhase({ kind: 'review', raw, objectUrl, imgW: raw.width, imgH: raw.height, result: res, hints: [] })
      }
    } catch {
      setPhase({
        kind: 'error',
        message: '이미지를 읽지 못했습니다.',
        objectUrl,
      })
    }
  }

  // --- 수동 4코너 ----------------------------------------------------------------

  function handleManualClick(x: number, y: number): void {
    if (phase.kind !== 'manual') return
    const points = [...phase.points, [x, y] as [number, number]].slice(-3 - 1)
    if (points.length >= 4) {
      // TL, TR, BR, BL 로 클릭 정렬한다 (드래그 순서 무시)
      const corners = orderCornersClient(points)
      const res = recognizeWithManualCorners(phase.raw, phase.sizeChoice, corners)
      setPhase({ kind: 'review', raw: phase.raw, objectUrl: phase.objectUrl, imgW: phase.imgW, imgH: phase.imgH, result: res, hints: [] })
    } else {
      setPhase({ ...phase, points: points as [number, number][] })
    }
  }

  // --- review 단계 보정/이어하기 ---------------------------------------------------

  const [reclassifying, setReclassifying] = useState(false)

  async function handleToggleVertex(x: number, y: number): Promise<void> {
    if (phase.kind !== 'review') return
    const current = new Map<string, DetectedStone>()
    for (const s of phase.result.stones) current.set(`${s.x},${s.y}`, s)
    const cur = current.get(`${x},${y}`)
    // 교차점 클릭: 빈 → 흑 → 백 → 빈 순환
    const next: 'black' | 'white' | 'empty' =
      cur == null ? 'black' : cur.color === 'black' ? 'white' : 'empty'

    const hints = [...phase.hints.filter((h) => !(h.x === x && h.y === y))]
    if (next !== 'empty') hints.push({ x, y, color: next } as CalibrationHint)
    // 즉시 해당 교차점엔 반영
    const edited = [...phase.result.stones.filter((s) => !(s.x === x && s.y === y))]
    if (next !== 'empty') edited.push({ x, y, color: next } as DetectedStone)
    setPhase({ ...phase, result: { ...phase.result, stones: edited } })
    void reclassifyWith(hints)
  }

  async function reclassifyWith(hints: CalibrationHint[]): Promise<void> {
    if (phase.kind !== 'review') return
    setReclassifying(true)
    try {
      // 프레임 하나 양보 후 재분류
      await new Promise<void>((r) => setTimeout(r, 10))
      const n = phase.result.boardSize
      const res = reclassifyWithHintOverrides(phase.raw, n, phase.result.gridCorners, hints)
      setPhase((ph) => (ph.kind === 'review' ? { ...ph, result: res, hints } : ph))
    } finally {
      setReclassifying(false)
    }
  }

  function confirmImport(): void {
    if (phase.kind !== 'review') return
    const sgf = stonesToSGF(phase.result.boardSize, phase.result.stones)
    onImport(sgf, phase.result.boardSize, nextTurnRef.current)
  }

  function resetAll(): void {
    setPhase({ kind: 'choose' })
    if (fileInputRef.current != null) fileInputRef.current.value = ''
  }

  // --- 렌더 -----------------------------------------------------------------------

  const body = useMemo(() => {
    switch (phase.kind) {
      case 'choose':
        return (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, opacity: 0.85 }}>
              진행 중인 대국의 스크린샷을 넣으면 바둑판을 읽어 그 국면에서 이어둡니다.
            </p>
            <button
              type="button"
              id="screenshot-pick"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.08)',
                color: 'inherit',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              이미지 선택 (또는 드래그 / Cmd+V 붙여넣기)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f != null) void startAnalyses(f)
              }}
            />
          </div>
        )
      case 'analyzing':
        return (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ margin: 0 }}>바둑판 읽는 중…</p>
          </div>
        )
      case 'manual': {
        const { points, imgW, imgH } = phase
        return (
          <ManualCornerView
            objectUrl={phase.objectUrl}
            imgW={imgW}
            imgH={imgH}
            points={points}
            sizeChoice={phase.sizeChoice}
            onSizeChange={(sizeChoice) => {
              if (phase.kind === 'manual') setPhase({ ...phase, sizeChoice })
            }}
            onClickImage={handleManualClick}
          />
        )
      }
      case 'review': {
        const res = phase.result
        return (
          <div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
                fontSize: 13,
                opacity: 0.9,
              }}
            >
              <span>
                {res.boardSize}x{res.boardSize}
              </span>
              <span>흑 {res.blackCount}</span>
              <span>백 {res.whiteCount}</span>
              <span>{res.autoDetected ? `자동 감지 신뢰도 ${(res.confidence * 100).toFixed(0)}%` : '수동 지정'}</span>
              {reclassifying ? <span>재분류 중…</span> : null}
            </div>
            <EditBoard
              boardSize={res.boardSize}
              stones={res.stones}
              onToggle={(x, y) => void handleToggleVertex(x, y)}
            />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
                fontSize: 12,
                opacity: 0.8,
              }}
            >
              <span>교차점을 클릭하면 빈/흑/백 순환 보정됩니다.</span>
              <span
                style={{
                  display: 'inline-flex',
                  gap: 6,
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  padding: '2px 8px',
                }}
              >
                다음:
                <select
                  id="screenshot-next-turn"
                  defaultValue="B"
                  onChange={(e) => {
                    nextTurnRef.current = e.target.value === 'W' ? 'W' : 'B'
                  }}
                >
                  <option value="B">흑</option>
                  <option value="W">백</option>
                </select>
              </span>
            </div>
          </div>
        )
      }
      case 'error':
        return (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <p style={{ color: '#e06c75', margin: '0 0 12px' }}>{phase.message}</p>
          </div>
        )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reclassifying])

  const footer: React.ReactNode = (() => {
    const restartBtn = (
      <button type="button" className="modal-secondary" onClick={resetAll}>
        다시 선택
      </button>
    )
    const confirmBtn =
      phase.kind === 'review' ? (
        <button
          type="button"
          id="screenshot-import-confirm"
          onClick={confirmImport}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#4f8cff',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          이어하기
        </button>
      ) : null
    return (
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          padding: '12px 0 2px',
        }}
      >
        {phase.kind !== 'choose' ? restartBtn : null}
        {confirmBtn}
      </div>
    )
  })()

  return (
    <Modal title={title} onClose={onClose} closeButtonId="screenshot-import-close">
      {body}
      {footer}
    </Modal>
  )
}

function orderCornersClient(points: [number, number][]): BoardCorners {
  // 클릭 안내(TL→TR→BR→BL 순)지만 흔히 섞이므로 위치 기반으로 정규화한다.
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length
  const withAngle = points.map((p) => ({ p, a: Math.atan2(p[1] - cy, p[0] - cx) }))
  withAngle.sort((x, y) => x.a - y.a)
  let tlIdx = 0
  let minSum = Infinity
  for (let i = 0; i < withAngle.length; i++) {
    const s2 = withAngle[i]!.p[0] + withAngle[i]!.p[1]
    if (s2 < minSum) {
      minSum = s2
      tlIdx = i
    }
  }
  const out: [number, number][] = []
  for (let i = 0; i < 4; i++) out.push(withAngle[(tlIdx + i) % 4]!.p)
  return [out[0], out[1], out[2], out[3]] as BoardCorners
}

// ============================================================================
// 수동 4코너 지정 뷰
// ============================================================================

function ManualCornerView(props: {
  objectUrl: string
  imgW: number
  imgH: number
  points: [number, number][]
  sizeChoice: 9 | 13 | 19
  onSizeChange: (v: 9 | 13 | 19) => void
  onClickImage: (x: number, y: number) => void
}) {
  const { objectUrl, imgW, imgH, points, sizeChoice, onSizeChange, onClickImage } = props
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.85 }}>
        자동 감지 실패 — 스크린샷 격자의 끝 서로를 순서대로 클릭하세요 ({points.length}/4)
      </p>
      <svg
        id="manual-corner-view"
        viewBox={`0 0 ${imgW} ${imgH}`}
        style={{ maxWidth: '100%', maxHeight: 380, cursor: 'crosshair', border: '1px solid rgba(255,255,255,0.2)' }}
        onClick={(e) => {
          const svg = e.currentTarget
          const rect = svg.getBoundingClientRect()
          const scale = Math.min(rect.width / imgW, rect.height / imgH)
          const dispW = imgW * scale
          const dispH = imgH * scale
          const offsetX = (rect.width - dispW) / 2
          const offsetY = (rect.height - dispH) / 2
          const x = ((e.clientX - rect.left - offsetX) / scale) | 0
          const y = ((e.clientY - rect.top - offsetY) / scale) | 0
          onClickImage(x, y)
        }}
      >
        <image href={objectUrl} width={imgW} height={imgH} />
        {points.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={Math.max(imgW, imgH) * 0.012} fill="rgba(0,140,255,0.8)" stroke="#fff" strokeWidth={2} />
        ))}
      </svg>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        판 크기:
        <select
          id="manual-size"
          value={sizeChoice}
          onChange={(e) => onSizeChange(Number(e.target.value) as 9 | 13 | 19)}
          style={{ marginLeft: 6 }}
        >
          {([19, 13, 9] as const).map((v) => (
            <option key={v} value={v}>
              {v}x{v}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ============================================================================
// 보정 가능한 미니 보드 (SVG)
// ============================================================================

const BOARD_PX = 320

function EditBoard(props: {
  boardSize: number
  stones: DetectedStone[]
  onToggle: (x: number, y: number) => void
}) {
  const { boardSize: n, stones, onToggle } = props
  const stoneAt = useMemo(() => {
    const m = new Map<string, 1 | 2>()
    for (const s of stones) m.set(`${s.x},${s.y}`, s.color === 'black' ? 1 : 2)
    return m
  }, [stones])
  const span = BOARD_PX / n
  const size = span * n
  const lines: React.ReactNode[] = []
  for (let i = 0; i < n; i++) {
    lines.push(
      <line
        key={`v${i}`}
        x1={span / 2 + i * span}
        y1={span / 2}
        x2={span / 2 + i * span}
        y2={size - span / 2}
        stroke="rgba(60,40,15,0.85)"
        strokeWidth={1.4}
      />,
      <line
        key={`h${i}`}
        x1={span / 2}
        y1={span / 2 + i * span}
        x2={size - span / 2}
        y2={span / 2 + i * span}
        stroke="rgba(60,40,15,0.85)"
        strokeWidth={1.4}
      />,
    )
  }
  const cells: React.ReactNode[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const s = stoneAt.get(`${x},${y}`)
      const cx = span / 2 + x * span
      const cy = span / 2 + y * span
      cells.push(
        <g key={`${x},${y}`} onClick={() => onToggle(x, y)} style={{ cursor: 'pointer' }}>
          <rect x={cx - span / 2} y={cy - span / 2} width={span} height={span} fill="transparent" />
          {s == null ? null : (
            <circle cx={cx} cy={cy} r={span * 0.42} fill={s === 1 ? '#141414' : '#f5f2ea'} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
          )}
        </g>,
      )
    }
  }
  return (
    <svg
      width={size}
      height={size}
      style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }}
    >
      <rect x={0} y={0} width={size} height={size} rx={6} fill="rgba(214,176,116,0.85)" />
      {lines}
      {cells}
    </svg>
  )
}
