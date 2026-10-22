/*
 * Screenshot recognition — 스크린샷 → 바둑판 국면 추출.
 *
 * 대상 도메인: 바둑앱/방송 화면 스크린샷 (렌더된 판 — 원근·조명·가림 없음,
 * 판이 화면 축에 정렬). 실물 판 사진은 가정하지 않는다.
 *
 * 파이프라인 (전부 순수 JS — DOM 불필요. bun harness 와 브라우저에서 동일 동작):
 *   1. toGrayscale (@kaya/board-recognition)
 *   2. detectGrid — 축별 밝기 percentile 프로파일 → 격자선 극값 검출
 *      → 너비 필터 → 등차수열 robust 피팅 → 판 크기 자동 감지 + 격자 4코너
 *   3. classifyIntersections (@kaya, 적응 k-means 3-클러스터) → 돌 목록
 *   4. buildSGF (@kaya) → setup SGF(AB/AW)
 *
 * 색 무관성: 판·돌 팔레트를 가정하지 않는다 (분포 기반 적응 분류).
 * 다크 테마(판보다 밝은 격자선)는 극값 극성 자동 전환으로 커버.
 */
import {
  buildSGF,
  classifyIntersections,
  classifyWithHints,
  toGrayscale,
} from '@kaya/board-recognition'
import type {
  BoardCorners,
  CalibrationHint,
  DetectedStone,
  GrayImage,
  RawImage,
} from '@kaya/board-recognition'

// ============================================================================
// Types
// ============================================================================

export interface GridDetection {
  /** 감지된 판 크기 (한 축의 격자선 수). */
  boardSize: number
  /** 최외곽 격자선 교차점 4개 (이미지 좌표): [TL, TR, BR, BL]. */
  gridCorners: BoardCorners
  /** 0..1 — 격자선 적중률·간격 규칙성 기반. */
  confidence: number
  verticalLines: number[]
  horizontalLines: number[]
}

export interface ScreenshotRecognitionResult {
  boardSize: number
  stones: DetectedStone[]
  sgf: string
  /** 이미지 좌표계의 격자 4코너 (수동 보정·오버레이용). */
  gridCorners: BoardCorners
  /** 자동 격자 감지 결과(0..1). 수동 코너 지정 경로면 0. */
  confidence: number
  autoDetected: boolean
  blackCount: number
  whiteCount: number
}

// ============================================================================
// 1. 축별 기울기 에너지 프로파일
// ============================================================================

/**
 * 각 열(x) / 행(y)의 1차 차분 절대합.
 *
 * 세로 격자선은 판톤↔선톤 전이가 줄을 따라 반복되므로 G[x] 가 크고,
 * 배경·UI 는 열 구조를 갖지 않아 기여하지 않는다. 스크린샷처럼 판 주변에
 * 어두운 UI 가 있는 경우에도 전역 percentile 이 배경에 오염되지 않고,
 * 어두운 선 / 밝은 선 극성(테마)에 무관하다.
 */
function gradientProfile(gray: GrayImage, axis: 'x' | 'y', stride: number): Float32Array {
  const { data, width, height } = gray
  if (axis === 'x') {
    // G[x] = Σ_y |p(x+1,y) − p(x,y)| — 세로 격자선의 좌우 에지 에너지
    const out = new Float32Array(width)
    for (let y = 0; y < height; y += stride) {
      const row = y * width
      for (let x = 0; x < width - 1; x++) {
        out[x] = out[x]! + Math.abs(data[row + x + 1]! - data[row + x]!)
      }
    }
    return out
  }
  const out = new Float32Array(height)
  for (let y = 0; y < height - 1; y++) {
    const rowA = y * width
    const rowB = (y + 1) * width
    for (let x = 0; x < width; x += stride) {
      out[y] = out[y]! + Math.abs(data[rowB + x]! - data[rowA + x]!)
    }
  }
  return out
}

// ============================================================================
// 2. 선(에지 쌍) 검출
// ============================================================================

interface Extremum {
  pos: number
  depth: number
  width: number
}

