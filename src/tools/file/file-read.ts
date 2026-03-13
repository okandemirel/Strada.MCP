import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath, isPathAllowed, parseAllowedPaths } from '../../security/path-guard.js';
import { sanitizeOutput } from '../../security/sanitizer.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).optional(),
});

export class FileReadTool implements ITool {
  readonly name = 'file_read';
  readonly description = 'Read file contents with line numbers, optional offset/limit';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to project root)' },
      offset: { type: 'number', description: 'Start line (0-based)' },
      limit: { type: 'number', description: 'Max lines to return' },
    },
    required: ['path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { path: filePath, offset, limit } = inputSchema.parse(input);
      const resolved = validatePath(filePath, context.projectPath);
      const allowedPaths = parseAllowedPaths(process.env.ALLOWED_PATHS);
      if (allowedPaths.length > 0 && !isPathAllowed(resolved, allowedPaths)) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      const content = await fs.readFile(resolved, 'utf-8');
      let lines = content.split('\n');

      if (offset !== undefined) lines = lines.slice(offset);
      if (limit !== undefined) lines = lines.slice(0, limit);

      const numbered = lines.map((line, i) => `${(offset ?? 0) + i + 1}\t${line}`).join('\n');
      return { content: sanitizeOutput(numbered) };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
