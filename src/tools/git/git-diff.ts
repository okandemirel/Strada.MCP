import { z } from 'zod';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  staged: z.boolean().optional(),
  file: z.string().optional(),
});

export class GitDiffTool implements ITool {
  readonly name = 'git_diff';
  readonly description = 'Show changes between working tree and index (staged/unstaged)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged changes (--cached)' },
      file: { type: 'string', description: 'Diff a specific file' },
    },
    required: [],
  };
  readonly metadata: ToolMetadata = {
    category: 'git',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { staged, file } = inputSchema.parse(input);
      const args = ['diff'];

      if (staged) args.push('--cached');

      if (file) {
        sanitizeArg(file);
        args.push('--', file);
      }

      const result = await runProcess('git', args, {
        timeout: 15000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git diff failed: ${result.stderr}`, isError: true };
      }

      const output = result.stdout.trim();
      return {
        content: output || 'No differences found',
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