/** 3점 포물선 꼭짓점으로 극값 위치를 서브픽셀 정밀화 (오프셋 ≤ 0.5px). */
function subPixelOffset(sm: Float32Array, i: number): number {
  if (i <= 0 || i >= sm.length - 1) return 0
  const a = sm[i - 1]!
  const b = sm[i]!
  const c = sm[i + 1]!
  const denom = a + c - 2 * b
  if (Math.abs(denom) < 1e-9) return 0
  const delta = (a - c) / (2 * denom)
  return Math.max(-0.5, Math.min(0.5, delta))
}

/**
 * 기울기 프로파일에서 선 검출.
 *
 * 한 격자선은 폭 1~3px 의 좌/우 에지 2개로 나타난다 → 6px 이내 인접 극값을
 * 깊이 가중 중점으로 병합해 선 위치를 얻는다. 이후 NMS 로 중복 억제.
 */
function findLines(grad: Float32Array, minSep: number): Extremum[] {
  const n = grad.length
  const sm = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = grad[i > 0 ? i - 1 : 0]!
    const c = grad[i < n - 1 ? i + 1 : n - 1]!
    sm[i] = (a + grad[i]! + c) / 3
  }

  const sorted = Array.from(sm).sort((x, y) => x - y)
  // 강한 상위 10개 극값 평균의 15%를 하한. 격자선은 판에서 가장 강한 반복
  // 구조지만 돌에 가려지면 크게 약해지므로 하한을 완화하고, 위장 체인은
  // 후보 점수의 채움 비율(kept/span)로 기각한다.
  const top = Math.min(10, n)
  let topSum = 0
  for (let i = 0; i < top; i++) topSum += sorted[n - 1 - i]!
  const minDepth = Math.max(6, (topSum / top) * 0.15)

  const raw: { pos: number; depth: number; start: number; end: number }[] = []
  for (let i = 1; i < n - 1; i++) {
    const v = sm[i]!
    if (!(v >= sm[i - 1]! && v > sm[i + 1]!)) continue
    if (v < minDepth) continue
    raw.push({ pos: i + subPixelOffset(sm, i), depth: v, start: i, end: i })
  }
  if (raw.length === 0) return []

  // 인접 극값 병합 (같은 선의 좌우 에지)
  raw.sort((a, b) => a.pos - b.pos)
  const merged: Extremum[] = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last != null && r.pos - last.pos <= 6) {
      const wSum = last.depth + r.depth
      last.pos = (last.pos * last.depth + r.pos * r.depth) / wSum
      last.width = r.end - (last.pos - last.width / 2) + 1
      last.depth = wSum
    } else {
      merged.push({ pos: r.pos, depth: r.depth, width: r.end - r.start + 1 })
    }
  }

  // NMS: 깊은 것부터 수용, minSep 이내 중복 억제
  const kept: Extremum[] = []
  for (const m of [...merged].sort((a, b) => b.depth - a.depth)) {
    if (kept.every((k) => Math.abs(k.pos - m.pos) >= minSep)) kept.push(m)
  }
  return kept.sort((a, b) => a.pos - b.pos)
}

// ============================================================================
// 3. 등차수열 robust 피팅
// ============================================================================

interface AxisFit {
  /** 격자선 수 (= 판 크기). */
  count: number
  /** 첫 선 위치 (피팅값). */
  start: number
  /** 끝 선 위치 (피팅값). */
  end: number
  /** 등차 간격 (피팅값). */
  spacing: number
  /** 채택된 선 위치 (서브픽셀, 정렬). */
  positions: number[]
  /** 0..1. */
  score: number
}

/** 1차 회귀 p ≈ a + b·t. */
function linearFit(pts: readonly (readonly [number, number])[]): { a: number; b: number } | null {
  if (pts.length < 2) return null
  let st = 0
  let sp = 0
  let stt = 0
  let stp = 0
  for (const [t, p] of pts) {
    st += t
    sp += p
    stt += t * t
    stp += t * p
  }
  const n = pts.length
  const denom = n * stt - st * st
  if (Math.abs(denom) < 1e-9) return null
  const b = (n * stp - st * sp) / denom
  const a = (sp - b * st) / n
  return { a, b }
}

interface ChainEntry {
  t: number
  pos: number
}

