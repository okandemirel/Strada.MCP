import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestResource } from './manifest.js';
import { ProjectSettingsResource } from './project-settings.js';
import { AsmdefListResource } from './asmdef-list.js';
import { FileStatsResource } from './file-stats.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

// Mock glob
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

import { readFile, readdir } from 'node:fs/promises';
import { glob } from 'glob';

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockGlob = vi.mocked(glob);

describe('ManifestResource', () => {
  const resource = new ManifestResource('/test/project');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://manifest');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should read and return manifest.json', async () => {
    const manifest = { dependencies: { 'com.unity.ugui': '1.0.0' } };
    mockReadFile.mockResolvedValue(JSON.stringify(manifest));

    const result = await resource.read();
    expect(result.uri).toBe('unity://manifest');
    expect(result.mimeType).toBe('application/json');
    expect(JSON.parse(result.text)).toEqual(manifest);
  });

  it('should throw when manifest not found', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    await expect(resource.read()).rejects.toThrow('Cannot read manifest');
  });

  it('should throw for invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not json{');
    await expect(resource.read()).rejects.toThrow('not valid JSON');
  });
});

describe('ProjectSettingsResource', () => {
  const resource = new ProjectSettingsResource('/test/project');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://project-settings/{category}');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should list categories when no param', async () => {
    mockReaddir.mockResolvedValue(
      ['ProjectSettings.asset', 'QualitySettings.asset'] as unknown as Awaited<ReturnType<typeof readdir>>,
    );
    const result = await resource.read();
    expect(result.mimeType).toBe('text/markdown');
    expect(result.text).toContain('player');
    expect(result.text).toContain('quality');
    expect(result.text).toContain('physics');
  });

  it('should parse Unity YAML-like settings', async () => {
    const yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!129 &1
PlayerSettings:
  productName: MyGame
  companyName: MyStudio
  defaultScreenWidth: 1920`;
    mockReadFile.mockResolvedValue(yaml);

    const result = await resource.read({ category: 'player' });
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text);
    expect(parsed['productName']).toBe('MyGame');
    expect(parsed['companyName']).toBe('MyStudio');
  });

  it('should throw for unknown category', async () => {
    await expect(resource.read({ category: 'bogus' })).rejects.toThrow(
      'Unknown category "bogus"',
    );
  });

  it('should throw when settings file not found', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    await expect(resource.read({ category: 'player' })).rejects.toThrow(
      'Cannot read ProjectSettings.asset',
    );
  });
});

describe('AsmdefListResource', () => {
  const resource = new AsmdefListResource('/test/project');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://assemblies');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should list asmdef files with references', async () => {
    mockGlob.mockResolvedValue([
      '/test/project/Assets/Game/Game.asmdef',
      '/test/project/Assets/Plugins/Plugin.asmdef',
    ] as string[] & { [Symbol.iterator]: () => Iterator<string> });

    mockReadFile
      .mockResolvedValueOnce(
        JSON.stringify({ name: 'Game', references: ['Strada.Core'] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ name: 'Plugin', references: [] }),
      );

    const result = await resource.read();
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text);
    expect(parsed.count).toBe(2);
    expect(parsed.assemblies[0].name).toBe('Game');
    expect(parsed.assemblies[0].references).toEqual(['Strada.Core']);
  });

  it('should handle empty project', async () => {
    mockGlob.mockResolvedValue([] as string[] & { [Symbol.iterator]: () => Iterator<string> });
    const result = await resource.read();
    const parsed = JSON.parse(result.text);
    expect(parsed.count).toBe(0);
    expect(parsed.assemblies).toEqual([]);
  });

  it('should handle malformed asmdef files', async () => {
    mockGlob.mockResolvedValue([
      '/test/project/Assets/Bad.asmdef',
    ] as string[] & { [Symbol.iterator]: () => Iterator<string> });
    mockReadFile.mockResolvedValue('not json');

    const result = await resource.read();
    const parsed = JSON.parse(result.text);
    expect(parsed.count).toBe(1);
    expect(parsed.assemblies[0].name).toBe('parse-error');
  });
});

describe('FileStatsResource', () => {
  const resource = new FileStatsResource('/test/project');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://file-stats');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should compute file statistics', async () => {
    mockGlob.mockResolvedValue([
      '/test/project/Assets/Scripts/Player.cs',
      '/test/project/Assets/Scripts/Enemy.cs',
    ] as string[] & { [Symbol.iterator]: () => Iterator<string> });

    mockReadFile
      .mockResolvedValueOnce(
        'namespace Game.Player\n{\n    public class Player {}\n}\n',
      )
      .mockResolvedValueOnce(
        'namespace Game.Enemy\n{\n    public class Enemy {}\n}\n',
      );

    const result = await resource.read();
    expect(result.mimeType).toBe('application/json');
    const stats = JSON.parse(result.text);
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalLines).toBe(10);
    expect(stats.namespaces['Game.Player']).toBe(1);
    expect(stats.namespaces['Game.Enemy']).toBe(1);
    expect(stats.directories['Assets']).toBe(2);
  });

  it('should handle empty project', async () => {
    mockGlob.mockResolvedValue([] as string[] & { [Symbol.iterator]: () => Iterator<string> });
    const result = await resource.read();
    const stats = JSON.parse(result.text);
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalLines).toBe(0);
  });
});
