import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { createGameTree, appendMove } from '../gameTree.ts'
import type { GameTree } from '../gameTree.ts'
import type { EngineSettings, AnalyzeResponse } from './types.ts'
import { EngineError } from './types.ts'
import {
  initializeEngine,
  requestMove,
  requestAnalysis,
  requestScoring,
  abortOngoing,
  formatGTPVertex,
  parseGTPVertex,
  getEngineState,
  resetEngineState,
} from './katagoAdapter.ts'

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

describe('katagoAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeEngine', () => {
    test('sends correct GTP sequence', async () => {
      fetchMock.mockResolvedValue(mockResponse({ response: '' }))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      await initializeEngine(settings)

      expect(fetchMock).toHaveBeenCalledTimes(5)

      const calls = fetchMock.mock.calls as [string, RequestInit][]
      expect(calls[0]![0]).toBe('/api/gtp/command')
      expect(JSON.parse(calls[0]![1].body as string)).toEqual({
        command: 'boardsize',
        args: ['19'],
      })

      expect(calls[1]![0]).toBe('/api/gtp/command')
      expect(JSON.parse(calls[1]![1].body as string)).toEqual({
        command: 'kata-set-rules',
        args: ['korean'],
      })

      expect(calls[2]![0]).toBe('/api/gtp/command')
      expect(JSON.parse(calls[2]![1].body as string)).toEqual({
        command: 'komi',
        args: ['6.5'],
      })

      expect(calls[3]![0]).toBe('/api/gtp/command')
      expect(JSON.parse(calls[3]![1].body as string)).toEqual({
        command: 'kata-set-param',
        args: ['maxVisits', '200'],
      })

      expect(calls[4]![0]).toBe('/api/gtp/command')
      expect(JSON.parse(calls[4]![1].body as string)).toEqual({
        command: 'kata-set-param',
        args: ['maxTime', '30'],
      })
    })

    test('uses custom boardSize when provided', async () => {
      fetchMock.mockResolvedValue(mockResponse({ response: '' }))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'chinese',
        komi: 7.5,
        boardSize: 9,
      }

      await initializeEngine(settings)

      const calls = fetchMock.mock.calls as [string, RequestInit][]
      expect(JSON.parse(calls[0]![1].body as string)).toEqual({
        command: 'boardsize',
        args: ['9'],
      })
    })
  })

  describe('requestMove', () => {
    test('returns parsed vertex when mock returns = Q16', async () => {
      fetchMock.mockResolvedValue(mockResponse({ response: 'Q16' }))

      const gameTree = createGameTree(19) as GameTree
      const result = await requestMove(gameTree, 1)

      expect(result).toEqual([15, 3])
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gtp/command',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ command: 'genmove', args: ['B'] }),
        }),
      )
    })

    test('returns pass when mock returns = pass', async () => {
      fetchMock.mockResolvedValue(mockResponse({ response: 'pass' }))

      const gameTree = createGameTree(19) as GameTree
      const result = await requestMove(gameTree, -1)

      expect(result).toBe('pass')
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gtp/command',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ command: 'genmove', args: ['W'] }),
        }),
      )
    })

    test('returns resign when mock returns = resign', async () => {
      fetchMock.mockResolvedValue(mockResponse({ response: 'resign' }))

      const gameTree = createGameTree(19) as GameTree
      const result = await requestMove(gameTree, 1)

      expect(result).toBe('resign')
    })
  })

  describe('requestAnalysis', () => {
    test('returns winrate, scoreLead, ownership arrays', async () => {
      const analyzeResponse: AnalyzeResponse = {
        id: 'analyze',
        winrate: 0.55,
        scoreLead: 1.2,
        ownership: [0.1, 0.2, 0.3],
        bestMoves: [],
        completed: true,
      }

      fetchMock.mockResolvedValue(mockResponse(analyzeResponse))

      let tree = createGameTree(19)
      tree = appendMove(tree, [3, 3], 1)
      tree = appendMove(tree, [15, 15], -1)

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      const result = await requestAnalysis(tree, 1, settings)

      expect(result.winrate).toBe(0.55)
      expect(result.scoreLead).toBe(1.2)
      expect(result.ownership).toEqual([0.1, 0.2, 0.3])

      const calls = fetchMock.mock.calls as [string, RequestInit][]
      expect(calls[0]![0]).toBe('/api/gtp/analyze')
      const body = JSON.parse(calls[0]![1].body as string)
      expect(body.boardSize).toBe(19)
      expect(body.moves).toEqual(['B D16', 'W Q4'])
      expect(body.komi).toBe(6.5)
      expect(body.maxVisits).toBe(200)
      expect(body.maxTime).toBe(30)
    })

    test('omits optional fields when not provided', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({
          id: 'analyze',
          winrate: 0.5,
          scoreLead: 0,
          completed: true,
        }),
      )

      const tree = createGameTree(19)
      const settings: EngineSettings = {
        maxTime: 10,
        maxVisits: 100,
        numSearchThreads: 2,
        rules: 'japanese',
        komi: 7.5,
      }

      await requestAnalysis(tree, 1, settings)

      const calls = fetchMock.mock.calls as [string, RequestInit][]
      const body = JSON.parse(calls[0]![1].body as string)
      expect(body.humanSLProfile).toBeUndefined()
    })
  })

  describe('requestScoring', () => {
    test('parses final_score and final_status_list into ScoringResult', async () => {
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { command: string; args?: string[] }

        if (body.command === 'final_score') {
          return mockResponse({ response: 'B+3.5' })
        }
        if (body.command === 'final_status_list') {
          const category = body.args?.[0]
          if (category === 'dead') {
            return mockResponse({ response: 'D4\nE4' })
          }
          if (category === 'alive') {
            return mockResponse({ response: 'Q16\nR17' })
          }
        }
        return mockResponse({ response: '' })
      })

      let tree = createGameTree(19)
      tree = appendMove(tree, [3, 3], 1)
      tree = appendMove(tree, [15, 15], -1)

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      const result = await requestScoring(tree, settings)

      expect(result.rawScore).toBe('B+3.5')
      expect(result.komi).toBe(6.5)
      expect(result.dead).toEqual([
        [3, 15],
        [4, 15],
      ])
      expect(result.alive).toEqual([
        [15, 3],
        [16, 2],
      ])
      expect(result.whiteTerritory).toEqual([])
      expect(result.blackTerritory).toEqual([])
    })

    test('handles empty final_status_list responses', async () => {
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { command: string; args?: string[] }

        if (body.command === 'final_score') {
          return mockResponse({ response: 'W+2.5' })
        }
        if (body.command === 'final_status_list') {
          return mockResponse({ response: '' })
        }
        return mockResponse({ response: '' })
      })

      const tree = createGameTree(9)
      const settings: EngineSettings = {
        maxTime: 10,
        maxVisits: 100,
        numSearchThreads: 2,
        rules: 'chinese',
        komi: 7.5,
      }

      const result = await requestScoring(tree, settings)

      expect(result.rawScore).toBe('W+2.5')
      expect(result.dead).toEqual([])
      expect(result.alive).toEqual([])
      expect(result.whiteTerritory).toEqual([])
      expect(result.blackTerritory).toEqual([])
    })
  })

  describe('abortOngoing', () => {
    test('sends terminate JSON', async () => {
      fetchMock.mockResolvedValue(mockResponse({ success: true }))

      await abortOngoing()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gtp/terminate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('terminate'),
        }),
      )

      const calls = fetchMock.mock.calls as [string, RequestInit][]
      const body = JSON.parse(calls[0]![1].body as string)
      expect(body.action).toBe('terminate')
      expect(body.terminateId).toMatch(/^abort-\d+$/)
    })
  })

  describe('error handling', () => {
    test('HTTP 503 → Promise rejects with EngineError(ENGINE_OFFLINE)', async () => {
      fetchMock.mockResolvedValue(mockResponse({ error: '엔진 연결 실패' }, 503))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      try {
        await initializeEngine(settings)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError)
        expect((err as EngineError).code).toBe('ENGINE_OFFLINE')
        expect((err as EngineError).message).toContain('엔진 연결 실패')
      }
    })

  test('HTTP 500 → Promise rejects with EngineError(ENGINE_OFFLINE)', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: 'engine down' }, 500))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      try {
        await initializeEngine(settings)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError)
        expect((err as EngineError).code).toBe('ENGINE_OFFLINE')
        expect((err as EngineError).message).toContain('engine down')
      }
    })

    test('malformed JSON → EngineError(INVALID_RESPONSE)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Unexpected token')),
      } as Response)

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      try {
        await initializeEngine(settings)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError)
        expect((err as EngineError).code).toBe('INVALID_RESPONSE')
      }
    })

    test('timeout → EngineError(TIMEOUT)', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValue(abortError)

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      try {
        await initializeEngine(settings)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError)
        expect((err as EngineError).code).toBe('TIMEOUT')
      }
    })

    test('3 consecutive failures mark engine as error state', async () => {
      resetEngineState()
      fetchMock.mockResolvedValue(mockResponse({ error: 'engine down' }, 503))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      expect(getEngineState()).toBe('idle')

      for (let i = 0; i < 3; i++) {
        try {
          await initializeEngine(settings)
        } catch {
          /* expected */
        }
      }

      expect(getEngineState()).toBe('error')
    })

    test('successful request resets engine state to idle', async () => {
      resetEngineState()
      fetchMock.mockResolvedValue(mockResponse({ response: '' }))

      const settings: EngineSettings = {
        maxTime: 30,
        maxVisits: 200,
        numSearchThreads: 2,
        rules: 'korean',
        komi: 6.5,
      }

      await initializeEngine(settings)
      expect(getEngineState()).toBe('idle')
    })
  })

  describe('formatGTPVertex', () => {
    test('converts vertex to GTP notation (19x19)', () => {
      expect(formatGTPVertex([3, 4], 19)).toBe('D15')
      expect(formatGTPVertex([0, 0], 19)).toBe('A19')
      expect(formatGTPVertex([7, 0], 19)).toBe('H19')
      expect(formatGTPVertex([8, 0], 19)).toBe('J19')
      expect(formatGTPVertex([15, 15], 19)).toBe('Q4')
      expect(formatGTPVertex([18, 18], 19)).toBe('T1')
    })

    test('converts vertex to GTP notation (9x9)', () => {
      expect(formatGTPVertex([3, 4], 9)).toBe('D5')
      expect(formatGTPVertex([0, 0], 9)).toBe('A9')
      expect(formatGTPVertex([8, 8], 9)).toBe('J1')
    })
  })

  describe('parseGTPVertex', () => {
    test('parses GTP vertex string (19x19)', () => {
      expect(parseGTPVertex('D5', 19)).toEqual([3, 14])
      expect(parseGTPVertex('A1', 19)).toEqual([0, 18])
      expect(parseGTPVertex('H1', 19)).toEqual([7, 18])
      expect(parseGTPVertex('J1', 19)).toEqual([8, 18])
      expect(parseGTPVertex('Q16', 19)).toEqual([15, 3])
      expect(parseGTPVertex('T19', 19)).toEqual([18, 0])
    })

    test('parses GTP vertex string (9x9)', () => {
      expect(parseGTPVertex('D5', 9)).toEqual([3, 4])
      expect(parseGTPVertex('A1', 9)).toEqual([0, 8])
      expect(parseGTPVertex('J9', 9)).toEqual([8, 0])
    })

    test('returns pass for "pass"', () => {
      expect(parseGTPVertex('pass', 19)).toBe('pass')
      expect(parseGTPVertex('PASS', 19)).toBe('pass')
    })

    test('returns resign for "resign"', () => {
      expect(parseGTPVertex('resign', 19)).toBe('resign')
      expect(parseGTPVertex('RESIGN', 19)).toBe('resign')
    })

    test('throws INVALID_RESPONSE for invalid input', () => {
      expect(() => parseGTPVertex('invalid', 19)).toThrow(EngineError)
      expect(() => parseGTPVertex('', 19)).toThrow(EngineError)
      expect(() => parseGTPVertex('1', 19)).toThrow(EngineError)
    })
  })
})
