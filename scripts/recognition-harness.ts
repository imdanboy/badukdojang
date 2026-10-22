/*
 * 실샘플 인식 harness — 스크린샷 디렉터리를 recognizeScreenshot 으로
 * 돌려 결과(판 크기·신뢰도·돌 수·ASCII 国面)를 출력한다.
 *
 *   bun run scripts/recognition-harness.ts [디렉터리(기본 ~/Desktop/dev-sample)]
 *
 * PNG 디코더는 최소 구현: 8-bit non-interlaced, colortype 6(RGBA)/2(RGB)/0(Gray).
 */
import { inflateSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { recognizeScreenshot } from '../src/lib/screenshotRecognition.ts'

// ============================================================================
// 최소 PNG 디코더
// ============================================================================

function decodePng(bytes: Buffer): { width: number; height: number; rgba: Uint8ClampedArray } {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (pos < bytes.length) {
    const len = bytes.readUInt32BE(pos)
    const type = bytes.toString('ascii', pos + 4, pos + 8)
    const body = bytes.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      bitDepth = body[8]!
      colorType = body[9]!
      const interlace = body[12]!
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
      if (interlace !== 0) throw new Error('unsupported interlaced PNG')
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (channels === 0) throw new Error(`unsupported color type ${colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const scan = new Uint8Array(height * stride)
  let off = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[off++]!
    const row = scan.subarray(y * stride, (y + 1) * stride)
    const prevRow = y > 0 ? scan.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const c = raw[off + i]!
      const b = i >= channels ? row[i - channels]! : 0
      const u = prevRow != null ? (i >= channels ? prevRow[i - channels]! : 0) : 0
      const v = prevRow != null ? prevRow[i]! : 0
      let val: number
      switch (filter) {
        case 0: val = c; break
        case 1: val = c + b; break
        case 2: val = c + v; break
        case 3: val = c + ((b + v) >> 1); break
        case 4: {
          const p = b + v - u
          const pa = Math.abs(p - b)
          const pb = Math.abs(p - v)
          const pu = Math.abs(p - u)
          val = c + (pa <= pb && pa <= pu ? b : pb <= pu ? v : u)
          break
        }
        default: throw new Error(`unknown filter ${filter}`)
      }
      row[i] = val & 0xff
    }
    off += stride
  }

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) {
      rgba[i * 4] = scan[i * 4]!
      rgba[i * 4 + 1] = scan[i * 4 + 1]!
      rgba[i * 4 + 2] = scan[i * 4 + 2]!
      rgba[i * 4 + 3] = scan[i * 4 + 3]!
    } else if (colorType === 2) {
      rgba[i * 4] = scan[i * 3]!
      rgba[i * 4 + 1] = scan[i * 3 + 1]!
      rgba[i * 4 + 2] = scan[i * 3 + 2]!
      rgba[i * 4 + 3] = 255
    } else {
      rgba[i * 4] = scan[i]!
      rgba[i * 4 + 1] = scan[i]!
      rgba[i * 4 + 2] = scan[i]!
      rgba[i * 4 + 3] = 255
    }
  }
  return { width, height, rgba }
}

// ============================================================================
// ASCII 국면 덤프
// ============================================================================

function asciiGrid(boardSize: number, stones: { x: number; y: number; color: string }[]): string {
  const map = new Map<string, string>()
  for (const s of stones) map.set(`${s.x},${s.y}`, s.color === 'black' ? 'X' : 'O')
  const header = '    ' + String.fromCharCode(...Array.from({ length: boardSize }, (_, i) => 'ABCDEFGHJKLMNOPQRST'[i]!)).split('').join('-')
  const lines: string[] = []
  for (let row = 0; row < boardSize; row++) {
    let line = String(boardSize - row).padStart(2) + ' '
    for (let col = 0; col < boardSize; col++) {
      line += ' ' + (map.get(`${col},${row}`) ?? '.')
    }
    lines.push(line)
  }
  return header + '\n' + lines.join('\n')
}

// ============================================================================
// 메인
// ============================================================================

const dir = process.argv[2] ?? join(homedir(), 'Desktop', 'dev-sample')
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort()
if (files.length === 0) {
  console.error(`no PNG files in ${dir}`)
  process.exit(1)
}

for (const file of files) {
  const bytes = readFileSync(join(dir, file))
  try {
    const t0 = performance.now()
    const png = decodePng(bytes)
    const t1 = performance.now()
    const res = recognizeScreenshot({ data: png.rgba, width: png.width, height: png.height })
    const t2 = performance.now()
    console.log(`\n${'='.repeat(70)}\n${file} (${png.width}x${png.height}, decode ${(t1 - t0).toFixed(0)}ms)`)
    if (res == null) {
      console.log(`AUTO: 실패 (${(t2 - t1).toFixed(0)}ms) — 수동 경로 필요`)
      continue
    }
    console.log(
      `AUTO: ${res.boardSize}x${res.boardSize} 신뢰도=${res.confidence.toFixed(3)} ` +
        `흑=${res.blackCount} 백=${res.whiteCount} (${(t2 - t1).toFixed(0)}ms)`,
    )
    console.log(`민도 격자: TL=(${res.gridCorners[0]!.map((v) => v.toFixed(0)).join(',')}) BR=(${res.gridCorners[2]!.map((v) => v.toFixed(0)).join(',')})`)
    console.log(asciiGrid(res.boardSize, res.stones))
    console.log(`SGF: ${res.sgf.length} bytes`)
  } catch (e) {
    console.log(`\n${'='.repeat(70)}\n${file}: 에러 — ${e instanceof Error ? e.message : String(e)}`)
  }
}
