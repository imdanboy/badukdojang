let audioCtx: AudioContext | null = null
let _enabled = true

const bufferCache = new Map<string, AudioBuffer>()

export function setSoundEnabled(enabled: boolean): void {
  _enabled = enabled
}

export function isSoundEnabled(): boolean {
  return _enabled
}

function getAudioContext(): AudioContext {
  if (audioCtx == null) {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url)
  if (cached !== undefined) return cached

  const ctx = getAudioContext()
  const resp = await fetch(url)
  const arrayBuf = await resp.arrayBuffer()
  const buf = await ctx.decodeAudioData(arrayBuf)
  bufferCache.set(url, buf)
  return buf
}

function playBuffer(url: string): void {
  loadBuffer(url)
    .then((buf) => {
      const ctx = getAudioContext()
      const source = ctx.createBufferSource()
      source.buffer = buf
      source.connect(ctx.destination)
      source.start()
    })
    .catch(() => {})
}

const STONE_URLS = [
  '/sounds/stone1.wav',
  '/sounds/stone2.wav',
  '/sounds/stone3.wav',
  '/sounds/stone4.wav',
  '/sounds/stone5.wav',
]
const CAPTURE_URL = '/sounds/capturing.wav'

export function playStoneSound(): void {
  if (!_enabled) return
  const idx = Math.floor(Math.random() * STONE_URLS.length)
  playBuffer(STONE_URLS[idx]!)
}

export function playCaptureSound(_count: number = 1): void {
  if (!_enabled) return
  playBuffer(CAPTURE_URL)
}
