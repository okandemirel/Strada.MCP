import { execFile as execFileCallback } from 'node:child_process';
import { access, open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DEFAULT_TAIL_BYTES = 512 * 1024;
/** Enough of the log head to reach the COMMAND LINE ARGUMENTS block. */
const LOG_HEADER_BYTES = 16 * 1024;
/** Unity batch-mode startup can include a licence round-trip; be generous. */
const UNITY_BATCH_TIMEOUT_MS = 300_000;

export type DiagnosticsSource = 'live_bridge' | 'static_editor_log' | 'static_dotnet_build' | 'unavailable';

export interface ConsoleLogEntry {
  type?: string;
  message?: string;
  stackTrace?: string;
  file?: string | null;
  line?: number | null;
  category?: string;
  timestamp?: number;
}

export interface ConsoleSnapshotPayload {
  source: DiagnosticsSource;
  bridgeMethod: 'editor.getConsoleLogs';
  entries: ConsoleLogEntry[];
  totalCount: number;
  capturedAt: number;
  bridgeError?: string;
  editorLogPath?: string;
  solutionPath?: string;
  diagnostics?: Record<string, unknown>;
}

export interface CompileStatusPayload {
  source: DiagnosticsSource;
  bridgeMethod: 'editor.compileStatus';
  /**
   * False when nothing actually verified the project. Present so a caller does
   * not have to infer "unknown" from a zero issue count, which is what an agent
   * previously read as a clean compile.
   */
  verified?: boolean;
  /** Human-readable reason, set alongside `verified: false`. */
  message?: string;
  compile: {
    isCompiling: boolean;
    isReloading: boolean;
    lastStartedAt: number | null;
    lastFinishedAt: number | null;
    lastSucceeded: boolean | null;
    /** null when unknown — distinct from 0, which means "verified, none found". */
    compileIssueCount: number | null;
    assemblyReloadCount: number;
  };
  capturedAt: number;
  bridgeError?: string;
  editorLogPath?: string;
  solutionPath?: string;
  diagnostics?: Record<string, unknown>;
}

interface StaticConsoleOptions {
  projectPath: string;
  limit: number;
  includeStackTrace: boolean;
  types?: string[];
  bridgeError: string;
}

interface StaticCompileOptions {
  projectPath: string;
  bridgeError: string;
}

interface ParsedLogSnapshot {
  entries: ConsoleLogEntry[];
  totalCount: number;
  capturedAt: number;
  editorLogPath: string;
}

interface DotnetBuildSnapshot {
  entries: ConsoleLogEntry[];
  totalCount: number;
  capturedAt: number;
  solutionPath: string;
  exitCode: number;
  command: string[];
}

export async function getStaticConsoleSnapshot(
  options: StaticConsoleOptions,
): Promise<ConsoleSnapshotPayload> {
  const editorLogSnapshot = await tryReadEditorLogSnapshot(options);
  if (editorLogSnapshot) {
    return {
      source: 'static_editor_log',
      bridgeMethod: 'editor.getConsoleLogs',
      entries: editorLogSnapshot.entries,
      totalCount: editorLogSnapshot.totalCount,
      capturedAt: editorLogSnapshot.capturedAt,
      bridgeError: options.bridgeError,
      editorLogPath: editorLogSnapshot.editorLogPath,
      diagnostics: {
        parser: 'editor_log_tail',
      },
    };
  }

  const dotnetSnapshot = await tryRunDotnetBuild(options.projectPath, options.limit);
  if (dotnetSnapshot) {
    return {
      source: 'static_dotnet_build',
      bridgeMethod: 'editor.getConsoleLogs',
      entries: dotnetSnapshot.entries,
      totalCount: dotnetSnapshot.totalCount,
      capturedAt: dotnetSnapshot.capturedAt,
      bridgeError: options.bridgeError,
      solutionPath: dotnetSnapshot.solutionPath,
      diagnostics: {
        command: dotnetSnapshot.command.join(' '),
        exitCode: dotnetSnapshot.exitCode,
      },
    };
  }

  return {
    source: 'static_editor_log',
    bridgeMethod: 'editor.getConsoleLogs',
    entries: [],
    totalCount: 0,
    capturedAt: Date.now(),
    bridgeError: options.bridgeError,
    diagnostics: {
      parser: 'unavailable',
    },
  };
}

export async function getStaticCompileStatus(
  options: StaticCompileOptions,
): Promise<CompileStatusPayload> {
  const dotnetSnapshot = await tryRunDotnetBuild(options.projectPath, 200);
  if (dotnetSnapshot) {
    const errorCount = dotnetSnapshot.entries.filter((entry) => isErrorType(entry.type)).length;
    const warningCount = dotnetSnapshot.entries.filter((entry) => String(entry.type).toLowerCase() === 'warning').length;
    return {
      source: 'static_dotnet_build',
      bridgeMethod: 'editor.compileStatus',
      compile: {
        isCompiling: false,
        isReloading: false,
        lastStartedAt: null,
        lastFinishedAt: dotnetSnapshot.capturedAt,
        lastSucceeded: dotnetSnapshot.exitCode === 0 && errorCount === 0,
        compileIssueCount: dotnetSnapshot.totalCount,
        assemblyReloadCount: 0,
      },
      capturedAt: dotnetSnapshot.capturedAt,
      bridgeError: options.bridgeError,
      solutionPath: dotnetSnapshot.solutionPath,
      diagnostics: {
        command: dotnetSnapshot.command.join(' '),
        exitCode: dotnetSnapshot.exitCode,
        errorCount,
        warningCount,
        entries: dotnetSnapshot.entries.slice(0, 20),
      },
    };
  }

  const editorLogSnapshot = await tryReadEditorLogSnapshot({
    projectPath: options.projectPath,
    limit: 200,
    includeStackTrace: true,
    bridgeError: options.bridgeError,
    types: ['warning', 'error', 'exception', 'assert'],
  });

  if (editorLogSnapshot) {
    const compileEntries = editorLogSnapshot.entries.filter((entry) => isCompileRelatedEntry(entry));
    const errorCount = compileEntries.filter((entry) => isErrorType(entry.type)).length;
    const warningCount = compileEntries.filter((entry) => String(entry.type).toLowerCase() === 'warning').length;

    if (compileEntries.length > 0) {
      return {
        source: 'static_editor_log',
        bridgeMethod: 'editor.compileStatus',
        compile: {
          isCompiling: false,
          isReloading: false,
          lastStartedAt: null,
          lastFinishedAt: editorLogSnapshot.capturedAt,
          lastSucceeded: errorCount === 0,
          compileIssueCount: compileEntries.length,
          assemblyReloadCount: 0,
        },
        capturedAt: editorLogSnapshot.capturedAt,
        bridgeError: options.bridgeError,
        editorLogPath: editorLogSnapshot.editorLogPath,
        diagnostics: {
          parser: 'editor_log_tail',
          errorCount,
          warningCount,
          entries: compileEntries.slice(0, 20),
        },
      };
    }
  }

  // Nothing could verify anything. Say so in the shape the caller reads first.
  //
  // This used to answer `source: 'static_editor_log'` with `compileIssueCount:
  // 0` and `lastSucceeded: null`, which reads as a clean compile — the zero is
  // "no data", not "no errors". Measured: an agent took exactly that payload as
  // a green signal on a project that had never been compiled at all.
  return {
    source: 'unavailable',
    bridgeMethod: 'editor.compileStatus',
    verified: false,
    message:
      'Compile status is UNKNOWN — nothing verified this project. No Unity bridge, ' +
      'no .sln for an offline `dotnet build`, and no Editor.log belonging to this project. ' +
      'Do not treat this as a successful compile.',
    compile: {
      isCompiling: false,
      isReloading: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSucceeded: null,
      compileIssueCount: null,
      assemblyReloadCount: 0,
    },
    capturedAt: Date.now(),
    bridgeError: options.bridgeError,
    diagnostics: {
      parser: 'unavailable',
    },
  };
}

/**
 * The project a Unity Editor.log belongs to, from its command-line header.
 *
 * Unity keeps ONE Editor.log per install, overwritten by whichever project was
 * opened last. Reading it without this check reports another project's compile
 * state as if it were this one's: measured, a Pixel Flow task was told
 * `compileIssueCount: 0` from a log whose header read `-projectpath
 * /Users/okan/Documents/Soak Games/Enhanced Package Manager`.
 *
 * The argument sits in the header, so this reads the head of the file, not the
 * tail the diagnostics parser uses.
 */
async function readEditorLogProjectPath(editorLogPath: string): Promise<string | null> {
  try {
    const handle = await open(editorLogPath, 'r');
    try {
      const buffer = Buffer.alloc(LOG_HEADER_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, LOG_HEADER_BYTES, 0);
      const lines = buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/);
      const flagIndex = lines.findIndex((line) => /^-projectpath$/i.test(line.trim()));
      if (flagIndex >= 0 && lines[flagIndex + 1]) {
        return lines[flagIndex + 1]!.trim() || null;
      }
      // Some Unity versions emit `-projectPath <value>` on one line.
      for (const line of lines) {
        const inline = /^-projectpath\s+(.+)$/i.exec(line.trim());
        if (inline?.[1]) return inline[1].trim();
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** Same directory, tolerating trailing slashes and symlinked temp roots. */
async function isSameProject(a: string, b: string): Promise<boolean> {
  const normalize = async (value: string): Promise<string> => {
    const trimmed = path.resolve(value.replace(/[/\\]+$/, ''));
    try {
      return await realpath(trimmed);
    } catch {
      return trimmed;
    }
  };
  return (await normalize(a)) === (await normalize(b));
}

async function tryReadEditorLogSnapshot(
  options: StaticConsoleOptions,
): Promise<ParsedLogSnapshot | null> {
  const editorLogPath = await findUnityEditorLogPath();
  if (!editorLogPath) {
    return null;
  }

  // Refuse a log that belongs to a different project rather than reporting its
  // state as this project's.
  const logProject = await readEditorLogProjectPath(editorLogPath);
  if (logProject && !(await isSameProject(logProject, options.projectPath))) {
    return null;
  }

  try {
    await access(editorLogPath);
    const capturedAt = (await stat(editorLogPath)).mtimeMs;
    const raw = await readTail(editorLogPath, DEFAULT_TAIL_BYTES);
    const lines = raw.split(/\r?\n/);
    const entries = parseConsoleEntries(lines, options.includeStackTrace);
    const filteredEntries = entries.filter((entry) => matchesRequestedTypes(entry, options.types));

    return {
      entries: filteredEntries.slice(-options.limit),
      totalCount: filteredEntries.length,
      capturedAt,
      editorLogPath,
    };
  } catch {
    return null;
  }
}

async function tryRunDotnetBuild(
  projectPath: string,
  limit: number,
): Promise<DotnetBuildSnapshot | null> {
  const solutionPath =
    (await findSolutionPath(projectPath)) ?? (await trySyncSolutionHeadless(projectPath));
  if (!solutionPath) {
    return null;
  }

  const command = ['build', solutionPath, '--nologo', '--verbosity', 'minimal', '--no-restore'];
  const capturedAt = Date.now();

  try {
    const result = await execFile('dotnet', command, {
      cwd: projectPath,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const entries = parseDotnetBuildEntries(`${result.stdout}\n${result.stderr}`.split(/\r?\n/)).slice(-limit);
    return {
      entries,
      totalCount: entries.length,
      capturedAt,
      solutionPath,
      exitCode: 0,
      command: ['dotnet', ...command],
    };
  } catch (error) {
    const stdout = typeof error === 'object' && error && 'stdout' in error ? String(error.stdout ?? '') : '';
    const stderr = typeof error === 'object' && error && 'stderr' in error ? String(error.stderr ?? '') : '';
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'number'
      ? error.code
      : 1;
    const entries = parseDotnetBuildEntries(`${stdout}\n${stderr}`.split(/\r?\n/)).slice(-limit);

    if (entries.length === 0) {
      return null;
    }

    return {
      entries,
      totalCount: entries.length,
      capturedAt,
      solutionPath,
      exitCode: code,
      command: ['dotnet', ...command],
    };
  }
}

async function findUnityEditorLogPath(): Promise<string | null> {
  const envPath = process.env.UNITY_EDITOR_LOG_PATH?.trim();
  const homeDir = os.homedir();
  const candidates = envPath
    ? [envPath]
    : [
      path.join(homeDir, 'Library', 'Logs', 'Unity', 'Editor.log'),
      path.join(homeDir, 'AppData', 'Local', 'Unity', 'Editor', 'Editor.log'),
      path.join(homeDir, '.config', 'unity3d', 'Editor.log'),
    ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Ask Unity to regenerate the IDE solution, headless.
 *
 * The offline compile path (`dotnet build`) needs a .sln, and Unity only writes
 * one when a project is opened in the editor. A project an agent just created
 * therefore had no .sln, `tryRunDotnetBuild` returned null, and the only
 * remaining source was a stale Editor.log — so nothing ever compiled the code
 * the agent wrote.
 *
 * `-batchmode -quit -nographics` needs no display and no human. It is slow
 * (tens of seconds, sometimes a licence round-trip), so it runs ONLY when a
 * solution is missing; once written, later builds reuse it.
 *
 * Returns the solution path, or null with the reason left to the caller — a
 * missing editor, an unlicensed machine, or a CI box without Unity are all
 * ordinary, and none of them should fail the diagnostic.
 */
async function trySyncSolutionHeadless(projectPath: string): Promise<string | null> {
  const editor = await findUnityEditorBinary(projectPath);
  if (!editor) return null;

  try {
    await execFile(
      editor,
      [
        '-batchmode',
        '-quit',
        '-nographics',
        '-projectPath',
        projectPath,
        '-executeMethod',
        'UnityEditor.SyncVS.SyncSolution',
        '-logFile',
        '-',
      ],
      { cwd: projectPath, timeout: UNITY_BATCH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    );
  } catch {
    // A non-zero exit still often leaves a usable solution behind, so fall
    // through and look rather than trusting the exit code.
  }

  return findSolutionPath(projectPath);
}

/**
 * Locate a Unity editor binary for this project.
 *
 * Prefers the exact version in ProjectSettings/ProjectVersion.txt, because
 * opening a project with a newer editor silently upgrades it — a destructive
 * side effect no diagnostic should cause.
 */
async function findUnityEditorBinary(projectPath: string): Promise<string | null> {
  const configured = process.env.UNITY_EDITOR_PATH?.trim();
  if (configured) {
    try {
      await access(configured);
      return configured;
    } catch {
      return null;
    }
  }

  let version: string | null = null;
  try {
    const raw = await readFile(path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8');
    version = /m_EditorVersion:\s*(\S+)/.exec(raw)?.[1] ?? null;
  } catch {
    version = null;
  }
  if (!version) return null;

  const candidates = [
    path.join('/Applications/Unity/Hub/Editor', version, 'Unity.app/Contents/MacOS/Unity'),
    path.join(os.homedir(), 'Applications/Unity/Hub/Editor', version, 'Unity.app/Contents/MacOS/Unity'),
    `C:\\Program Files\\Unity\\Hub\\Editor\\${version}\\Editor\\Unity.exe`,
    path.join(os.homedir(), 'Unity/Hub/Editor', version, 'Editor/Unity'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function findSolutionPath(projectPath: string): Promise<string | null> {
  try {
    const entries = await readdir(projectPath, { withFileTypes: true });
    const solution = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sln'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))[0];

    return solution ? path.join(projectPath, solution) : null;
  } catch {
    return null;
  }
}

async function readTail(filePath: string, maxBytes: number): Promise<string> {
  const fileStat = await stat(filePath);
  const start = Math.max(0, fileStat.size - maxBytes);
  const length = Math.max(0, fileStat.size - start);
  const handle = await open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString('utf8');
    if (start > 0) {
      const newlineIndex = text.indexOf('\n');
      text = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : text;
    }
    return text;
  } finally {
    await handle.close();
  }
}

function parseConsoleEntries(lines: string[], includeStackTrace: boolean): ConsoleLogEntry[] {
  const entries: ConsoleLogEntry[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (includeStackTrace && isStackTraceLine(line) && entries.length > 0) {
      const previous = entries[entries.length - 1];
      previous.stackTrace = previous.stackTrace
        ? `${previous.stackTrace}\n${line.trim()}`
        : line.trim();
      continue;
    }

    const parsedLocation = parseLocation(line);
    entries.push({
      type: classifyLineType(line),
      message: line.trim(),
      file: parsedLocation.file,
      line: parsedLocation.line,
      timestamp: Date.now(),
    });
  }

  return entries;
}

function parseDotnetBuildEntries(lines: string[]): ConsoleLogEntry[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\b(?:error|warning)\b/i.test(line))
    .map((line) => {
      const parsedLocation = parseLocation(line);
      return {
        type: classifyLineType(line),
        message: line,
        file: parsedLocation.file,
        line: parsedLocation.line,
        timestamp: Date.now(),
      };
    });
}

function classifyLineType(line: string): string {
  if (/\b(assert|exception)\b/i.test(line)) {
    return /\bassert\b/i.test(line) ? 'assert' : 'exception';
  }

  if (/\berror\b/i.test(line) || /\bCS\d{4}\b/.test(line)) {
    return 'error';
  }

  if (/\bwarning\b/i.test(line)) {
    return 'warning';
  }

  return 'log';
}

function parseLocation(line: string): { file: string | null; line: number | null } {
  const unityStyle = /([A-Za-z0-9_./\\-]+\.(?:cs|uxml|uss|shader|asmdef))\((\d+)(?:,\d+)?\)/.exec(line);
  if (unityStyle) {
    return { file: unityStyle[1], line: Number.parseInt(unityStyle[2], 10) };
  }

  const stackStyle = /([A-Za-z0-9_./\\-]+\.(?:cs|uxml|uss|shader|asmdef)):(\d+)/.exec(line);
  if (stackStyle) {
    return { file: stackStyle[1], line: Number.parseInt(stackStyle[2], 10) };
  }

  return { file: null, line: null };
}

function matchesRequestedTypes(entry: ConsoleLogEntry, requestedTypes?: string[]): boolean {
  if (!requestedTypes || requestedTypes.length === 0) {
    return true;
  }

  return requestedTypes.includes(String(entry.type ?? '').toLowerCase());
}

function isStackTraceLine(line: string): boolean {
  return /^\s*at\b/.test(line) || /^\s*\(at .+\)$/.test(line);
}

function isCompileRelatedEntry(entry: ConsoleLogEntry): boolean {
  const message = `${entry.message ?? ''}\n${entry.stackTrace ?? ''}`;
  return /\b(?:CS|BC|NU)\d{4}\b/.test(message)
    || /\b(?:compil(?:e|ation)|script error|assembly|namespace|type or namespace)\b/i.test(message)
    || Boolean(entry.file?.endsWith('.cs'));
}

function isErrorType(type: string | undefined): boolean {
  const normalized = String(type ?? '').toLowerCase();
  return normalized === 'error' || normalized === 'exception' || normalized === 'assert';
}
