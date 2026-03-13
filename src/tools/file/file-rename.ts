import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath, isPathAllowed, parseAllowedPaths } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export class FileRenameTool implements ITool {
  readonly name = 'file_rename';
  readonly description = 'Rename or move a file';
  readonly inputSchema = {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source path' },
      destination: { type: 'string', description: 'Destination path' },
    },
    required: ['source', 'destination'],
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot rename file: read-only mode is enabled', isError: true };
    }
    try {
      const { source, destination } = inputSchema.parse(input);
      const resolvedSrc = validatePath(source, context.projectPath);
      const resolvedDst = validatePath(destination, context.projectPath);
      const allowedPaths = parseAllowedPaths(process.env.ALLOWED_PATHS);
      if (allowedPaths.length > 0 && (!isPathAllowed(resolvedSrc, allowedPaths) || !isPathAllowed(resolvedDst, allowedPaths))) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      await fs.rename(resolvedSrc, resolvedDst);
      return {
        content: `Renamed ${source} → ${destination}`,
        metadata: { filesAffected: [source, destination] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
