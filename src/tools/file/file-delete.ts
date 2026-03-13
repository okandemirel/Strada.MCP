import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string(),
});

export class FileDeleteTool implements ITool {
  readonly name = 'file_delete';
  readonly description = 'Delete a file';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to delete' },
    },
    required: ['path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: true,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot delete file: read-only mode is enabled', isError: true };
    }
    try {
      const { path: filePath } = inputSchema.parse(input);
      const resolved = validatePath(filePath, context.projectPath);
      await fs.unlink(resolved);
      return {
        content: `Deleted ${filePath}`,
        metadata: { filesAffected: [filePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