/** 정렬된 위치에서 시작점 s 로 등차 체인을 탐욕 구축 (놓친 선 = t 스킵). */
function walkChain(pos: number[], s: number, d: number, tol: number): ChainEntry[] {
  const entries: ChainEntry[] = [{ t: 0, pos: pos[s]! }]
  let predicted = pos[s]! + d
  let t = 1
  for (let i = s + 1; i < pos.length && t <= 40; i++) {
    const q = pos[i]!
    while (q > predicted + tol && t <= 40) {
      t += 1
      predicted += d
    }
    if (q >= predicted - tol) {
      entries.push({ t, pos: q })
      t += 1
      predicted += d
    }
  }
  return entries
}

/**
 * 검출된 선들에 등차수열 robust 피팅 (RANSAC).
 *
 * 간격 후보(연속 diff)마다 완전 평가한다: 최장 등차 체인 탐색 → 반복 LSQ +
 * 이상치 기각(간격/4) → 점수 = 채택 선 수 × 청결도(1 − 평균잔차/허용오차).
 *
 * 왜 체인 길이만 보면 안 되나: 스크린샷의 돌 에지·텍스트가 수십 개의
 * 위장 후보를 만들고(간격 ~돌지름), 넉넉한 허용오차에 관통 체인으로
 * 이어질 수 있다. 청결도가 함께 커야 등차 구조가 진짜다 — 격자선 체인은
 * 잔차가 서브픽셀에 가깝게 낮아 승리한다.
 */
