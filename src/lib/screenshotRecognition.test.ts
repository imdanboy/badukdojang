/*
 * Screenshot recognition 단위 테스트 — 합성 이미지로 전 파이프라인 검증.
 *
 * 합성 이미지는 스크린샷 도메인의 이상적 형태(균일 렌더, 축정렬 격자)를
 * 재현한다: 배경 → 판 사각형 → 격자선 → 돌 원판. 색 팔레트를 바꿔
 * 색 무관성(다크 테마), 주변 UI, 계가 음영, 부분판 등을 커버한다.
 */
import { describe, expect, it } from 'vitest'
import { toGrayscale } from '@kaya/board-recognition'
import type { BoardCorners, GrayImage, RawImage } from '@kaya/board-recognition'
import {
  detectGrid,
  recognizeScreenshot,
  recognizeWithManualCorners,
} from './screenshotRecognition.ts'
import { createGameState } from './gameState.ts'
import { sgfToTree } from './sgfIo.ts'
import { getSetupStones } from './gameTree.ts'

// ============================================================================
// 합성 스크린샷 생성기
// ============================================================================

type RGB = readonly [number, number, number]

interface SynthOptions {
  boardSize: number
  /** 한 칸 픽셀 크기 */
  cell: number
  /** 격자 첫 교차점(좌상단)의 이미지 내 위치 */
  offsetX: number
  offsetY: number
  background: RGB
  board: RGB
  line: RGB
  /** 격자선 두께 (px, 홀수 권장) */
  lineWidth?: number
  black: RGB
  white: RGB
  /** 돌 반지름 (칸 크기 비율) */
  stoneRadiusFrac?: number
  stones: { x: number; y: number; color: 'black' | 'white' }[]
}

function synthScreenshot(o: SynthOptions): RawImage {
  const n = o.boardSize
  const gridW = (n - 1) * o.cell
  const lineW = o.lineWidth ?? 2
  const stoneR = (o.stoneRadiusFrac ?? 0.42) * o.cell
  // 판 사각형 — 격자보다 여유(반 칸)를 둔 나무 테두리
  const margin = Math.round(o.cell * 0.6)
  const bx0 = o.offsetX - margin
  const by0 = o.offsetY - margin
  const bx1 = o.offsetX + gridW + margin
  const by1 = o.offsetY + gridW + margin

  const imgW = Math.max(bx1 + 20, o.offsetX + gridW + 40)
  const imgH = Math.max(by1 + 20, o.offsetY + gridW + 40)
  const data = new Uint8ClampedArray(imgW * imgH * 4)

  const put = (x: number, y: number, c: RGB) => {
    const i = (y * imgW + x) * 4
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = 255
  }

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      put(x, y, o.background)
    }
  }
  for (let y = Math.max(0, by0); y < Math.min(imgH, by1); y++) {
    for (let x = Math.max(0, bx0); x < Math.min(imgW, bx1); x++) {
      put(x, y, o.board)
    }
  }

  const half = Math.floor(lineW / 2)
  for (let i = 0; i < n; i++) {
    const p = o.offsetX + i * o.cell
    for (let d = -half; d <= half; d++) {
      const px = p + d
      for (let y = o.offsetY; y <= o.offsetY + gridW; y++) {
        if (px >= 0 && px < imgW && y >= 0 && y < imgH) put(px, y, o.line)
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const p = o.offsetY + i * o.cell
    for (let d = -half; d <= half; d++) {
      const py = p + d
      for (let x = o.offsetX; x <= o.offsetX + gridW; x++) {
        if (x >= 0 && x < imgW && py >= 0 && py < imgH) put(x, py, o.line)
      }
    }
  }

  const r2 = stoneR * stoneR
  for (const s of o.stones) {
    const cx = o.offsetX + s.x * o.cell
    const cy = o.offsetY + s.y * o.cell
    const c = s.color === 'black' ? o.black : o.white
    for (let y = Math.floor(cy - stoneR); y <= Math.ceil(cy + stoneR); y++) {
      for (let x = Math.floor(cx - stoneR); x <= Math.ceil(cx + stoneR); x++) {
        if (x < 0 || x >= imgW || y < 0 || y >= imgH) continue
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) put(x, y, c)
      }
    }
  }

  return { data, width: imgW, height: imgH }
}

const WOOD: Pick<SynthOptions, 'background' | 'board' | 'line' | 'black' | 'white'> = {
  background: [40, 44, 52],
  board: [214, 176, 116],
  line: [46, 34, 22],
  black: [22, 22, 24],
  white: [242, 240, 235],
}

const DARK: Pick<SynthOptions, 'background' | 'board' | 'line' | 'black' | 'white'> = {
  background: [16, 16, 20],
  board: [43, 43, 48],
  line: [138, 138, 148],
  black: [12, 12, 14],
  white: [235, 235, 238],
}

