/**
 * Bun HTTP bridge server that wraps KataGo's GTP protocol.
 *
 * Spawns `katago gtp` as a child process and exposes REST endpoints
 * for the frontend to communicate with KataGo.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
  readonly numSearchThreads?: number;
  readonly humanSLProfile?: string;
  readonly wideRootNoise?: number;
  readonly playoutDoublingAdvantage?: number;
  readonly includePolicy?: boolean;
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
  readonly visits?: number | undefined;
  readonly ownership?: number[] | undefined;
  readonly policy?: number[] | undefined;
  readonly bestMoves?: BestMoveInfo[] | undefined;
  readonly completed: boolean;
}

export interface HealthResponse {
  readonly status: 'ok' | 'error';
  readonly version?: string | undefined;
  readonly humanModelAvailable?: boolean | undefined;
}

export interface ModelInfo {
  readonly name: string;
  readonly path: string;
  readonly current: boolean;
}

export interface ModelListResponse {
  readonly currentModelPath: string | null;
  readonly currentAnalysisModelPath: string | null;
  readonly models: readonly ModelInfo[];
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
  readonly numSearchThreads?: number;
  readonly humanSLProfile?: string;
  readonly includeOwnership?: boolean;
  readonly includePolicy?: boolean;
  readonly reportDuringSearch?: boolean;
  readonly reportDuringSearchEvery?: number;
}

interface AnalysisEngineResponse {
  readonly id: string;
  readonly isDuringSearch: boolean;
  readonly rootInfo?: {
    readonly visits?: number;
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
  readonly policy?: number[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Resolution order for every knob: **env var > config/engine.json > default**.
// This keeps tests able to override (e.g. `PORT=0`) while letting users put
// machine-specific paths in a committed-ignored config file.

interface EngineConfig {
  readonly katagoBinary?: string;
  readonly katagoConfigPath?: string;
  readonly modelPath?: string;
  /** Optional separate model for the analysis engine; falls back to modelPath. */
  readonly analysisModelPath?: string;
  readonly humanModelPath?: string;
  readonly analysisConfigPath?: string | null;
  readonly port?: number;
}

let cachedFileConfig: Partial<EngineConfig> | null = null;

/** Runtime model switch target — set by POST /api/gtp/model, lives until the bridge restarts. */
let modelPathOverride: string | null = null;
/** Runtime analysis-model switch target — switches only the analysis process. */
let analysisModelPathOverride: string | null = null;

