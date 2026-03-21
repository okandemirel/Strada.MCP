import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnityDocsLookupTool } from './unity-docs-lookup.js';
import type { ToolContext } from '../tool.interface.js';

const tempDirectories: string[] = [];

function createContext(projectPath: string): ToolContext {
  return {
    projectPath,
    workingDirectory: projectPath,
    readOnly: false,
    unityBridgeConnected: false,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    url,
    text: async () => `
      <html>
        <head>
          <title>Transform - Unity Scripting API</title>
          <meta name="description" content="Position, rotation, and scale of an object.">
        </head>
        <body>
          <main>
            <h1>Transform</h1>
            <p>Position, rotation, and scale of an object.</p>
          </main>
        </body>
      </html>
    `,
  })) as unknown as typeof fetch);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('UnityDocsLookupTool', () => {
  it('fetches and caches official docs pages', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-docs-'));
    tempDirectories.push(projectPath);

    const tool = new UnityDocsLookupTool();
    const result = await tool.execute({ symbol: 'Transform' }, createContext(projectPath));

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Transform');
    expect(result.content).toContain('official-docs-fetch');
  });
});