/** 결정론적 돌 패턴 — 두 색 모두 충분히 등장. */
function patternStones(n: number, density = 1): { x: number; y: number; color: 'black' | 'white' }[] {
  const stones: { x: number; y: number; color: 'black' | 'white' }[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = (x * 7 + y * 11) % 23
      if (k < 2 * density) stones.push({ x, y, color: 'black' })
      else if (k < 4 * density) stones.push({ x, y, color: 'white' })
    }
  }
  return stones
}

const key = (x: number, y: number, color: string) => `${x},${y},${color}`

// ============================================================================
// detectGrid — 판 크기 자동 감지
// ============================================================================

describe('detectGrid', () => {
  it.each([9, 13, 19] as const)('나무 판 %dx%d 크기·코너 감지', (n) => {
    const cell = 40
    const offsetX = 60
    const offsetY = 80
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell,
      offsetX,
      offsetY,
      stones: patternStones(n),
    })
    const grid = detectGrid(imgToGray(img))
    expect(grid).not.toBeNull()
    expect(grid!.boardSize).toBe(n)
    expect(grid!.confidence).toBeGreaterThanOrEqual(0.55)
    // 코너는 실제 격자 끝 교차점 (±2px)
    const corners: BoardCorners = [
      [offsetX, offsetY],
      [offsetX + (n - 1) * cell, offsetY],
      [offsetX + (n - 1) * cell, offsetY + (n - 1) * cell],
      [offsetX, offsetY + (n - 1) * cell],
    ]
    for (let i = 0; i < 4; i++) {
      expect(grid!.gridCorners[i]![0]).toBeCloseTo(corners[i]![0], -1.2)
      expect(grid!.gridCorners[i]![1]).toBeCloseTo(corners[i]![1], -1.2)
    }
  })

  it('다크 테마 (판보다 밝은 격자선) 도 감지', () => {
    const img = synthScreenshot({
      ...DARK,
      boardSize: 19,
      cell: 40,
      offsetX: 50,
      offsetY: 50,
      stones: patternStones(19),
    })
    const grid = detectGrid(imgToGray(img))
    expect(grid).not.toBeNull()
    expect(grid!.boardSize).toBe(19)
  })

  it('초반 국면 (돌 6%) — 붕괴 없이 감지', () => {
    // 포석 직후 수준: 두 서로 간섭 없는 위치의 돌만
    const stones = [
      { x: 3, y: 3, color: 'black' as const },
      { x: 15, y: 3, color: 'white' as const },
      { x: 16, y: 15, color: 'black' as const },
      { x: 2, y: 14, color: 'white' as const },
    ]
    const img = synthScreenshot({
      ...WOOD,
      boardSize: 19,
      cell: 40,
      offsetX: 60,
      offsetY: 60,
      stones,
    })
    const res = recognizeScreenshot(img)
    expect(res).not.toBeNull()
    const got = new Set(res!.stones.map((s) => key(s.x, s.y, s.color)))
    for (const s of stones) {
      expect(got.has(key(s.x, s.y, s.color))).toBe(true)
    }
    expect(res!.stones).toHaveLength(stones.length)
  })

  it('한 열에 흑돌 5개 쌓여도 가짜 선 없음', () => {
    const stones = [0, 1, 2, 3, 4].map((y) => ({ x: 9, y, color: 'black' as const }))
    const img = synthScreenshot({
      ...WOOD,
      boardSize: 19,
      cell: 40,
      offsetX: 60,
      offsetY: 60,
      stones: [...stones, ...patternStones(19, 0.5).slice(0, 30)],
    })
    const grid = detectGrid(imgToGray(img))
    expect(grid).not.toBeNull()
    expect(grid!.boardSize).toBe(19)
  })

  it('부분판 (절반만 보임) 은 실패 → 수동 경로 유도', () => {
    const n = 19
    const cell = 40
    const full = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell,
      offsetX: 60,
      offsetY: 60,
      stones: patternStones(n),
    })
    // 좌측 절반만 크롭 — 격자 10줄만 보임
    const half = { data: full.data.subarray(0, full.height * full.width * 2), width: full.width / 2 | 0, height: full.height }
    const res = recognizeScreenshot(half as RawImage)
    expect(res).toBeNull()
  })
})

// ============================================================================
// recognizeScreenshot — 돌 분류 정확도
// ============================================================================

