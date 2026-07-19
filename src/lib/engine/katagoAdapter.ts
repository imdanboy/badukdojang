import { getMoveList } from '../gameTree.ts'
import type { GameTree } from '../gameTree.ts'
import type { Player } from '../gameState.ts'
import { EngineError } from './types.ts'
import type { EngineSettings, AnalyzeResponse, Vertex } from './types.ts'
import type { ScoringResult } from '../scoring.ts'
import { parseFinalStatusList } from '../scoring.ts'

const API_BASE = '/api/gtp'

let consecutiveFailures = 0
let engineState: 'idle' | 'error' = 'idle'

export function getEngineState(): 'idle' | 'error' {
  return engineState
}

export function resetEngineState(): void {
  consecutiveFailures = 0
  engineState = 'idle'
}

function recordFailure(): void {
  consecutiveFailures += 1
  if (consecutiveFailures >= 3) {
    engineState = 'error'
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0
  engineState = 'idle'
}

function playerToColor(player: Player): 'B' | 'W' {
  return player === 1 ? 'B' : 'W'
}

export function formatGTPVertex(vertex: Vertex, boardSize: number): string {
  const [x, y] = vertex
  const col = x < 8
    ? String.fromCharCode('A'.charCodeAt(0) + x)
    : String.fromCharCode('A'.charCodeAt(0) + x + 1)
  const row = boardSize - y
  return `${col}${row}`
}

export function parseGTPVertex(gtp: string, boardSize: number): Vertex | 'pass' | 'resign' {
  const trimmed = gtp.trim().toLowerCase()
  if (trimmed === 'pass') return 'pass'
  if (trimmed === 'resign') return 'resign'

  if (gtp.length < 2) {
    throw new EngineError('INVALID_RESPONSE', `Invalid GTP vertex: ${gtp}`)
  }

  const col = gtp[0]!.toUpperCase()
  const rowStr = gtp.slice(1)
  const row = parseInt(rowStr, 10)

  if (col < 'A' || col > 'T' || Number.isNaN(row) || row < 1) {
    throw new EngineError('INVALID_RESPONSE', `Invalid GTP vertex: ${gtp}`)
  }

  const colOffset = col > 'H' ? 1 : 0
  const x = col.charCodeAt(0) - 'A'.charCodeAt(0) - colOffset
  const y = boardSize - row
  return [x, y]
}

async function postJSON<T>(
  url: string,
  body: unknown,
  timeoutMs = 30000,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  if (externalSignal !== undefined) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      recordFailure()
      let detail = `HTTP ${response.status}`
      try {
        const errBody = (await response.json()) as { error?: string }
        if (errBody.error) detail = errBody.error
      } catch { /* ignore parse failure */ }
      throw new EngineError('ENGINE_OFFLINE', detail)
    }

    let data: T
    try {
      data = (await response.json()) as T
    } catch (parseError) {
      recordFailure()
      throw new EngineError(
        'INVALID_RESPONSE',
        parseError instanceof Error ? parseError.message : String(parseError),
      )
    }
    recordSuccess()
    return data
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof EngineError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      recordFailure()
      throw new EngineError('TIMEOUT', `Request timed out after ${timeoutMs}ms`)
    }
    recordFailure()
    throw new EngineError(
      'INVALID_RESPONSE',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export async function sendCommand(
  command: string,
  args: string[] = [],
): Promise<string> {
  const response = await postJSON<{ response: string; error?: string }>(
    `${API_BASE}/command`,
    { command, args },
  )
  if (response.error) {
    throw new EngineError('ENGINE_OFFLINE', response.error)
  }
  return response.response
}

export async function setEngineParam(
  param: string,
  value: string | number,
): Promise<void> {
  await sendCommand('kata-set-param', [param, String(value)])
}

export async function setEngineRules(rules: string): Promise<void> {
  await sendCommand('kata-set-rules', [rules])
}

export async function checkHealth(): Promise<{
  status: 'ok' | 'error'
  version?: string
  humanModelAvailable?: boolean
}> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    return { status: 'error' }
  }
  return (await response.json()) as {
    status: 'ok' | 'error'
    version?: string
    humanModelAvailable?: boolean
  }
}

export async function restartEngine(settings: EngineSettings): Promise<void> {
  resetEngineState()
  await initializeEngine(settings)
}

export async function initializeEngine(settings: EngineSettings): Promise<void> {
  const boardSize = settings.boardSize ?? 19

  await sendCommand('boardsize', [String(boardSize)])
  await setEngineRules(settings.rules)
  await sendCommand('komi', [String(settings.komi)])

  if (settings.maxVisits !== undefined) {
    await setEngineParam('maxVisits', settings.maxVisits)
  }
  if (settings.maxTime !== undefined) {
    await setEngineParam('maxTime', settings.maxTime)
  }
  if (settings.humanSLProfile !== undefined) {
    await setEngineParam('humanSLProfile', settings.humanSLProfile)
  }
  if (settings.chosenMoveTemperature !== undefined) {
    await setEngineParam('chosenMoveTemperature', settings.chosenMoveTemperature)
  }
  if (settings.wideRootNoise !== undefined) {
    await setEngineParam('wideRootNoise', settings.wideRootNoise)
  }
}

