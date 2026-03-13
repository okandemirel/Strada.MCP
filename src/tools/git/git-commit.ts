import { z } from 'zod';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export class GitCommitTool implements ITool {
  readonly name = 'git_commit';
  readonly description = 'Stage files and create a commit';
  readonly inputSchema = {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files to stage (if not provided, commits currently staged files)',
      },
      all: { type: 'boolean', description: 'Stage all modified tracked files (-a)' },
    },
    required: ['message'],
  };
  readonly metadata: ToolMetadata = {
    category: 'git',
    requiresBridge: false,
    dangerous: true,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot commit: read-only mode is enabled', isError: true };
    }

    try {
      const { message, files, all } = inputSchema.parse(input);

      // Stage files if specified
      if (files && files.length > 0) {
        const sanitizedFiles = files.map((f) => sanitizeArg(f));
        const addResult = await runProcess('git', ['add', '--', ...sanitizedFiles], {
          timeout: 10000,
          cwd: context.projectPath,
        });

        if (addResult.exitCode !== 0) {
          return { content: `git add failed: ${addResult.stderr}`, isError: true };
        }
      }

      // Build commit command
      const commitArgs = ['commit'];
      if (all) commitArgs.push('-a');
      commitArgs.push('-m', message);

      const result = await runProcess('git', commitArgs, {
        timeout: 15000,
        cwd: context.projectPath,
      });

      if (result.exitCode !== 0) {
        return { content: `git commit failed: ${result.stderr}`, isError: true };
      }

      return {
        content: result.stdout.trim(),
        metadata: { filesAffected: files },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
