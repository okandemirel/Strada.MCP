import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath, isPathAllowed, parseAllowedPaths } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional().default(false),
});

export class FileEditTool implements ITool {
  readonly name = 'file_edit';
  readonly description = 'Replace text in a file using exact string matching';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      old_string: { type: 'string', description: 'Text to find' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences' },
    },
    required: ['path', 'old_string', 'new_string'],
  };
  readonly metadata: ToolMetadata = {
    category: 'file',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot edit file: read-only mode is enabled', isError: true };
    }
    try {
      const { path: filePath, old_string, new_string, replace_all } = inputSchema.parse(input);
      const resolved = validatePath(filePath, context.projectPath);
      const allowedPaths = parseAllowedPaths(process.env.ALLOWED_PATHS);
      if (allowedPaths.length > 0 && !isPathAllowed(resolved, allowedPaths)) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      const content = await fs.readFile(resolved, 'utf-8');

      if (!content.includes(old_string)) {
        return { content: `String not found in ${filePath}`, isError: true };
      }

      const updated = replace_all
        ? content.replaceAll(old_string, new_string)
        : content.replace(old_string, new_string);

      await fs.writeFile(resolved, updated, 'utf-8');
      return {
        content: `Edited ${filePath}`,
        metadata: { filesAffected: [filePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
