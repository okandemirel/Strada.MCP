import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolContext } from '../tool.interface.js';
import {
  CSharpApplySymbolEditsTool,
  CSharpRenamePreviewTool,
  CSharpSymbolReferencesTool,
  CSharpSymbolSearchTool,
} from './csharp-symbol-tools.js';

const tempDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-symbols-'));
  tempDirectories.push(projectPath);
  await fs.mkdir(path.join(projectPath, 'Assets'), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, 'Assets', 'PlayerService.cs'),
    `namespace Game.Core;

public class PlayerService
{
    private int health;

    public void HealPlayer()
    {
        health += 10;
    }
}
`,
    'utf8',
  );
  await fs.writeFile(
    path.join(projectPath, 'Assets', 'PlayerController.cs'),
    `namespace Game.Core;

public class PlayerController
{
    private readonly PlayerService service = new PlayerService();

    public void Tick()
    {
        service.HealPlayer();
    }
}
`,
    'utf8',
  );
  return projectPath;
}

function createContext(projectPath: string, overrides?: Partial<ToolContext>): ToolContext {
  return {
    projectPath,
    workingDirectory: projectPath,
    readOnly: false,
    unityBridgeConnected: false,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('CSharpSymbolSearchTool', () => {
  it('finds symbols via tree-sitter parsing', async () => {
    const projectPath = await createProject();
    const tool = new CSharpSymbolSearchTool();

    const result = await tool.execute({ query: 'PlayerService' }, createContext(projectPath));
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('"name": "PlayerService"');
  });
});

describe('CSharpSymbolReferencesTool', () => {
  it('finds symbol references across files', async () => {
    const projectPath = await createProject();
    const tool = new CSharpSymbolReferencesTool();

    const result = await tool.execute({ symbolName: 'HealPlayer' }, createContext(projectPath));
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('HealPlayer');
  });
});

describe('CSharpRenamePreviewTool', () => {
  it('builds a rename preview', async () => {
    const projectPath = await createProject();
    const tool = new CSharpRenamePreviewTool();

    const result = await tool.execute({
      oldName: 'HealPlayer',
      newName: 'RestoreHealth',
    }, createContext(projectPath));

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('"editCount"');
  });
});

describe('CSharpApplySymbolEditsTool', () => {
  it('applies a simple rename across source files', async () => {
    const projectPath = await createProject();
    const tool = new CSharpApplySymbolEditsTool();

    const result = await tool.execute({
      oldName: 'HealPlayer',
      newName: 'RestoreHealth',
    }, createContext(projectPath));

    expect(result.isError).toBeFalsy();

    const updated = await fs.readFile(path.join(projectPath, 'Assets', 'PlayerController.cs'), 'utf8');
    expect(updated).toContain('RestoreHealth');
  });
});
