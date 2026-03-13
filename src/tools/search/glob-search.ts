import { glob } from 'glob';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

export class GlobSearchTool implements ITool {
  readonly name = 'glob_search';
  readonly description = 'Search for files matching a glob pattern';
  readonly inputSchema = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.cs", "Assets/**/*.prefab")' },
      path: { type: 'string', description: 'Base directory for search (relative to project root)' },
    },
    required: ['pattern'],
  };
  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { pattern, path: basePath } = inputSchema.parse(input);

      const searchDir = basePath
        ? validatePath(basePath, context.projectPath)
        : context.projectPath;

      const matches = await glob(pattern, {
        cwd: searchDir,
        nodir: false,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      if (matches.length === 0) {
        return { content: `No files matched pattern "${pattern}"` };
      }

      const sorted = matches.sort();
      const limited = sorted.slice(0, 1000);
      const truncated = sorted.length > 1000 ? `\n... and ${sorted.length - 1000} more files` : '';

      return {
        content: `Found ${sorted.length} file(s):\n${limited.join('\n')}${truncated}`,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
