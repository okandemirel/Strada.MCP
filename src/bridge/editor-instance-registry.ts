import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_EDITOR_INSTANCE_REGISTRY_DIR = path.join(os.tmpdir(), 'strada-mcp-editors');
export const DEFAULT_EDITOR_INSTANCE_TTL_MS = 20_000;

export interface UnityEditorInstanceInfo {
  instanceId: string;
  projectPath: string;
  projectName: string;
  port: number;
  pid: number | null;
  unityVersion: string | null;
  productName: string | null;
  isBatchMode: boolean;
  isPlaying: boolean;
  isCompiling: boolean;
  isUpdating: boolean;
  bridgeRunning: boolean;
  startedAtUtc: string | null;
  lastHeartbeatUtc: string | null;
  lastHeartbeatMs: number;
  registryPath: string;
  stale: boolean;
}

export interface DiscoverUnityEditorInstancesOptions {
  registryDir?: string;
  staleAfterMs?: number;
  includeStale?: boolean;
  nowMs?: number;
}

export interface ResolveUnityEditorTargetOptions extends DiscoverUnityEditorInstancesOptions {
  projectPath?: string;
  preferredPort?: number;
  preferredInstanceId?: string;
  explicitPort?: boolean;
  discoveryEnabled?: boolean;
}

export interface UnityEditorTargetResolution {
  selected: UnityEditorInstanceInfo | null;
  discovered: UnityEditorInstanceInfo[];
  port: number;
  source: 'instance-id' | 'project-path' | 'preferred-port' | 'single-discovered' | 'default';
  warnings: string[];
}

interface RawUnityEditorInstanceRecord {
  instanceId?: unknown;
  projectPath?: unknown;
  projectName?: unknown;
  port?: unknown;
  pid?: unknown;
  unityVersion?: unknown;
  productName?: unknown;
  isBatchMode?: unknown;
  isPlaying?: unknown;
  isCompiling?: unknown;
  isUpdating?: unknown;
  bridgeRunning?: unknown;
  startedAtUtc?: unknown;
  lastHeartbeatUtc?: unknown;
}

export function discoverUnityEditorInstances(
  options: DiscoverUnityEditorInstancesOptions = {},
): UnityEditorInstanceInfo[] {
  const registryDir = options.registryDir ?? DEFAULT_EDITOR_INSTANCE_REGISTRY_DIR;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_EDITOR_INSTANCE_TTL_MS;
  const nowMs = options.nowMs ?? Date.now();
  const includeStale = options.includeStale ?? false;

  let fileNames: string[] = [];
  try {
    fileNames = fs.readdirSync(registryDir);
  } catch {
    return [];
  }

  const instances: UnityEditorInstanceInfo[] = [];

  for (const fileName of fileNames) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const registryPath = path.join(registryDir, fileName);
    const stat = safeStat(registryPath);
    if (!stat?.isFile()) {
      continue;
    }

    const parsed = parseInstanceRecord(registryPath, stat.mtimeMs, staleAfterMs, nowMs);
    if (!parsed) {
      continue;
    }

    if (!includeStale && parsed.stale) {
      continue;
    }

    instances.push(parsed);
  }

  instances.sort((left, right) => {
    if (right.lastHeartbeatMs !== left.lastHeartbeatMs) {
      return right.lastHeartbeatMs - left.lastHeartbeatMs;
    }

    return left.projectName.localeCompare(right.projectName);
  });

  return instances;
}