export async function requestMove(
  gameTree: GameTree,
  player: Player,
  settings?: EngineSettings,
): Promise<Vertex | 'pass' | 'resign'> {
  const color = playerToColor(player)
  const boardSize = settings?.boardSize ?? 19
  const komi = settings?.komi ?? 6.5

  await postJSON(`${API_BASE}/command`, { command: 'clear_board', args: [] })
  await postJSON(`${API_BASE}/command`, { command: 'boardsize', args: [String(boardSize)] })
  if (settings?.rules !== undefined) {
    await postJSON(`${API_BASE}/command`, { command: 'kata-set-rules', args: [settings.rules] })
  }
  await postJSON(`${API_BASE}/command`, { command: 'komi', args: [String(komi)] })

  if (settings !== undefined) {
    if (settings.maxVisits !== undefined) {
      await setEngineParam('maxVisits', settings.maxVisits)
    }
    if (settings.maxTime !== undefined) {
      await setEngineParam('maxTime', settings.maxTime)
    }
    if (settings.humanSLProfile !== undefined) {
      await setEngineParam('humanSLProfile', settings.humanSLProfile)
    }
    if (settings.chosenMoveTemperature !== undefined) {
      await setEngineParam('chosenMoveTemperature', settings.chosenMoveTemperature)
    }
    if (settings.wideRootNoise !== undefined) {
      await setEngineParam('wideRootNoise', settings.wideRootNoise)
    }
  }

  const moves = getMoveList(gameTree)
  for (const move of moves) {
    const c = move.sign === 1 ? 'B' : 'W'
    const vertex = move.vertex === 'pass' ? 'pass' : formatGTPVertex(move.vertex, boardSize)
    await postJSON(`${API_BASE}/command`, { command: 'play', args: [c, vertex] })
  }

  const response = await postJSON<{ response: string; error?: string }>(
    `${API_BASE}/command`,
    { command: 'genmove', args: [color] },
  )

  if (response.error) {
    throw new EngineError('ENGINE_OFFLINE', response.error)
  }

  return parseGTPVertex(response.response, boardSize)
}

export async function requestAnalysis(
  gameTree: GameTree,
  _player: Player,
  settings: EngineSettings,
  signal?: AbortSignal,
  timeoutMs = 30000,
): Promise<AnalyzeResponse> {
  const boardSize = settings.boardSize ?? 19
  const moves = getMoveList(gameTree).map((move) => {
    const color = move.sign === 1 ? 'B' : 'W'
    const vertex =
      move.vertex === 'pass' ? 'pass' : formatGTPVertex(move.vertex, boardSize)
    return `${color} ${vertex}`
  })

  const body: Record<string, unknown> = {
    boardSize,
    moves,
    komi: settings.komi,
  }

  if (settings.maxVisits !== undefined) {
    body.maxVisits = settings.maxVisits
  }
  if (settings.maxTime !== undefined) {
    body.maxTime = settings.maxTime
  }
  if (settings.humanSLProfile !== undefined) {
    body.humanSLProfile = settings.humanSLProfile
  }
  if (settings.wideRootNoise !== undefined) {
    body.wideRootNoise = settings.wideRootNoise
  }

  body.includeOwnership = true

  return await postJSON<AnalyzeResponse>(`${API_BASE}/analyze`, body, timeoutMs, signal)
}

/**
 * Request endgame scoring from the engine.
 * Replays the full move history to the GTP engine, then queries
 * final_score and final_status_list for each category.
 */
export async function requestScoring(
  gameTree: GameTree,
  settings: EngineSettings,
): Promise<ScoringResult> {
  const moves = getMoveList(gameTree)
  const boardSize = settings.boardSize ?? 19

  await postJSON(`${API_BASE}/command`, { command: 'clear_board', args: [] })
  await postJSON(`${API_BASE}/command`, {
    command: 'boardsize',
    args: [String(boardSize)],
  })
  await postJSON(`${API_BASE}/command`, {
    command: 'kata-set-rules',
    args: [settings.rules],
  })
  await postJSON(`${API_BASE}/command`, {
    command: 'komi',
    args: [String(settings.komi)],
  })

  for (const move of moves) {
    const color = move.sign === 1 ? 'B' : 'W'
    const vertex =
      move.vertex === 'pass' ? 'pass' : formatGTPVertex(move.vertex, boardSize)
    await postJSON(`${API_BASE}/command`, {
      command: 'play',
      args: [color, vertex],
    })
  }

  const scoreResponse = await postJSON<{ response: string; error?: string }>(
    `${API_BASE}/command`,
    { command: 'final_score', args: [] },
  )
  if (scoreResponse.error) {
    throw new EngineError('ENGINE_OFFLINE', scoreResponse.error)
  }

  const categories = ['dead', 'alive', 'seki'] as const
  const statusResults: Record<string, Vertex[]> = {
    dead: [],
    alive: [],
    seki: [],
  }

  for (const category of categories) {
    const statusResponse = await postJSON<{ response: string; error?: string }>(
      `${API_BASE}/command`,
      { command: 'final_status_list', args: [category] },
    )
    if (!statusResponse.error) {
      statusResults[category] = parseFinalStatusList(statusResponse.response, boardSize)
    }
  }

  return {
    rawScore: scoreResponse.response.trim(),
    dead: statusResults.dead!,
    alive: statusResults.alive!,
    whiteTerritory: [],
    blackTerritory: [],
    komi: settings.komi,
  }
}

let currentTerminateId = 0

export async function abortOngoing(): Promise<void> {
  currentTerminateId += 1
  const terminateId = `abort-${currentTerminateId}`

  await postJSON(`${API_BASE}/terminate`, {
    action: 'terminate',
    terminateId,
  })
}
