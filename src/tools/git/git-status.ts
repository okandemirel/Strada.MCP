import { z } from 'zod';
import { runProcess } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  short: z.boolean().optional(),
});

export class GitStatusTool implements ITool {
  readonly name = 'git_status';
  readonly description = 'Show working tree status (porcelain format)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      short: { type: 'boolean', description: 'Use short format output' },
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
      const { short } = inputSchema.parse(input);
      const args = ['status', '--porcelain'];
      if (short) args.push('--short');

      const result = await runProcess('git', args, {
        timeout: 10000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git status failed: ${result.stderr}`, isError: true };
      }

      const output = result.stdout.trim();
      return {
        content: output || 'Working tree clean — no changes',
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