function fitArithmetic(
  extrema: Extremum[],
  axisLen: number,
  opts?: { forceCount?: number; spacingRange?: readonly [number, number] },
): AxisFit | null {
  if (extrema.length < 5) return null

  const sortedExts = [...extrema].sort((a, b) => a.pos - b.pos)
  const pos = sortedExts.map((e) => e.pos)
  const depthByPos = new Map<number, number>()
  for (const e of extrema) depthByPos.set(e.pos, e.depth)
  const minD = axisLen / 42
  const maxD = axisLen / 4

  // 후보 간격 → (체인, LSQ 정제 결과, 점수) 평가 후 최고점 채택
  let bestA = 0
  let bestB = 0
  let bestT: number[] = []
  let bestP: number[] = []
  let bestKept: Set<number> = new Set()
  let bestResidSum = 0
  let bestScore = 0
  const tried = new Set<number>()

  for (let i = 0; i + 1 < pos.length; i++) {
    const d0 = pos[i + 1]! - pos[i]!
    if (d0 < minD || d0 > maxD) continue
    if (opts?.spacingRange != null && (d0 < opts.spacingRange[0] || d0 > opts.spacingRange[1])) {
      continue
    }
    const d = Math.round(d0 * 2) / 2
    if (tried.has(d)) continue
    tried.add(d)

    // 모든 시작점의 체인을 개별 평가. 최장 체인만 고르면 강한 위장 노드
    // (판 밖 UI 에지)에서 시작한 관통 체인이 진짜 격자 체인(잔차 더 낮음,
    // 점수 더 높음)을 가리기 때문이다.
    const tolWalk = Math.max(2, d * 0.2)
    for (let s = 0; s < pos.length; s++) {
      const c = walkChain(pos, s, d, tolWalk)
      if (c.length < 5) continue
      const t = c.map((e) => e.t)
      const p = c.map((e) => e.pos)
      let refined = lsqRefine(t, p, minD, maxD, undefined)
      if (refined == null) continue

      // 체인 로컬 깊이 일관성 — 진짜 격자선 체인은 멤버 깊이가 비슷하다
      // (같은 판의 선). 주변 UI 에지(웃티다른 깊이)가 끼어든 체인은
      // median 의 1/4 미만 멤버를 제거하고 재정제한다.
      const depths = [...refined.kept].map((k) => depthByPos.get(p[k]!) ?? 0)
      const sortedDepths = [...depths].sort((x, y) => y - x)
      const medDepth = sortedDepths[depths.length >> 1] ?? 0
      const coherent = new Set<number>()
      for (const k of refined.kept) {
        if ((depthByPos.get(p[k]!) ?? 0) >= medDepth * 0.25) coherent.add(k)
      }
      if (coherent.size !== refined.kept.size) {
        if (coherent.size < 5) continue
        const filtered = refineKept(t, p, coherent, minD, maxD)
        if (filtered == null) continue
        refined = filtered
      }

      const keptIdx0 = [...refined.kept].sort((x, y) => x - y)
      const tLo = t[keptIdx0[0]!]!
      const tHi = t[keptIdx0[refined.kept.size - 1]!]!
      const spanCount = tHi - tLo + 1
      // forceCount (타축 count 일치 복구): 채택 span 이 정확히 일치해야 인정
      if (opts?.forceCount != null && spanCount !== opts.forceCount) continue
      const tol = Math.max(1.5, refined.b / 5)
      const meanResid = refined.residSum / refined.kept.size
      const clean = 1 - Math.min(1, meanResid / tol)
      // 채움 비율(kept/span): 관통 위장 체인(넓은 span 에 듬성듬성 채택)은
      // 자연 기각 — 실제 렌더의 약한 격자선(돌에 가려진)을 살리기 위한 보강.
      const fill = refined.kept.size / spanCount
      const score = refined.kept.size * clean * fill
      if (score > bestScore) {
        bestScore = score
        bestA = refined.a
        bestB = refined.b
        bestT = t
        bestP = p
        bestKept = refined.kept
        bestResidSum = refined.residSum
      }
    }
  }
  if (bestScore <= 0 || bestKept.size < 5) return null

  let tMin = bestT[[...bestKept].sort((x, y) => x - y)[0]!]!
  let tMax = bestT[[...bestKept].sort((x, y) => x - y)[bestKept.size - 1]!]!

  // 양 끝 보완: 예측 위치에 근접(≤ 간격/4)한 미채택 후보 수용
  if (opts?.forceCount == null) {
    const tolEdge = Math.max(2, bestB / 6)
    for (let guard = 0; guard < 2; guard++) {
      const prevWant = bestA + bestB * (tMin - 1)
      if (prevWant > 0 && pos.some((q) => Math.abs(q - prevWant) <= tolEdge)) tMin -= 1
      const nextWant = bestA + bestB * (tMax + 1)
      if (nextWant < axisLen && pos.some((q) => Math.abs(q - nextWant) <= tolEdge)) tMax += 1
    }
  }

  const count = tMax - tMin + 1
  if (count < 5 || count > 37) return null
  const start = bestA + bestB * tMin
  const end = bestA + bestB * tMax
  if (start < 0 || end > axisLen || end - start <= 0) return null

  const keptIdx = [...bestKept].sort((x, y) => x - y)
  const keptFrac = keptIdx.length / count
  const meanResid = bestResidSum / Math.max(1, keptIdx.length)
  const tol = Math.max(1.5, bestB / 4)
  const residScore = 1 - Math.min(1, meanResid / tol)

  const finalPos: number[] = []
  for (let ti = tMin; ti <= tMax; ti++) {
    const exact = keptIdx.find((i) => bestT[i] === ti)
    finalPos.push(exact != null ? bestP[exact]! : bestA + bestB * ti)
  }
  const fd: number[] = []
  for (let i = 1; i < finalPos.length; i++) fd.push(finalPos[i]! - finalPos[i - 1]!)
  const fdMean = fd.reduce((s, v) => s + v, 0) / Math.max(1, fd.length)
  const fdVar = fd.reduce((s, v) => s + (v - fdMean) ** 2, 0) / Math.max(1, fd.length)
  // 간격 등규칙성 — 12% 내의 지터는 LSQ 보간으로 정밀해지므로 관대하게.
  // ( LCQ 완화 전 임계 4%는 렌더 기준으로도 도달 불가해 유효한 격자를
  // 눌렀다 )
  const reg = 1 - Math.min(1, Math.sqrt(fdVar) / Math.max(1e-6, fdMean) / 0.12)

  const score = Math.max(0, Math.min(1, keptFrac * (0.35 + 0.65 * residScore) * (0.5 + 0.5 * reg)))
  if (score < 0.2) return null

  return { count, start, end, spacing: bestB, positions: finalPos, score }
}

