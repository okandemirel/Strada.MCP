import { z } from 'zod';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  action: z.enum(['list', 'create', 'delete', 'switch']).optional(),
  name: z.string().optional(),
  all: z.boolean().optional(),
});

export class GitBranchTool implements ITool {
  readonly name = 'git_branch';
  readonly description = 'List, create, delete, or switch branches';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'delete', 'switch'],
        description: 'Branch action (default: list)',
      },
      name: { type: 'string', description: 'Branch name (required for create/delete/switch)' },
      all: { type: 'boolean', description: 'Include remote branches when listing' },
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
      const { action = 'list', name, all } = inputSchema.parse(input);

      // Write operations need write access
      if (action !== 'list' && context.readOnly) {
        return { content: `Cannot ${action} branch: read-only mode is enabled`, isError: true };
      }

      let args: string[];

      switch (action) {
        case 'list':
          args = ['branch'];
          if (all) args.push('-a');
          break;

        case 'create':
          if (!name) {
            return { content: 'Branch name is required for create', isError: true };
          }
          sanitizeArg(name);
          args = ['branch', '--', name];
          break;

        case 'delete':
          if (!name) {
            return { content: 'Branch name is required for delete', isError: true };
          }
          sanitizeArg(name);
          args = ['branch', '-d', '--', name];
          break;

        case 'switch':
          if (!name) {
            return { content: 'Branch name is required for switch', isError: true };
          }
          sanitizeArg(name);
          // Note: no '--' before branch name — '--' tells git everything
          // after it is a file path, not a branch. sanitizeArg() already
          // prevents flag injection for branch names.
          args = ['switch', name];
          break;

        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }

      const result = await runProcess('git', args, {
        timeout: 10000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git branch ${action} failed: ${result.stderr}`, isError: true };
      }

      const output = result.stdout.trim() || result.stderr.trim();
      return {
        content: output || `Branch ${action} completed`,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
