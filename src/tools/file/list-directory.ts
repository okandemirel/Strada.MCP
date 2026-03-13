import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath, isPathAllowed } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string().optional().default('.'),
});

export class ListDirectoryTool implements ITool {
  readonly name = 'list_directory';
  readonly description = 'List directory contents with file/directory indicators';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (default: project root)' },
    },
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { path: dirPath } = inputSchema.parse(input);
      const resolved = validatePath(dirPath, context.projectPath);
      if ((context.allowedPaths ?? []).length > 0 && !isPathAllowed(resolved, context.allowedPaths ?? [])) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      const lines = entries
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);

      return { content: lines.join('\n') };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