/** 반복 LSQ + 이상치 기각. t/p 쌍에서 격격한 등차 모델로 수렴. */
function lsqRefine(
  t: number[],
  p: number[],
  minD: number,
  maxD: number,
  initialKept?: Set<number>,
): { a: number; b: number; kept: Set<number>; residSum: number } | null {
  let kept = initialKept ?? new Set<number>(t.map((_, i) => i))
  let a = p[0]!
  let b = t.length > 1 && t[1]! > t[0]! ? (p[1]! - p[0]!) / (t[1]! - t[0]!) : 0
  let residSum = 0
  for (let iter = 0; iter < 4; iter++) {
    const pts: (readonly [number, number])[] = [...kept].map((i) => [t[i]!, p[i]!] as const)
    const fit = linearFit(pts)
    if (fit == null || fit.b <= 0) return null
    a = fit.a
    b = fit.b
    if (b < minD || b > maxD) return null
    // 렌더 격자는 서브픽셀 정밀도 — 간격의 1/5 이상 벗어나면 위장(주변 UI
    // 에지가 반 칸쯤 어긋나 근접해 들어온다)으로 기각
    const tol = Math.max(1.5, b / 5)
    const next = new Set<number>()
    let rSum = 0
    for (const i of kept) {
      const r = Math.abs(p[i]! - (a + b * t[i]!))
      if (r <= tol) {
        next.add(i)
        rSum += r
      }
    }
    const stable = next.size === kept.size
    kept = next
    residSum = rSum
    if (kept.size < 5) return null
    if (stable) break
  }
  return { a, b, kept, residSum }
}

/** 기존 정제를 초기 kept 집합으로 이어받아 재정제. */
function refineKept(
  t: number[],
  p: number[],
  initial: Set<number>,
  minD: number,
  maxD: number,
): ReturnType<typeof lsqRefine> {
  if (initial.size < 2) return null
  const initialArr = [...initial].sort((x, y) => x - y)
  const pts: (readonly [number, number])[] = initialArr.map((i) => [t[i]!, p[i]!] as const)
  const fit = linearFit(pts)
  if (fit == null || fit.b <= 0) return null
  return lsqRefine(t, p, minD, maxD, initial)
}

// ============================================================================
// 4. 격자 감지 (판 크기 + 4코너)
// ============================================================================

const MIN_GRID_CONFIDENCE = 0.55

export function detectGrid(gray: GrayImage): GridDetection | null {
  const { width, height } = gray
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 900))

  // NMS 간격 — 가능한 최소 실제 간격(len/36, 37선)보다 작아야 인접 선이
  // 서로 억제되지 않는다. 작게 잡아도 약한 극값은 depth 하한으로 걸러진다.
  const gxLines = findLines(gradientProfile(gray, 'x', stride), width / 120)
  const fitX = fitArithmetic(gxLines, width)
  const fitY = fitArithmetic(
    findLines(gradientProfile(gray, 'y', stride), height / 120),
    height,
  )
  if (fitX == null || fitY == null) return null

  // 제 축 개수 불일치 — 실패가 아니라 복구 기회다. 더 점수 높은 축의
  // 개수·간격을 목표로 반대축을 재피팅한다 (forceCount). 판 밖 UI 에지가
  // 격자와 등차를 이루는 위장 체인(count+1~2)은 개수 제약으로 기각된다.
  let fx = fitX
  let fy = fitY
  if (fx.count !== fy.count) {
    const xBetter = fx.score >= fy.score
    const ref = xBetter ? fx : fy
    const opts = {
      forceCount: ref.count,
      spacingRange: [ref.spacing * 0.92, ref.spacing * 1.08] as const,
    }
    const refi = xBetter
      ? fitArithmetic(findLines(gradientProfile(gray, 'y', stride), height / 120), height, opts)
      : fitArithmetic(findLines(gradientProfile(gray, 'x', stride), width / 120), width, opts)
    if (refi == null || refi.count !== ref.count) return null
    if (xBetter) fy = refi
    else fx = refi
  }

  // 홀수 사전(prior) — 바둑판 격자는 항상 홀수(9/13/19 등). 짝수 count 는
  // 레이블 밴드 같은 판 가구 에지가 한 칸 바깥에 관통한 강력한 신호다:
  // 한 줄 줄여 재피팅하고, 실패하면 원 피팅을 유지한다.
  if (fx.count % 2 === 0 && fx.count === fy.count) {
    const odd = fx.count - 1
    const optsX = {
      forceCount: odd,
      spacingRange: [fx.spacing * 0.92, fx.spacing * 1.08] as const,
    }
    const optsY = {
      forceCount: odd,
      spacingRange: [fy.spacing * 0.92, fy.spacing * 1.08] as const,
    }
    const refX = fitArithmetic(gxLines, width, optsX)
    const refY = fitArithmetic(
      findLines(gradientProfile(gray, 'y', stride), height / 120),
      height,
      optsY,
    )
    if (refX != null && refY != null) {
      fx = refX
      fy = refY
    }
  }

  const gridW = fx.end - fx.start
  const gridH = fy.end - fy.start
  if (gridW <= 0 || gridH <= 0) return null
  const ratio = gridW / gridH
  if (ratio < 0.9 || ratio > 1.1) return null
  const aspectFactor = ratio > 0.96 && ratio < 1.04 ? 1 : 0.75

  const confidence = Math.min(fx.score, fy.score) * aspectFactor
  if (confidence < MIN_GRID_CONFIDENCE) return null

  return {
    boardSize: fx.count,
    gridCorners: [
      [fx.start, fy.start],
      [fx.end, fy.start],
      [fx.end, fy.end],
      [fx.start, fy.end],
    ],
    confidence,
    verticalLines: fx.positions,
    horizontalLines: fy.positions,
  }
}

