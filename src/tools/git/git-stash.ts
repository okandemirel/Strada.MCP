import { z } from 'zod';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  action: z.enum(['push', 'pop', 'list', 'drop']).optional(),
  message: z.string().optional(),
  index: z.number().int().min(0).optional(),
});

export class GitStashTool implements ITool {
  readonly name = 'git_stash';
  readonly description = 'Stash or restore uncommitted changes';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['push', 'pop', 'list', 'drop'],
        description: 'Stash action (default: push)',
      },
      message: { type: 'string', description: 'Stash message (for push)' },
      index: { type: 'number', description: 'Stash index (for pop/drop)' },
    },
    required: [],
  };
  readonly metadata: ToolMetadata = {
    category: 'git',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { action = 'push', message, index } = inputSchema.parse(input);

      // Write operations need write access
      if (action !== 'list' && context.readOnly) {
        return { content: `Cannot stash ${action}: read-only mode is enabled`, isError: true };
      }

      let args: string[];

      switch (action) {
        case 'push':
          args = ['stash', 'push'];
          if (message) {
            args.push('-m', sanitizeArg(message));
          }
          break;

        case 'pop':
          args = ['stash', 'pop'];
          if (index !== undefined) {
            args.push(`stash@{${index}}`);
          }
          break;

        case 'list':
          args = ['stash', 'list'];
          break;

        case 'drop':
          args = ['stash', 'drop'];
          if (index !== undefined) {
            args.push(`stash@{${index}}`);
          }
          break;

        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }

      const result = await runProcess('git', args, {
        timeout: 10000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git stash ${action} failed: ${result.stderr}`, isError: true };
      }

      const output = result.stdout.trim() || result.stderr.trim();
      return {
        content: output || `Stash ${action} completed`,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
