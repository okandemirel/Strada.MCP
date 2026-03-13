import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export class FileWriteTool implements ITool {
  readonly name = 'file_write';
  readonly description = 'Write content to a file, creating directories as needed';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to project root)' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot write file: read-only mode is enabled', isError: true };
    }
    try {
      const { path: filePath, content } = inputSchema.parse(input);
      const resolved = validatePath(filePath, context.projectPath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
      return {
        content: `Written ${content.length} bytes to ${filePath}`,
        metadata: { filesAffected: [filePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
