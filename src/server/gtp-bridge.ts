/**
 * Bun HTTP bridge server that wraps KataGo's GTP protocol.
 *
 * Spawns `katago gtp` as a child process and exposes REST endpoints
 * for the frontend to communicate with KataGo.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GtpCommandRequest {
  readonly command: string;
  readonly args?: readonly string[];
}

export interface GtpCommandResponse {
  readonly response: string;
  readonly error?: string;
}

export interface AnalyzeMove {
  readonly player: 'B' | 'W';
  readonly vertex: string;
}

export interface AnalyzeRequest {
  readonly boardSize: number;
  readonly moves: readonly AnalyzeMove[] | readonly string[];
  readonly komi: number;
  readonly maxVisits?: number;
  readonly maxTime?: number;
  readonly humanSLProfile?: string;
  readonly wideRootNoise?: number;
  readonly signal?: AbortSignal;
}

export interface BestMoveInfo {
  readonly move: string;
  readonly visits: number;
  readonly winrate: number;
  readonly scoreLead: number;
  readonly pv?: readonly string[];
}

export interface AnalyzeResponse {
  readonly winrate: number;
  readonly scoreLead: number;
  readonly ownership?: number[] | undefined;
  readonly bestMoves?: BestMoveInfo[] | undefined;
  readonly completed: boolean;
}

export interface HealthResponse {
  readonly status: 'ok' | 'error';
  readonly version?: string | undefined;
  readonly humanModelAvailable?: boolean | undefined;
}

interface QueuedCommand {
  readonly command: string;
  readonly resolve: (value: string) => void;
  readonly reject: (reason: Error) => void;
}

type AnalysisEngineMove = readonly [string, string];

interface AnalysisEngineQuery {
  readonly id: string;
  readonly moves: readonly AnalysisEngineMove[];
  readonly rules: string;
  readonly komi: number;
  readonly boardXSize: number;
  readonly boardYSize: number;
  readonly analyzeTurns: readonly number[];
  readonly maxVisits?: number;
  readonly maxTime?: number;
  readonly humanSLProfile?: string;
  readonly includeOwnership?: boolean;
  readonly reportDuringSearch?: boolean;
  readonly reportDuringSearchEvery?: number;
}

interface AnalysisEngineResponse {
  readonly id: string;
  readonly isDuringSearch: boolean;
  readonly rootInfo?: {
    readonly winrate: number;
    readonly scoreLead: number;
  };
  readonly moveInfos?: Array<{
    readonly move: string;
    readonly visits: number;
    readonly winrate: number;
    readonly scoreLead: number;
    readonly pv?: readonly string[];
  }>;
  readonly ownership?: number[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getEnv(name: string): string | undefined {
  return Bun.env[name];
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getKatagoBinary(): string {
  return getEnv('KATAGO_BINARY') ?? 'katago';
}

function getKatagoConfigPath(): string {
  return (
    getEnv('KATAGO_CONFIG_PATH') ??
    '/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/gtp_example.cfg'
  );
}

function getPort(): number {
  const port = Number(getEnv('PORT') ?? '8787');
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${getEnv('PORT')}`);
  }
  return port;
}

// ---------------------------------------------------------------------------
// Line reader for ReadableStream<Uint8Array>
// ---------------------------------------------------------------------------

async function resolveDefaultAnalysisConfig(): Promise<string | undefined> {
  if (import.meta.dir === undefined) return undefined;
  const path = `${import.meta.dir}/../../config/analysis.cfg`;
  try {
    if (await Bun.file(path).exists()) return path;
  } catch {
    return undefined;
  }
  return undefined;
}

async function* readLines(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.length > 0) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// KataGo Bridge
// ---------------------------------------------------------------------------

export class KataGoBridge {
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private analysisProcess: ReturnType<typeof Bun.spawn> | null = null;
  private commandQueue: QueuedCommand[] = [];
  private isProcessing = false;
  private responseResolve: ((value: string) => void) | null = null;
  private responseReject: ((reason: Error) => void) | null = null;
  private readerRunning = false;
  private version: string | undefined;
  private restartAttempted = false;
  private engineDead = false;
  private shuttingDown = false;
  private analysisQueue: Array<{
    request: AnalyzeRequest;
    resolve: (value: AnalyzeResponse) => void;
    reject: (reason: Error) => void;
  }> = [];
  private analyzing = false;

  async start(): Promise<void> {
    const binary = getKatagoBinary();
    const modelPath = requireEnv('KATAGO_MODEL_PATH');
    const configPath = getKatagoConfigPath();
    const humanModelPath = getEnv('HUMAN_MODEL_PATH');

    const args = ['gtp', '-model', modelPath, '-config', configPath];
    if (humanModelPath !== undefined && humanModelPath !== '') {
      args.push('-human-model', humanModelPath);
    }

    try {
      this.process = Bun.spawn({
        cmd: [binary, ...args],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });
    } catch (error) {
      throw new Error(
        `Failed to spawn KataGo: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.process.exited.then(() => this.handleProcessDeath()).catch((err) => {
      console.error('KataGo process exit monitoring error:', err);
    });

    // Start stdout reader
    this.startReader();

    // Start analysis engine
    const analysisConfigPath =
      getEnv('KATAGO_ANALYSIS_CONFIG_PATH') ??
      (await resolveDefaultAnalysisConfig()) ??
      '/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/analysis_example.cfg';
    const analysisArgs = ['analysis', '-model', modelPath, '-config', analysisConfigPath];
    if (humanModelPath !== undefined && humanModelPath !== '') {
      analysisArgs.push('-human-model', humanModelPath);
    }

    try {
      this.analysisProcess = Bun.spawn({
        cmd: [binary, ...analysisArgs],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });

      void (async () => {
        const stderr = this.analysisProcess!.stderr;
        if (!(stderr instanceof ReadableStream)) return;
        const reader = stderr.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          console.error('[katago analysis stderr]', decoder.decode(value));
        }
      })();
    } catch (error) {
      throw new Error(
        `Failed to spawn KataGo analysis engine: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.analysisProcess.exited.then(() => this.handleProcessDeath()).catch((err) => {
      console.error('KataGo analysis process exit monitoring error:', err);
    });

    // Wait a moment for engine to initialize, then get version
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const versionResponse = await this.sendCommand('version', 5000);
      this.version = versionResponse.trim();
    } catch {
      // version command may not be supported; ignore
    }
  }

  private handleProcessDeath(): void {
    if (this.shuttingDown || this.engineDead) return;
    if (this.restartAttempted) {
      this.engineDead = true;
      console.error('KataGo process died and restart already attempted; marking engine as dead');
      return;
    }
    console.error('KataGo process died; attempting restart with exponential backoff...');
    this.restartAttempted = true;
    void this.attemptRestart();
  }

  private async attemptRestart(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      this.stopInternal();
      this.restartAttempted = false;
      await this.start();
      this.engineDead = false;
      console.log('KataGo restart successful');
    } catch (error) {
      this.engineDead = true;
      console.error(
        'KataGo restart failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private tryParseAnalysisResponse(line: string): AnalysisEngineResponse | null {
    try {
      return JSON.parse(line) as AnalysisEngineResponse;
    } catch {
      return null;
    }
  }

  private async startReader(): Promise<void> {
    if (this.readerRunning || this.process === null) return;
    this.readerRunning = true;

    if (!(this.process.stdout instanceof ReadableStream)) {
      throw new Error('KataGo stdout is not a ReadableStream');
    }
    const lines = readLines(this.process.stdout);
    let buffer: string[] = [];
    let inResponse = false;

    try {
      for await (const line of lines) {
        if (!inResponse) {
          if (line.startsWith('=') || line.startsWith('?')) {
            inResponse = true;
            buffer = [line];
          }
        } else {
          if (line === '') {
            const response = buffer.join('\n');
            inResponse = false;
            buffer = [];

            if (this.responseResolve !== null) {
              this.responseResolve(response);
              this.responseResolve = null;
              this.responseReject = null;
            }
          } else {
            buffer.push(line);
          }
        }
      }
    } catch (error) {
      if (this.responseReject !== null) {
        this.responseReject(
          error instanceof Error ? error : new Error(String(error))
        );
        this.responseResolve = null;
        this.responseReject = null;
      }
    } finally {
      this.readerRunning = false;
    }
  }

  sendCommand(command: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(`Command timed out after ${timeoutMs}ms: ${command}`)
        );
      }, timeoutMs);

      const wrappedResolve = (value: string) => {
        clearTimeout(timeout);
        resolve(value);
      };

      const wrappedReject = (reason: Error) => {
        clearTimeout(timeout);
        reject(reason);
      };

      this.commandQueue.push({
        command,
        resolve: wrappedResolve,
        reject: wrappedReject,
      });

      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.commandQueue.length === 0) return;
    this.isProcessing = true;

    const item = this.commandQueue.shift()!;

    try {
      if (this.process === null || this.process.stdin === undefined) {
        throw new Error('KataGo process is not running');
      }

      // Create a promise that will be resolved by the reader
      const responsePromise = new Promise<string>((resolve, reject) => {
        this.responseResolve = resolve;
        this.responseReject = reject;
      });

      // Write command to stdin
      const stdin = this.process.stdin;
      if (stdin === undefined) {
        throw new Error('KataGo stdin is undefined');
      }
      if (typeof stdin === 'object' && 'write' in stdin && typeof stdin.write === 'function') {
        // Bun.spawn returns FileSink for stdin
        const sink = stdin as Bun.FileSink;
        await sink.write(`${item.command}\n`);
        await sink.flush();
      } else if (stdin instanceof WritableStream) {
        const writer = stdin.getWriter();
        await writer.write(new TextEncoder().encode(`${item.command}\n`));
        writer.releaseLock();
      } else {
        throw new Error('KataGo stdin is not writable');
      }

      // Wait for response
      const response = await responsePromise;

      if (response.startsWith('?')) {
        throw new Error(response.substring(1).trim());
      }

      item.resolve(response.substring(1).trim());
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isProcessing = false;
      // Process next command
      setTimeout(() => void this.processQueue(), 0);
    }
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    if (request.signal?.aborted) {
      throw new Error('Analysis was cancelled')
    }

    if (this.analyzing) {
      return new Promise((resolve, reject) => {
        const abortHandler = () => {
          const idx = this.analysisQueue.findIndex(
            (item) => item.request.signal === request.signal,
          )
          if (idx !== -1) {
            this.analysisQueue.splice(idx, 1)
          }
          reject(new Error('Analysis was cancelled'))
        }
        request.signal?.addEventListener('abort', abortHandler, { once: true })
        this.analysisQueue.push({ request, resolve, reject })
      })
    }
    return this.executeAnalysis(request);
  }

  private async executeAnalysis(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    this.analyzing = true;
    try {
      return await this.doAnalyze(request);
    } finally {
      this.analyzing = false;
      this.drainAnalysisQueue();
    }
  }

  private drainAnalysisQueue(): void {
    if (this.analysisQueue.length === 0) return;
    const next = this.analysisQueue.shift()!;
    this.executeAnalysis(next.request).then(next.resolve).catch(next.reject);
  }

  private async doAnalyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const { boardSize, moves, komi, maxVisits, maxTime, humanSLProfile, wideRootNoise, includeOwnership, signal } =
      request;

    if (this.analysisProcess === null) {
      throw new Error('KataGo analysis engine is not running');
    }

    // Normalize moves to GTP format strings
    const normalizedMoves: AnalysisEngineMove[] = moves.map((m) => {
      if (typeof m === 'string') {
        const parts = m.split(' ');
        return [parts[0]?.toLowerCase() ?? 'b', parts[1] ?? 'pass'] as AnalysisEngineMove;
      }
      return [m.player.toLowerCase(), m.vertex] as AnalysisEngineMove;
    });

    const query: AnalysisEngineQuery = {
      id: 'analyze',
      moves: normalizedMoves,
      rules: 'tromp-taylor',
      komi,
      boardXSize: boardSize,
      boardYSize: boardSize,
      analyzeTurns: [normalizedMoves.length],
      includeOwnership: includeOwnership ?? true,
    };

    if (maxVisits !== undefined) {
      (query as unknown as Record<string, unknown>).maxVisits = maxVisits;
    }
    if (maxTime !== undefined) {
      (query as unknown as Record<string, unknown>).maxTime = maxTime;
    }
    const q = query as unknown as Record<string, unknown>;
    if (humanSLProfile !== undefined || wideRootNoise !== undefined) {
      const overrides: Record<string, unknown> = {};
      if (humanSLProfile !== undefined) overrides.humanSLProfile = humanSLProfile;
      if (wideRootNoise !== undefined) overrides.wideRootNoise = wideRootNoise;
      q.overrideSettings = overrides;
    }

    // Send query to analysis engine
    const stdin = this.analysisProcess.stdin;
    if (stdin === undefined) {
      throw new Error('KataGo analysis stdin is undefined');
    }

    const queryStr = JSON.stringify(query) + '\n';
    console.log('[bridge] Sending analysis query:', queryStr.substring(0, 200));
    if (typeof stdin === 'object' && 'write' in stdin && typeof stdin.write === 'function') {
      const sink = stdin as Bun.FileSink;
      const written = sink.write(queryStr);
      await sink.flush();
      console.log('[bridge] Query written to stdin, bytes:', written);
    } else if (stdin instanceof WritableStream) {
      const writer = stdin.getWriter();
      await writer.write(new TextEncoder().encode(queryStr));
      writer.releaseLock();
      console.log('[bridge] Query written to WritableStream');
    } else {
      throw new Error('KataGo analysis stdin is not writable');
    }

    const stdout = this.analysisProcess.stdout;
    if (stdout === undefined || !(stdout instanceof ReadableStream)) {
      throw new Error('KataGo analysis stdout is not a ReadableStream');
    }

    const lines = readLines(stdout);
    let firstResult: AnalysisEngineResponse | null = null;
    let abortConsumed = false;
    let lineCount = 0;

    for await (const line of lines) {
      lineCount++;
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const parsed = this.tryParseAnalysisResponse(trimmed);
      if (parsed === null) {
        console.log('[bridge] Skipping non-JSON line', lineCount, ':', trimmed.substring(0, 100));
        continue;
      }
      if (parsed.id !== 'analyze') {
        console.log('[bridge] Skipping line with different id:', parsed.id);
        continue;
      }

      if (parsed.rootInfo !== undefined) {
        if (firstResult === null) {
          firstResult = parsed;
          console.log('[bridge] Captured firstResult at line', lineCount, '- isDuringSearch:', parsed.isDuringSearch, 'winrate:', parsed.rootInfo.winrate, 'scoreLead:', parsed.rootInfo.scoreLead);
        }
      }

      if (signal?.aborted && !abortConsumed) {
        abortConsumed = true;
        console.log('[bridge] Analysis aborted via signal after', lineCount, 'lines');
      }

      if (parsed.isDuringSearch === false) {
        console.log('[bridge] Got final result at line', lineCount, 'hasOwnership:', parsed.ownership !== undefined);
        firstResult = parsed;
        break;
      }
      if (abortConsumed) {
        console.log('[bridge] Breaking due to abort at line', lineCount);
        break;
      }
    }

    console.log('[bridge] Read total', lineCount, 'lines, firstResult:', firstResult !== null);
    const result = firstResult;
    if (result === null) {
      throw new Error('No valid analyze result received from KataGo analysis engine');
    }

    const rootInfo = result.rootInfo;
    const moveInfos = result.moveInfos;
    const ownership = result.ownership;

    return {
      winrate: rootInfo?.winrate ?? 0,
      scoreLead: rootInfo?.scoreLead ?? 0,
      ownership: ownership,
      bestMoves:
        moveInfos?.map((m): BestMoveInfo => ({
          move: m.move ?? 'pass',
          visits: m.visits ?? 0,
          winrate: m.winrate ?? 0,
          scoreLead: m.scoreLead ?? 0,
          ...(m.pv !== undefined ? { pv: m.pv } : {}),
        })) ?? [],
      completed: result.isDuringSearch === false,
    };
  }

  isEngineDead(): boolean {
    return this.engineDead;
  }

  async health(): Promise<HealthResponse> {
    if (this.engineDead || this.process === null || this.analysisProcess === null) {
      return { status: 'error' };
    }
    try {
      await this.sendCommand('name', 5000);
      const humanModelPath = getEnv('HUMAN_MODEL_PATH');
      return {
        status: 'ok',
        version: this.version,
        humanModelAvailable: humanModelPath !== undefined && humanModelPath !== '',
      };
    } catch {
      return { status: 'error' };
    }
  }

  private stopInternal(): void {
    if (this.process !== null) {
      this.process.kill();
      this.process = null;
    }
    if (this.analysisProcess !== null) {
      this.analysisProcess.kill();
      this.analysisProcess = null;
    }
  }

  stop(): void {
    this.shuttingDown = true;
    this.stopInternal();
  }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

export function createServer(bridge: KataGoBridge): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: getPort(),
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      try {
        if (bridge.isEngineDead()) {
          return new Response(
            JSON.stringify({ error: '엔진 연결 실패' }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        }

        if (pathname === '/api/gtp/health' && request.method === 'GET') {
          const health = await bridge.health();
          const statusCode = health.status === 'ok' ? 200 : 503;
          return new Response(JSON.stringify(health), {
            status: statusCode,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        if (pathname === '/api/gtp/command' && request.method === 'POST') {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid JSON body' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

          if (
            body === null ||
            typeof body !== 'object' ||
            !('command' in body) ||
            typeof body.command !== 'string'
          ) {
            return new Response(
              JSON.stringify({ error: 'Missing or invalid "command" field' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

          const cmd = body as GtpCommandRequest;
          const fullCommand =
            cmd.args !== undefined && cmd.args.length > 0
              ? `${cmd.command} ${cmd.args.join(' ')}`
              : cmd.command;

          try {
            const response = await bridge.sendCommand(fullCommand);
            const result: GtpCommandResponse = { response };
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const result: GtpCommandResponse = { response: '', error: message };
            return new Response(JSON.stringify(result), {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
        }

        if (pathname === '/api/gtp/analyze' && request.method === 'POST') {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid JSON body' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

          if (
            body === null ||
            typeof body !== 'object' ||
            !('boardSize' in body) ||
            typeof body.boardSize !== 'number' ||
            !('moves' in body) ||
            !Array.isArray(body.moves) ||
            !('komi' in body) ||
            typeof body.komi !== 'number'
          ) {
            return new Response(
              JSON.stringify({
                error:
                  'Missing or invalid fields: boardSize (number), moves (array), komi (number)',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

          const analyzeReq: AnalyzeRequest = {
            ...(body as Omit<AnalyzeRequest, 'signal'>),
            signal: request.signal,
          };

          try {
            const result = await bridge.analyze(analyzeReq);
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return new Response(
              JSON.stringify({ error: message }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }
        }

        if (pathname === '/api/gtp/terminate' && request.method === 'POST') {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const bridge = new KataGoBridge();

  try {
    await bridge.start();
    const server = createServer(bridge);
    console.log(`KataGo GTP bridge listening on port ${server.port}`);

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down...');
      bridge.stop();
      server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error(
      'Failed to start KataGo bridge:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
