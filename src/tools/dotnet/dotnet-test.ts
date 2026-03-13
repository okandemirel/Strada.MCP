import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  project: z.string().optional(),
  filter: z.string().optional(),
  configuration: z.enum(['Debug', 'Release']).optional(),
});

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

// dotnet test output patterns:
// Passed!  - Failed:     0, Passed:     5, Skipped:     1, Total:     6
// Failed!  - Failed:     2, Passed:     3, Skipped:     0, Total:     5
// Total tests: 6. Passed: 5. Failed: 0. Skipped: 1.
const SUMMARY_RE =
  /(?:Failed|Passed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/;
const SUMMARY_ALT_RE =
  /Total tests:\s+(\d+)\.\s+Passed:\s+(\d+)\.\s+Failed:\s+(\d+)\.\s+Skipped:\s+(\d+)/;

export function parseTestOutput(output: string): TestSummary | null {
  const match = SUMMARY_RE.exec(output);
  if (match) {
    return {
      failed: parseInt(match[1], 10),
      passed: parseInt(match[2], 10),
      skipped: parseInt(match[3], 10),
      total: parseInt(match[4], 10),
    };
  }

  const altMatch = SUMMARY_ALT_RE.exec(output);
  if (altMatch) {
    return {
      total: parseInt(altMatch[1], 10),
      passed: parseInt(altMatch[2], 10),
      failed: parseInt(altMatch[3], 10),
      skipped: parseInt(altMatch[4], 10),
    };
  }

  return null;
}

export class DotnetTestTool implements ITool {
  readonly name = 'dotnet_test';
  readonly description = 'Run .NET tests and parse results summary';
  readonly inputSchema = {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project/solution path (relative to project root)' },
      filter: { type: 'string', description: 'Test filter expression (--filter)' },
      configuration: {
        type: 'string',
        enum: ['Debug', 'Release'],
        description: 'Build configuration (default: Debug)',
      },
    },
    required: [],
  };
  readonly metadata: ToolMetadata = {
    category: 'dotnet',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot run tests: read-only mode is enabled', isError: true };
    }

    try {
      const { project, filter, configuration = 'Debug' } = inputSchema.parse(input);
      const args = ['test'];

      if (project) {
        const resolved = validatePath(project, context.projectPath);
        sanitizeArg(resolved);
        args.push(resolved);
      }

      args.push('--configuration', configuration);
      args.push('--nologo');

      if (filter) {
        sanitizeArg(filter);
        args.push('--filter', filter);
      }

      // Uses spawn() via runProcess — safe from shell injection
      const result = await runProcess('dotnet', args, {
        timeout: 300000,
        cwd: context.projectPath,
      });

      const combined = result.stdout + '\n' + result.stderr;
      const summary = parseTestOutput(combined);

      const parts: string[] = [];

      if (summary) {
        parts.push(`Test run ${summary.failed === 0 ? 'passed' : 'FAILED'}`);
        parts.push(`  Total:   ${summary.total}`);
        parts.push(`  Passed:  ${summary.passed}`);
        parts.push(`  Failed:  ${summary.failed}`);
        parts.push(`  Skipped: ${summary.skipped}`);
      } else {
        parts.push(`Test run ${result.exitCode === 0 ? 'completed' : 'FAILED'}`);
        parts.push(combined.trim());
      }

      return {
        content: parts.join('\n'),
        isError: result.exitCode !== 0,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
