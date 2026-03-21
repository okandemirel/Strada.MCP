import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import { getStaticCompileStatus } from './local-diagnostics.js';

describe('local diagnostics fallback', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-local-diag-'));
    delete process.env.UNITY_EDITOR_LOG_PATH;
    execFileMock.mockReset();
  });

  afterEach(async () => {
    delete process.env.UNITY_EDITOR_LOG_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should fall back to dotnet build diagnostics when editor log data is unavailable', async () => {
    await fs.writeFile(path.join(tempDir, 'Project.sln'), 'Microsoft Visual Studio Solution File', 'utf8');
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      const error = new Error('build failed') as Error & {
        code: number;
        stdout: string;
        stderr: string;
      };
      error.code = 1;
      error.stdout = '';
      error.stderr =
        'Assets/Foo.cs(8,18): error CS0246: The type or namespace name MissingType could not be found';
      callback(error, '', error.stderr);
    });

    const result = await getStaticCompileStatus({
      projectPath: tempDir,
      bridgeError: 'Bridge unavailable',
    });

    expect(result.source).toBe('static_dotnet_build');
    expect(result.compile.compileIssueCount).toBe(1);
    expect(result.compile.lastSucceeded).toBe(false);
    expect(result.bridgeError).toBe('Bridge unavailable');
  });
});
