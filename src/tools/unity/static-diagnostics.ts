import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../utils/process-runner.js';

export type DiagnosticSource = 'live_bridge' | 'static_editor_log' | 'static_dotnet_build';

export interface DiagnosticConsoleEntry {
  type?: string;
  message?: string;
  stackTrace?: string;
  file?: string | null;
  line?: number | null;
  code?: string | null;
}

export interface DiagnosticConsoleSnapshot {
  source: DiagnosticSource;
  entries: DiagnosticConsoleEntry[];
  totalCount: number;
  bridgeError?: string;
  logPath?: string | null;
}

export interface StaticCompileStatusResult {
  source: DiagnosticSource;
  isCompiling: boolean;
  isReloading: boolean;
  lastSucceeded: boolean | null;
  compileIssueCount: number;
  issues: DiagnosticConsoleEntry[];
  bridgeError?: string;
  solutionPath?: string | null;
  logPath?: string | null;
}

const COMPILER_LINE_RE =
  /^(?<file>.+?)\((?<line>\d+)(?:,\d+)?\):\s*(?<severity>error|warning)\s+(?<code>[A-Za-z]+\d+):\s*(?<message>.+)$/u;
const SIMPLE_COMPILER_LINE_RE =
  /^(?<severity>error|warning)\s+(?<code>[A-Za-z]+\d+):\s*(?<message>.+)$/u;
const LOG_SEVERITY_RE = /\b(error|warning|exception|assert)\b/iu;

function classifySeverity(line: string): string {
  const compilerMatch = line.match(COMPILER_LINE_RE) ?? line.match(SIMPLE_COMPILER_LINE_RE);
  if (compilerMatch?.groups?.severity) {
    return compilerMatch.groups.severity.toLowerCase();
  }

  const match = line.match(LOG_SEVERITY_RE);
  return match?.[1]?.toLowerCase() ?? 'log';
}

function parseCompilerEntry(line: string): DiagnosticConsoleEntry | null {
  const compilerMatch = line.match(COMPILER_LINE_RE);
  if (compilerMatch?.groups) {
    return {
      type: compilerMatch.groups.severity.toLowerCase(),
      message: compilerMatch.groups.message.trim(),
      file: compilerMatch.groups.file.trim(),
      line: Number.parseInt(compilerMatch.groups.line, 10),
      code: compilerMatch.groups.code.trim(),
    };
  }

  const simpleMatch = line.match(SIMPLE_COMPILER_LINE_RE);
  if (simpleMatch?.groups) {
    return {
      type: simpleMatch.groups.severity.toLowerCase(),
      message: simpleMatch.groups.message.trim(),
      file: null,
      line: null,
      code: simpleMatch.groups.code.trim(),
    };
  }

  return null;
}

function parseStaticLogEntries(raw: string): DiagnosticConsoleEntry[] {
  const lines = raw.split(/\r?\n/u);
  const entries: DiagnosticConsoleEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }

    const compilerEntry = parseCompilerEntry(line);
    if (compilerEntry) {
      entries.push(compilerEntry);
      continue;
    }

    const lowered = line.toLowerCase();
    if (!lowered.includes('error') && !lowered.includes('warning') && !lowered.includes('exception')) {
      continue;
    }

    entries.push({
      type: classifySeverity(line),
      message: line,
      file: null,
      line: null,
    });
  }

  return entries;
}

function filterEntries(
  entries: DiagnosticConsoleEntry[],
  options: {
    limit: number;
    types?: readonly string[];
  },
): DiagnosticConsoleEntry[] {
  const allowed = options.types?.map((type) => type.toLowerCase()) ?? null;
  const filtered = allowed
    ? entries.filter((entry) => allowed.includes(String(entry.type ?? 'log').toLowerCase()))
    : entries;

  return filtered.slice(-options.limit).reverse();
}

async function findUnityEditorLog(projectPath: string): Promise<string | null> {
  const candidates = [
    path.join(projectPath, 'Logs', 'Editor.log'),
    path.join(os.homedir(), 'Library', 'Logs', 'Unity', 'Editor.log'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function findSolutionPath(projectPath: string): Promise<string | null> {
  try {
    const entries = await readdir(projectPath);
    const solutions = entries.filter((entry) => entry.endsWith('.sln')).sort();
    if (solutions.length === 0) {
      return null;
    }

    return path.join(projectPath, solutions[0]!);
  } catch {
    return null;
  }
}

export async function loadStaticConsoleSnapshot(
  projectPath: string,
  options: {
    limit: number;
    types?: readonly string[];
    bridgeError?: string;
  },
): Promise<DiagnosticConsoleSnapshot> {
  const logPath = await findUnityEditorLog(projectPath);
  if (!logPath) {
    return {
      source: 'static_editor_log',
      entries: [],
      totalCount: 0,
      bridgeError: options.bridgeError,
      logPath: null,
    };
  }

  const content = await readFile(logPath, 'utf8');
  const entries = parseStaticLogEntries(content);
  return {
    source: 'static_editor_log',
    entries: filterEntries(entries, { limit: options.limit, types: options.types }),
    totalCount: entries.length,
    bridgeError: options.bridgeError,
    logPath,
  };
}

export async function loadStaticCompileStatus(
  projectPath: string,
  options: {
    bridgeError?: string;
    dotnetTimeoutMs?: number;
    limit?: number;
  } = {},
): Promise<StaticCompileStatusResult> {
  const solutionPath = await findSolutionPath(projectPath);
  if (solutionPath) {
    try {
      const build = await runProcess(
        'dotnet',
        ['build', path.basename(solutionPath), '-nologo', '-v', 'minimal'],
        {
          cwd: path.dirname(solutionPath),
          timeout: options.dotnetTimeoutMs ?? 60_000,
        },
      );
      const issues = parseStaticLogEntries(`${build.stdout}\n${build.stderr}`);
      return {
        source: 'static_dotnet_build',
        isCompiling: false,
        isReloading: false,
        lastSucceeded: build.exitCode === 0 && issues.length === 0,
        compileIssueCount: issues.length,
        issues: issues.slice(0, options.limit ?? 200),
        bridgeError: options.bridgeError,
        solutionPath,
      };
    } catch {
      // Fall back to editor log below.
    }
  }

  const snapshot = await loadStaticConsoleSnapshot(projectPath, {
    limit: options.limit ?? 200,
    types: ['error', 'exception', 'assert', 'warning'],
    bridgeError: options.bridgeError,
  });
  const issues = snapshot.entries.filter((entry) => {
    const type = String(entry.type ?? 'log').toLowerCase();
    return type === 'error' || type === 'exception' || type === 'assert' || type === 'warning';
  });

  return {
    source: 'static_editor_log',
    isCompiling: false,
    isReloading: false,
    lastSucceeded: issues.length === 0,
    compileIssueCount: issues.length,
    issues,
    bridgeError: options.bridgeError,
    logPath: snapshot.logPath,
  };
}