describe('recognizeScreenshot', () => {
  it.each([9, 13, 19] as const)('나무 판 %d — 돌 전부 정확 분류', (n) => {
    const stones = patternStones(n)
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell: 40,
      offsetX: 60,
      offsetY: 70,
      stones,
    })
    const res = recognizeScreenshot(img)
    expect(res).not.toBeNull()
    expect(res!.boardSize).toBe(n)
    const got = new Set(res!.stones.map((s) => key(s.x, s.y, s.color)))
    expect(res!.stones).toHaveLength(stones.length)
    for (const s of stones) {
      expect(got.has(key(s.x, s.y, s.color))).toBe(true)
    }
  })

  it('다크 테마 — 돌 전부 정확 분류', () => {
    const stones = patternStones(13)
    const img = synthScreenshot({
      ...DARK,
      boardSize: 13,
      cell: 36,
      offsetX: 48,
      offsetY: 52,
      stones,
    })
    const res = recognizeScreenshot(img)
    expect(res).not.toBeNull()
    expect(res!.boardSize).toBe(13)
    expect(res!.stones).toHaveLength(stones.length)
  })

  it('주변 UI(어두운 사이드바) + 좌표 라벨이 있어도 정확', () => {
    const n = 19
    const cell = 40
    const stones = patternStones(n)
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell,
      offsetX: 90,
      offsetY: 60,
      stones,
    })
    // 좌측에 어두운 사이드바 + 세로 텍스트 밴드 (좌표 라벨 흉내)
    const sidebarW = 70
    const barX = 12
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < sidebarW; x++) {
        const i = (y * img.width + x) * 4
        img.data[i] = 30
        img.data[i + 1] = 32
        img.data[i + 2] = 38
        img.data[i + 3] = 255
      }
    }
    for (let y = 0; y < img.height; y += 1) {
      for (let d = 0; d < 4; d++) {
        const i = (y * img.width + barX + d) * 4
        img.data[i] = 200
        img.data[i + 1] = 200
        img.data[i + 2] = 205
      }
    }
    const res = recognizeScreenshot(img)
    expect(res).not.toBeNull()
    expect(res!.boardSize).toBe(n)
    expect(res!.stones).toHaveLength(stones.length)
  })

  it('계가 모드 음영 (셀 살짝 어둡게) 이 가짜 셀 만들지 않음', () => {
    const n = 13
    const cell = 40
    const stones = patternStones(n)
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell,
      offsetX: 60,
      offsetY: 60,
      stones,
    })
    // 특정 셀 4개를 약간 어둡게 (영역 표시 음영 흉내) — 폭이 넓어 선 필터로 기각되어야 함
    const shadedCells: readonly (readonly [number, number])[] = [
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4],
    ]
    for (const [cx, cy] of shadedCells) {
      const x0 = 60 + (cx - 0.5) * cell
      const y0 = 60 + (cy - 0.5) * cell
      for (let y = Math.round(y0); y < Math.round(y0 + cell); y++) {
        for (let x = Math.round(x0); x < Math.round(x0 + cell); x++) {
          const i = (y * img.width + x) * 4
          img.data[i] = img.data[i]! * 0.82
          img.data[i + 1] = img.data[i + 1]! * 0.82
          img.data[i + 2] = img.data[i + 2]! * 0.82
        }
      }
    }
    const res = recognizeScreenshot(img)
    expect(res).not.toBeNull()
    expect(res!.boardSize).toBe(n)
  })
})

// ============================================================================
// 수동 경로 + 이어하기 통합
// ============================================================================

describe('수동 코너 + 게임 상태 통합', () => {
  it('수동 코너로 분류 → setup SGF → createGameState 국면 복원', () => {
    const n = 9
    const cell = 40
    const stones = patternStones(n)
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell,
      offsetX: 60,
      offsetY: 60,
      stones,
    })
    const corners: BoardCorners = [
      [60, 60],
      [60 + (n - 1) * cell, 60],
      [60 + (n - 1) * cell, 60 + (n - 1) * cell],
      [60, 60 + (n - 1) * cell],
    ]
    const res = recognizeWithManualCorners(img, n, corners)
    expect(res.stones).toHaveLength(stones.length)

    // 이어하기 경로: SGF → 트리 → 게임 상태
    const tree = sgfToTree(res.sgf)
    const gs = createGameState(n, tree)
    const signMap = gs.getSignMap()
    for (const s of stones) {
      expect(signMap[s.y]![s.x]).toBe(s.color === 'black' ? 1 : -1)
    }
    // setup 돌은 엔진 재생 목록에도 들어간다
    expect(getSetupStones(tree)).toHaveLength(stones.length)
  })

  it('PL[B]/PL[W] 다음 착수자 반영', () => {
    const n = 9
    const stones = [
      { x: 2, y: 2, color: 'black' as const },
      { x: 6, y: 6, color: 'white' as const },
    ]
    const img = synthScreenshot({
      ...WOOD,
      boardSize: n,
      cell: 40,
      offsetX: 60,
      offsetY: 60,
      stones,
    })
    const res = recognizeWithManualCorners(img, n, [
      [60, 60],
      [60 + 8 * 40, 60],
      [60 + 8 * 40, 60 + 8 * 40],
      [60, 60 + 8 * 40],
    ])

    const blackToPlay = sgfToTree(
      res.sgf.replace('AP[Kaya Board Recognition]', 'AP[Kaya Board Recognition]PL[B]'),
    )
    expect(createGameState(n, blackToPlay).currentPlayer).toBe(1)
    const whiteToPlay = sgfToTree(
      res.sgf.replace('AP[Kaya Board Recognition]', 'AP[Kaya Board Recognition]PL[W]'),
    )
    expect(createGameState(n, whiteToPlay).currentPlayer).toBe(-1)
  })
})

function imgToGray(img: RawImage): GrayImage {
  return toGrayscale(img)
}
