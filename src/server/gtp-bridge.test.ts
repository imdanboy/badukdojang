/**
 * Tests for the KataGo GTP bridge server.
 * Run with: bun test src/server/gtp-bridge.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  KataGoBridge,
  createServer,
  type GtpCommandRequest,
  type AnalyzeRequest,
} from './gtp-bridge';

// ---------------------------------------------------------------------------
// Mock KataGo process helpers
// ---------------------------------------------------------------------------

interface MockProcess {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  kill: () => void;
}

function createMockKatagoProcess(
  responseHandler: (command: string) => string
): MockProcess {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const stdinWriter = new WritableStream<Uint8Array>({
    write(chunk) {
      const text =
        typeof chunk === 'string'
          ? chunk
          : new TextDecoder().decode(chunk);
      const lines = text.split('\n').filter((l) => l.trim() !== '');
      for (const line of lines) {
        const response = responseHandler(line);
        if (response !== '') {
          queueMicrotask(() => {
            // GTP responses end with a blank line (two consecutive newlines)
            const encoded = new TextEncoder().encode(response + '\n\n');
            controller.enqueue(encoded);
          });
        }
      }
    },
  });

  return {
    stdin: stdinWriter,
    stdout,
    kill: () => {
      controller.close();
    },
  };
}

// Helper to inject a KataGoBridge with a mock process
function injectMockProcess(
  bridge: KataGoBridge,
  mock: MockProcess
): void {
  // Access private field via type assertion for testing
  (bridge as unknown as { process: MockProcess | null }).process = mock;
  void (bridge as unknown as { startReader(): Promise<void> }).startReader();
}

// Helper to inject a mock analysis process
function injectMockAnalysisProcess(
  bridge: KataGoBridge,
  responseHandler: (query: string) => string
): void {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const stdinWriter = new WritableStream<Uint8Array>({
    write(chunk) {
      const text =
        typeof chunk === 'string'
          ? chunk
          : new TextDecoder().decode(chunk);
      const lines = text.split('\n').filter((l) => l.trim() !== '');
      for (const line of lines) {
        const response = responseHandler(line);
        if (response !== '') {
          queueMicrotask(() => {
            const encoded = new TextEncoder().encode(response + '\n');
            controller.enqueue(encoded);
          });
        }
      }
    },
  });

  const mock: MockProcess = {
    stdin: stdinWriter,
    stdout,
    kill: () => {
      controller.close();
    },
  };

  (bridge as unknown as { analysisProcess: MockProcess | null }).analysisProcess = mock;
}

// ---------------------------------------------------------------------------
// Baseline: server starts and health check responds
// ---------------------------------------------------------------------------

describe('KataGoBridge baseline', () => {
  it('should respond to health check when process is running', async () => {
    const bridge = new KataGoBridge();

    const mock = createMockKatagoProcess((cmd) => {
      if (cmd === 'name') {
        return '=KataGo';
      }
      return '';
    });

    injectMockProcess(bridge, mock);
    injectMockAnalysisProcess(bridge, () => '');
    // Allow reader to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    const health = await bridge.health();
    expect(health.status).toBe('ok');

    bridge.stop();
  });

  it('should return error health check when process is not running', async () => {
    const bridge = new KataGoBridge();
    const health = await bridge.health();
    expect(health.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Command queueing and GTP response parsing
// ---------------------------------------------------------------------------

describe('KataGoBridge command queueing', () => {
  let bridge: KataGoBridge;
  let mock: MockProcess;

  beforeEach(() => {
    bridge = new KataGoBridge();

    mock = createMockKatagoProcess((cmd) => {
      if (cmd === 'version') {
        return '=1.16.4';
      }
      if (cmd === 'name') {
        return '=KataGo';
      }
      if (cmd === 'boardsize 19') {
        return '=';
      }
      if (cmd === 'komi 7.5') {
        return '=';
      }
      if (cmd === 'clear_board') {
        return '=';
      }
      if (cmd.startsWith('play ')) {
        return '=';
      }
      if (cmd.startsWith('kata-set-param ')) {
        return '=';
      }
      if (cmd.startsWith('kata-analyze ')) {
        return `={"rootInfo":{"winrate":0.5,"scoreLead":0.0},"moveInfos":[{"move":"C4","visits":100,"winrate":0.51,"scoreLead":0.5}],"isDuringSearch":false}`;
      }
      return `?unknown command: ${cmd}`;
    });

    injectMockProcess(bridge, mock);
  });

  afterEach(() => {
    bridge.stop();
  });

  it('should queue commands and return responses in order', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    const r1 = await bridge.sendCommand('version');
    const r2 = await bridge.sendCommand('name');

    expect(r1).toBe('1.16.4');
    expect(r2).toBe('KataGo');
  });

  it('should parse multi-line GTP responses', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Override mock for this test
    const multiMock = createMockKatagoProcess((cmd) => {
      if (cmd === 'list_commands') {
        return '=version\nname\nboardsize\n';
      }
      return '';
    });

    bridge.stop();
    bridge = new KataGoBridge();
    injectMockProcess(bridge, multiMock);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await bridge.sendCommand('list_commands');
    expect(response).toBe('version\nname\nboardsize');
  });

  it('should propagate GTP errors', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await bridge.sendCommand('invalid_command_xyz');
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('unknown command: invalid_command_xyz');
    }
  });

  it('should timeout on hung commands', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    const hungMock = createMockKatagoProcess(() => {
      // Never respond
      return '';
    });

    bridge.stop();
    bridge = new KataGoBridge();
    injectMockProcess(bridge, hungMock);
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await bridge.sendCommand('version', 100);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('timed out');
    }
  });
});

// ---------------------------------------------------------------------------
// Analyze JSON collection
// ---------------------------------------------------------------------------

describe('KataGoBridge analyze', () => {
  let bridge: KataGoBridge;

  beforeEach(() => {
    bridge = new KataGoBridge();

    const mock = createMockKatagoProcess((cmd) => {
      if (cmd === 'boardsize 19') return '=';
      if (cmd === 'komi 7.5') return '=';
      if (cmd === 'clear_board') return '=';
      if (cmd.startsWith('play ')) return '=';
      if (cmd.startsWith('kata-set-param ')) return '=';
      if (cmd.startsWith('kata-analyze ')) {
        return `={"rootInfo":{"winrate":0.52,"scoreLead":1.5},"moveInfos":[{"move":"C4","visits":50,"winrate":0.53,"scoreLead":1.6},{"move":"D4","visits":30,"winrate":0.51,"scoreLead":1.4}],"ownership":[0.1,0.2,0.3],"isDuringSearch":false}`;
      }
      return '';
    });

    injectMockProcess(bridge, mock);
    injectMockAnalysisProcess(bridge, (query) => {
      const parsed = JSON.parse(query);
      if (parsed.id === 'analyze') {
        return JSON.stringify({
          id: 'analyze',
          isDuringSearch: false,
          rootInfo: { winrate: 0.52, scoreLead: 1.5 },
          moveInfos: [
            { move: 'C4', visits: 50, winrate: 0.53, scoreLead: 1.6 },
            { move: 'D4', visits: 30, winrate: 0.51, scoreLead: 1.4 },
          ],
          ownership: [0.1, 0.2, 0.3],
        });
      }
      return '';
    });
  });

  afterEach(() => {
    bridge.stop();
  });

  it('should collect analyze JSON and return parsed result', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    const request: AnalyzeRequest = {
      boardSize: 19,
      moves: [{ player: 'B', vertex: 'C4' }],
      komi: 7.5,
    };

    const result = await bridge.analyze(request);

    expect(result.winrate).toBe(0.52);
    expect(result.scoreLead).toBe(1.5);
    expect(result.ownership).toEqual([0.1, 0.2, 0.3]);
    expect(result.bestMoves).toHaveLength(2);
    expect(result.bestMoves![0]).toEqual({
      move: 'C4',
      visits: 50,
      winrate: 0.53,
      scoreLead: 1.6,
    });
    expect(result.completed).toBe(true);
  });

  it('should accept moves as strings', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    const request: AnalyzeRequest = {
      boardSize: 19,
      moves: ['B C4', 'W D5'],
      komi: 7.5,
    };

    const result = await bridge.analyze(request);
    expect(result.winrate).toBe(0.52);
  });

  it('should pass optional parameters to analysis engine', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    const queriesSent: string[] = [];
    bridge.stop();
    bridge = new KataGoBridge();
    injectMockProcess(bridge, createMockKatagoProcess(() => ''));
    injectMockAnalysisProcess(bridge, (query) => {
      queriesSent.push(query);
      const parsed = JSON.parse(query);
      if (parsed.id === 'analyze') {
        return JSON.stringify({
          id: 'analyze',
          isDuringSearch: false,
          rootInfo: { winrate: 0.5, scoreLead: 0 },
        });
      }
      return '';
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const request: AnalyzeRequest = {
      boardSize: 19,
      moves: [],
      komi: 7.5,
      maxVisits: 100,
      maxTime: 5,
      humanSLProfile: 'rank_10k',
    };

    await bridge.analyze(request);

    const lastQuery = JSON.parse(queriesSent[queriesSent.length - 1]!);
    expect(lastQuery.maxVisits).toBe(100);
    expect(lastQuery.maxTime).toBe(5);
    expect(lastQuery.humanSLProfile).toBe('rank_10k');
  });
});

// ---------------------------------------------------------------------------
// HTTP Server endpoints
// ---------------------------------------------------------------------------

describe('HTTP Server', () => {
  let bridge: KataGoBridge;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    bridge = new KataGoBridge();

    const mock = createMockKatagoProcess((cmd) => {
      if (cmd === 'name') return '=KataGo';
      if (cmd === 'version') return '=1.16.4';
      if (cmd === 'boardsize 19') return '=';
      if (cmd === 'komi 7.5') return '=';
      if (cmd === 'clear_board') return '=';
      if (cmd.startsWith('play ')) return '=';
      if (cmd.startsWith('kata-set-param ')) return '=';
      if (cmd.startsWith('kata-analyze ')) {
        return `={"rootInfo":{"winrate":0.5,"scoreLead":0},"moveInfos":[],"isDuringSearch":false}`;
      }
      return `=${cmd}`;
    });

    injectMockProcess(bridge, mock);
    injectMockAnalysisProcess(bridge, (query) => {
      const parsed = JSON.parse(query);
      if (parsed.id === 'analyze') {
        return JSON.stringify({
          id: 'analyze',
          isDuringSearch: false,
          rootInfo: { winrate: 0.5, scoreLead: 0 },
          moveInfos: [],
        });
      }
      return '';
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Use a random port to avoid conflicts
    const originalPort = process.env.PORT;
    process.env.PORT = '0';
    server = createServer(bridge);
    process.env.PORT = originalPort;
  });

  afterEach(() => {
    server.stop();
    bridge.stop();
  });

  it('GET /api/gtp/health should return ok', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/gtp/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('POST /api/gtp/command should execute GTP command', async () => {
    const req: GtpCommandRequest = { command: 'version' };
    const res = await fetch(`http://localhost:${server.port}/api/gtp/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { response: string };
    expect(body.response).toBe('1.16.4');
  });

  it('POST /api/gtp/command with args should work', async () => {
    const req: GtpCommandRequest = { command: 'boardsize', args: ['19'] };
    const res = await fetch(`http://localhost:${server.port}/api/gtp/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { response: string };
    expect(body.response).toBe('');
  });

  it('POST /api/gtp/analyze should return analyze result', async () => {
    const req: AnalyzeRequest = {
      boardSize: 19,
      moves: [],
      komi: 7.5,
    };
    const res = await fetch(
      `http://localhost:${server.port}/api/gtp/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      winrate: number;
      completed: boolean;
    };
    expect(body.winrate).toBe(0.5);
    expect(body.completed).toBe(true);
  });

  it('should return 404 for unknown paths', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/unknown`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Adversarial tests
// ---------------------------------------------------------------------------

describe('Adversarial tests', () => {
  let bridge: KataGoBridge;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    bridge = new KataGoBridge();

    const mock = createMockKatagoProcess((cmd) => {
      if (cmd === 'name') return '=KataGo';
      if (cmd === 'version') return '=1.16.4';
      if (cmd === 'boardsize 19') return '=';
      if (cmd === 'komi 7.5') return '=';
      if (cmd === 'clear_board') return '=';
      if (cmd.startsWith('play ')) return '=';
      if (cmd.startsWith('kata-set-param ')) return '=';
      if (cmd.startsWith('kata-analyze ')) {
        return `={"rootInfo":{"winrate":0.5,"scoreLead":0},"moveInfos":[],"isDuringSearch":false}`;
      }
      return `=${cmd}`;
    });

    injectMockProcess(bridge, mock);
    injectMockAnalysisProcess(bridge, (query) => {
      const parsed = JSON.parse(query);
      if (parsed.id === 'analyze') {
        return JSON.stringify({
          id: 'analyze',
          isDuringSearch: false,
          rootInfo: { winrate: 0.5, scoreLead: 0 },
          moveInfos: [],
        });
      }
      return '';
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const originalPort = process.env.PORT;
    process.env.PORT = '0';
    server = createServer(bridge);
    process.env.PORT = originalPort;
  });

  afterEach(() => {
    server.stop();
    bridge.stop();
  });

  it('should return 400 for invalid JSON body', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/gtp/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Invalid JSON');
  });

  it('should return 400 for missing command field', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/gtp/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('command');
  });

  it('should return 400 for missing analyze fields', async () => {
    const res = await fetch(
      `http://localhost:${server.port}/api/gtp/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardSize: 19 }),
      }
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('boardSize');
  });

  it('should return 503 when engine is offline', async () => {
    const offlineBridge = new KataGoBridge();
    const originalPort = process.env.PORT;
    process.env.PORT = '0';
    const offlineServer = createServer(offlineBridge);
    process.env.PORT = originalPort;

    const res = await fetch(
      `http://localhost:${offlineServer.port}/api/gtp/health`
    );
    expect(res.status).toBe(503);

    offlineServer.stop();
  });

  it('should return 503 with 엔진 연결 실패 when engine is dead', async () => {
    const deadBridge = new KataGoBridge();
    // Mark engine as dead via private field injection
    (deadBridge as unknown as { engineDead: boolean }).engineDead = true;

    const originalPort = process.env.PORT;
    process.env.PORT = '0';
    const deadServer = createServer(deadBridge);
    process.env.PORT = originalPort;

    const res = await fetch(
      `http://localhost:${deadServer.port}/api/gtp/command`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'version' }),
      }
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('엔진 연결 실패');

    deadServer.stop();
  });

  it('should handle rapid consecutive requests without mixing up', async () => {
    const commands: Promise<Response>[] = [];
    for (let i = 0; i < 5; i++) {
      commands.push(
        fetch(`http://localhost:${server.port}/api/gtp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'version' }),
        })
      );
    }

    const responses = await Promise.all(commands);
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<{ response: string }>)
    );

    for (const body of bodies) {
      expect(body.response).toBe('1.16.4');
    }
  });
});
