import { z } from 'zod';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  count: z.number().int().min(1).max(100).optional(),
  oneline: z.boolean().optional(),
  file: z.string().optional(),
});

export class GitLogTool implements ITool {
  readonly name = 'git_log';
  readonly description = 'Show commit history';
  readonly inputSchema = {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of commits to show (1-100, default: 10)' },
      oneline: { type: 'boolean', description: 'One-line format (default: true)' },
      file: { type: 'string', description: 'Show history for a specific file' },
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
      const { count = 10, oneline = true, file } = inputSchema.parse(input);
      const args = ['log', `-n`, `${count}`];

      if (oneline) args.push('--oneline');

      if (file) {
        sanitizeArg(file);
        args.push('--', file);
      }

      const result = await runProcess('git', args, {
        timeout: 10000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git log failed: ${result.stderr}`, isError: true };
      }

      const output = result.stdout.trim();
      return {
        content: output || 'No commits found',
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