// ============================================================================
// 5. 인식 엔트리 (자동 / 수동 코너 / 힌트 보정)
// ============================================================================

function buildResult(
  boardSize: number,
  stones: DetectedStone[],
  gridCorners: BoardCorners,
  confidence: number,
  autoDetected: boolean,
): ScreenshotRecognitionResult {
  return {
    boardSize,
    stones,
    sgf: buildSGF(boardSize, stones),
    gridCorners,
    confidence,
    autoDetected,
    blackCount: stones.filter((s) => s.color === 'black').length,
    whiteCount: stones.filter((s) => s.color === 'white').length,
  }
}

/**
 * 스크린샷 자동 인식. 격자 감지 실패 시 null (수동 코너 경로로 전환).
 */
export function recognizeScreenshot(img: RawImage): ScreenshotRecognitionResult | null {
  const gray = toGrayscale(img)
  const grid = detectGrid(gray)
  if (grid == null) return null
  const stones = classifyIntersections(gray, grid.boardSize, {
    gridCorners: grid.gridCorners,
  })
  return buildResult(grid.boardSize, stones, grid.gridCorners, grid.confidence, true)
}

/**
 * 수동 경로: 사용자가 최외곽 교차점 4개(TL,TR,BR,BL)를 클릭한 좌표로 분류.
 * 자동 감지 실패·이미지가 기울어진 경우의 fallback.
 */
export function recognizeWithManualCorners(
  img: RawImage,
  boardSize: number,
  corners: BoardCorners,
): ScreenshotRecognitionResult {
  const gray = toGrayscale(img)
  const stones = classifyIntersections(gray, boardSize, { gridCorners: corners })
  return buildResult(boardSize, stones, corners, 0, false)
}

/**
 * 힌트 보정 재분류: 사용자가 지정한 교차점(빈/흑/백)을 앵커로
 * 나머지 교차점의 클러스터 중심을 재추정한다 (@kaya classifyWithHints).
 */
export function reclassifyWithHintOverrides(
  img: RawImage,
  boardSize: number,
  corners: BoardCorners,
  hints: CalibrationHint[],
): ScreenshotRecognitionResult {
  const gray = toGrayscale(img)
  const stones = classifyWithHints(gray, boardSize, hints, corners)
  return buildResult(boardSize, stones, corners, 0, false)
}

/** 편집된 돌 목록을 SGF 로 재출력 (보정 UX용). */
export function stonesToSGF(boardSize: number, stones: DetectedStone[]): string {
  return buildSGF(boardSize, stones)
}

/** setup SGF 의 최초 착수자(PL)를 심는다 — 이어하기 차례 지정용. */
export function withPlayerToPlay(sgf: string, nextTurn: 'B' | 'W'): string {
  if (/(^|;)\s*PL\[/.test(sgf)) return sgf
  return sgf.replace(/^\(;/, `(;PL[${nextTurn}]`)
}