function loadFileConfig(): Partial<EngineConfig> {
  if (cachedFileConfig !== null) return cachedFileConfig;
  if (import.meta.dir === undefined) {
    cachedFileConfig = {};
    return cachedFileConfig;
  }
  const path = `${import.meta.dir}/../../config/engine.json`;
  try {
    if (!existsSync(path)) {
      cachedFileConfig = {};
      return cachedFileConfig;
    }
    const text = readFileSync(path, 'utf8');
    cachedFileConfig = JSON.parse(text) as Partial<EngineConfig>;
    return cachedFileConfig;
  } catch (error) {
    console.warn(
      `Failed to load config/engine.json: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    cachedFileConfig = {};
    return cachedFileConfig;
  }
}

/** Reset the config cache. Exposed for tests that swap config/env. */
export function resetEngineConfigCache(): void {
  cachedFileConfig = null;
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return `${process.env.HOME ?? ''}${p.slice(1)}`;
  }
  return p;
}

function getEnv(name: string): string | undefined {
  return Bun.env[name];
}

function getKatagoBinary(): string {
  return getEnv('KATAGO_BINARY') ?? loadFileConfig().katagoBinary ?? 'katago';
}

function getKatagoConfigPath(): string {
  return (
    getEnv('KATAGO_CONFIG_PATH') ??
    loadFileConfig().katagoConfigPath ??
    '/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/gtp_example.cfg'
  );
}

function getModelPath(): string {
  // Priority: env var > runtime override (model switch) > config file.
  const raw =
    getEnv('KATAGO_MODEL_PATH') ??
    modelPathOverride ??
    loadFileConfig().modelPath;
  if (raw === undefined || raw === '') {
    throw new Error(
      'Missing model path. Set `modelPath` in config/engine.json (see config/engine.example.json) or export KATAGO_MODEL_PATH.'
    );
  }
  return expandHome(raw);
}

/** Model for the analysis engine — dedicated override/config, else the main model. */
function getAnalysisModelPath(): string {
  const raw =
    getEnv('KATAGO_ANALYSIS_MODEL_PATH') ??
    analysisModelPathOverride ??
    loadFileConfig().analysisModelPath;
  if (raw === undefined || raw === '') return getModelPath();
  return expandHome(raw);
}

function getHumanModelPath(): string | undefined {
  const raw = getEnv('HUMAN_MODEL_PATH') ?? loadFileConfig().humanModelPath;
  return raw && raw !== '' ? expandHome(raw) : undefined;
}

function getAnalysisConfigPath(): string | undefined {
  const raw =
    getEnv('KATAGO_ANALYSIS_CONFIG_PATH') ?? loadFileConfig().analysisConfigPath;
  return raw && raw !== '' ? raw : undefined;
}

function getPort(): number {
  const raw = getEnv('PORT') ?? loadFileConfig().port ?? 8787;
  const port = Number(raw);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
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
  /** In-flight stdout reader loop for the current GTP process; null when not reading. */
  private readerDone: Promise<void> | null = null;
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
    const modelPath = getModelPath();
    const configPath = getKatagoConfigPath();
    const humanModelPath = getHumanModelPath();

    const args = ['gtp', '-model', modelPath, '-config', configPath];
    if (humanModelPath !== undefined) {
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
    await this.spawnAnalysisProcess();

    // Wait a moment for engine to initialize, then get version
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const versionResponse = await this.sendCommand('version', 5000);
      this.version = versionResponse.trim();
    } catch {
      // version command may not be supported; ignore
    }
  }

  /**
   * Spawn (or re-spawn) only the analysis engine. Runs with its own model
   * (analysisModelPath / override) so analysis can use a lighter net than
   * the play engine without touching the GTP process.
   */
  private async spawnAnalysisProcess(): Promise<void> {
    const binary = getKatagoBinary();
    const analysisModelPath = getAnalysisModelPath();
    const humanModelPath = getHumanModelPath();
    const analysisConfigPath =
      getAnalysisConfigPath() ??
      (await resolveDefaultAnalysisConfig()) ??
      '/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/analysis_example.cfg';
    const analysisArgs = ['analysis', '-model', analysisModelPath, '-config', analysisConfigPath];
    if (humanModelPath !== undefined) {
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
    // Guard against a second reader on the same stdout. The previous
    // reader finishes (and clears readerDone) once its stream closes —
    // e.g. right after a kill in switchModel.
    if (this.readerDone !== null || this.process === null) return;

    if (!(this.process.stdout instanceof ReadableStream)) {
      throw new Error('KataGo stdout is not a ReadableStream');
    }
    const lines = readLines(this.process.stdout);
    let buffer: string[] = [];
    let inResponse = false;

    this.readerDone = (async () => {
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
        this.readerDone = null;
      }
    })();
  }

  /** Wait (bounded) for the current stdout reader loop to finish. */
  private async waitForReaderExit(): Promise<void> {
    if (this.readerDone === null) return;
    await Promise.race([
      this.readerDone,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
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
    const { boardSize, moves, komi, maxVisits, maxTime, numSearchThreads, humanSLProfile, wideRootNoise, playoutDoublingAdvantage, includeOwnership, includePolicy, signal } =
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
    if (numSearchThreads !== undefined) {
      (query as unknown as Record<string, unknown>).numSearchThreads = numSearchThreads;
    }
    if (includePolicy === true) {
      (query as unknown as Record<string, unknown>).includePolicy = true;
    }
    const q = query as unknown as Record<string, unknown>;
    if (humanSLProfile !== undefined || wideRootNoise !== undefined || playoutDoublingAdvantage !== undefined) {
      const overrides: Record<string, unknown> = {};
      if (humanSLProfile !== undefined) overrides.humanSLProfile = humanSLProfile;
      if (wideRootNoise !== undefined) overrides.wideRootNoise = wideRootNoise;
      if (playoutDoublingAdvantage !== undefined) overrides.playoutDoublingAdvantage = playoutDoublingAdvantage;
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
      // Older/custom KataGo builds may omit rootInfo.visits. In that case,
      // the move visit counts provide a useful fallback for the summary.
      visits:
        rootInfo?.visits ??
        moveInfos?.reduce((total, move) => total + (move.visits ?? 0), 0),
      ownership: ownership,
      policy: result.policy,
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

  /**
   * List KataGo model files found next to the current model, with the
   * active one flagged. Works even when the engine is dead so the user
   * can switch models to recover.
   */
  listModels(): ModelListResponse {
    let currentModelPath: string | null = null;
    let currentAnalysisModelPath: string | null = null;
    try {
      currentModelPath = expandHome(getModelPath());
      currentAnalysisModelPath = expandHome(getAnalysisModelPath());
    } catch {
      // No model configured (fresh clone, env-only setups) — empty list.
      return { currentModelPath: null, currentAnalysisModelPath: null, models: [] };
    }
    const dir = dirname(currentModelPath);
    const humanPath = getHumanModelPath();
    if (!existsSync(dir)) {
      return { currentModelPath, currentAnalysisModelPath, models: [] };
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return { currentModelPath, currentAnalysisModelPath, models: [] };
    }
    const models = entries
      .filter((name) => /\.(bin\.gz|txt\.gz)$/.test(name))
      .filter((name) => humanPath === undefined || `${dir}/${name}` !== humanPath)
      .sort()
      .map((name) => ({
        name,
        path: `${dir}/${name}`,
        current: `${dir}/${name}` === currentModelPath,
      }));
    return { currentModelPath, currentAnalysisModelPath, models };
  }

  /**
   * Switch the model at runtime and respawn the affected engine(s).
   *
   * - target 'main' (default): persists to `modelPath` and respawns BOTH
   *   the GTP and analysis processes.
   * - target 'analysis': persists to `analysisModelPath` and respawns ONLY
   *   the analysis process, letting analysis run a lighter model than play.
   *
   * The choice is persisted to config/engine.json either way.
   */
  async switchModel(
    modelPath: string,
    target: 'main' | 'analysis' = 'main'
  ): Promise<string> {
    const absolutePath = expandHome(modelPath);
    if (!/\.(bin\.gz|txt\.gz)$/.test(absolutePath)) {
      throw new Error('Not a KataGo model file (.bin.gz or .txt.gz)');
    }
    if (!existsSync(absolutePath)) {
      throw new Error(`Model file not found: ${absolutePath}`);
    }
    const humanPath = getHumanModelPath();
    if (humanPath !== undefined && absolutePath === humanPath) {
      throw new Error('Human-SL 모델은 메인 모델로 사용할 수 없습니다');
    }

    if (target === 'analysis') {
      analysisModelPathOverride = absolutePath;
      this.persistModelPath(absolutePath, 'analysis');
      // Kill only the analysis process. shuttingDown suppresses
      // handleProcessDeath from full-restarting on the intentional kill.
      const oldAnalysis = this.analysisProcess;
      this.shuttingDown = true;
      if (oldAnalysis !== null) {
        oldAnalysis.kill();
        this.analysisProcess = null;
      }
      this.shuttingDown = false;
      await this.spawnAnalysisProcess();
      console.log(`[bridge] Analysis model switched to ${absolutePath}`);
      return absolutePath;
    }

    modelPathOverride = absolutePath;
    this.persistModelPath(absolutePath, 'main');

    // Respawn both engines. shuttingDown suppresses handleProcessDeath
    // from racing the intentional kill with an old-model restart; it stays
    // true until the fresh processes are up.
    this.shuttingDown = true;
    this.stopInternal();
    // The kill closes the old stdout, which ends the reader loop; wait for
    // it so the next startReader() isn't skipped by the single-reader guard.
    await this.waitForReaderExit();
    this.engineDead = false;
    this.restartAttempted = false;
    try {
      await this.start();
    } finally {
      this.shuttingDown = false;
    }
    console.log(`[bridge] Model switched to ${absolutePath}`);
    return absolutePath;
  }

  private persistModelPath(
    modelPath: string,
    target: 'main' | 'analysis' = 'main'
  ): void {
    try {
      const path = `${import.meta.dir}/../../config/engine.json`;
      let json: Record<string, unknown> = {};
      if (existsSync(path)) {
        try {
          json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        } catch {
          // Replace malformed file with a minimal one.
        }
      }
      json[target === 'analysis' ? 'analysisModelPath' : 'modelPath'] = modelPath;
      writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
      resetEngineConfigCache();
    } catch (error) {
      // Non-fatal: the in-memory override still covers this session.
      console.error('Failed to persist modelPath to config/engine.json:', error);
    }
  }

  async health(): Promise<HealthResponse> {
    if (this.engineDead || this.process === null || this.analysisProcess === null) {
      return { status: 'error' };
    }
    try {
      await this.sendCommand('name', 5000);
      const humanModelPath = getHumanModelPath();
      return {
        status: 'ok',
        version: this.version,
        humanModelAvailable: humanModelPath !== undefined,
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
        // Model management — reachable even when the engine is dead so the
        // user can recover by switching to a different model file.
        if (pathname === '/api/gtp/models' && request.method === 'GET') {
          const result = bridge.listModels();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        if (pathname === '/api/gtp/model' && request.method === 'POST') {
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

          const modelPath =
            body !== null &&
            typeof body === 'object' &&
            'modelPath' in body &&
            typeof (body as { modelPath: unknown }).modelPath === 'string'
              ? (body as { modelPath: string }).modelPath
              : null;

          if (modelPath === null || modelPath === '') {
            return new Response(
              JSON.stringify({ error: 'Missing or invalid "modelPath" field' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

          const target =
            body !== null &&
            typeof body === 'object' &&
            'target' in body &&
            (body as { target: unknown }).target === 'analysis'
              ? 'analysis'
              : 'main';

          try {
            const applied = await bridge.switchModel(modelPath, target);
            return new Response(
              JSON.stringify({ ok: true, modelPath: applied, target }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return new Response(JSON.stringify({ error: message }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
        }

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