export function resolveUnityEditorTarget(
  options: ResolveUnityEditorTargetOptions,
): UnityEditorTargetResolution {
  const warnings: string[] = [];
  const fallbackPort = options.preferredPort ?? 7691;

  if (options.discoveryEnabled === false) {
    return {
      selected: null,
      discovered: [],
      port: fallbackPort,
      source: 'default',
      warnings,
    };
  }

  const discovered = discoverUnityEditorInstances(options);
  const normalizedProjectPath = options.projectPath ? normalizeComparablePath(options.projectPath) : null;

  if (options.preferredInstanceId) {
    const matchingInstance = discovered.find((instance) => instance.instanceId === options.preferredInstanceId);
    if (matchingInstance) {
      return {
        selected: matchingInstance,
        discovered,
        port: matchingInstance.port,
        source: 'instance-id',
        warnings,
      };
    }

    warnings.push(`Preferred Unity editor instance '${options.preferredInstanceId}' was not found.`);
  }

  if (normalizedProjectPath) {
    const matchingProjects = discovered.filter(
      (instance) => normalizeComparablePath(instance.projectPath) === normalizedProjectPath,
    );

    if (matchingProjects.length > 0) {
      if (matchingProjects.length > 1) {
        warnings.push(
          `Multiple Unity editors are open for '${normalizedProjectPath}'. Selecting the freshest heartbeat.`,
        );
      }

      return {
        selected: matchingProjects[0],
        discovered,
        port: matchingProjects[0].port,
        source: 'project-path',
        warnings,
      };
    }
  }

  if (options.explicitPort && options.preferredPort) {
    const matchingPort = discovered.find((instance) => instance.port === options.preferredPort);
    if (matchingPort) {
      return {
        selected: matchingPort,
        discovered,
        port: matchingPort.port,
        source: 'preferred-port',
        warnings,
      };
    }

    warnings.push(`No discovered Unity editor is listening on explicitly configured port ${options.preferredPort}.`);
  }

  if (discovered.length === 1) {
    return {
      selected: discovered[0],
      discovered,
      port: discovered[0].port,
      source: 'single-discovered',
      warnings,
    };
  }

  if (!options.explicitPort && options.preferredPort) {
    const matchingPort = discovered.find((instance) => instance.port === options.preferredPort);
    if (matchingPort) {
      return {
        selected: matchingPort,
        discovered,
        port: matchingPort.port,
        source: 'preferred-port',
        warnings,
      };
    }
  }

  if (discovered.length > 1) {
    warnings.push(
      `Multiple Unity editors are open and none matched the requested project path. Falling back to port ${fallbackPort}.`,
    );
  }

  return {
    selected: null,
    discovered,
    port: fallbackPort,
    source: 'default',
    warnings,
  };
}

function parseInstanceRecord(
  registryPath: string,
  fileMtimeMs: number,
  staleAfterMs: number,
  nowMs: number,
): UnityEditorInstanceInfo | null {
  let rawJson = '';
  try {
    rawJson = fs.readFileSync(registryPath, 'utf8');
  } catch {
    return null;
  }

  let payload: RawUnityEditorInstanceRecord;
  try {
    payload = JSON.parse(rawJson) as RawUnityEditorInstanceRecord;
  } catch {
    return null;
  }

  const instanceId = asNonEmptyString(payload.instanceId);
  const projectPath = asNonEmptyString(payload.projectPath);
  const port = asPort(payload.port);
  if (!instanceId || !projectPath || !port) {
    return null;
  }

  const normalizedProjectPath = normalizeDisplayPath(projectPath);
  const lastHeartbeatUtc = asOptionalString(payload.lastHeartbeatUtc);
  const heartbeatFromPayload = lastHeartbeatUtc ? Date.parse(lastHeartbeatUtc) : Number.NaN;
  const lastHeartbeatMs = Number.isFinite(heartbeatFromPayload) ? heartbeatFromPayload : fileMtimeMs;

  return {
    instanceId,
    projectPath: normalizedProjectPath,
    projectName: asNonEmptyString(payload.projectName) ?? path.basename(normalizedProjectPath),
    port,
    pid: asOptionalInteger(payload.pid),
    unityVersion: asOptionalString(payload.unityVersion),
    productName: asOptionalString(payload.productName),
    isBatchMode: Boolean(payload.isBatchMode),
    isPlaying: Boolean(payload.isPlaying),
    isCompiling: Boolean(payload.isCompiling),
    isUpdating: Boolean(payload.isUpdating),
    bridgeRunning: payload.bridgeRunning !== false,
    startedAtUtc: asOptionalString(payload.startedAtUtc),
    lastHeartbeatUtc,
    lastHeartbeatMs,
    registryPath,
    stale: nowMs - lastHeartbeatMs > staleAfterMs,
  };
}

function normalizeDisplayPath(value: string): string {
  const resolved = normalizePath(value);
  return process.platform === 'win32' ? resolved.replaceAll('\\', '/') : resolved;
}

function normalizeComparablePath(value: string): string {
  const normalized = normalizeDisplayPath(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNonEmptyString(value: unknown): string | null {
  return asOptionalString(value);
}

function asOptionalInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function asPort(value: unknown): number | null {
  const parsed = asOptionalInteger(value);
  if (!parsed || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}
