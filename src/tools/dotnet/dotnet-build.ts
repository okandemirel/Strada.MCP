import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { runProcess, sanitizeArg } from '../../utils/process-runner.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  project: z.string().optional(),
  configuration: z.enum(['Debug', 'Release']).optional(),
});

interface BuildDiagnostic {
  type: 'error' | 'warning';
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
}

// MSBuild output patterns:
// path(line,col): error CS1234: message
// path(line,col): warning CS5678: message
const MSBUILD_DIAG_RE =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(\w+):\s+(.+)$/;

export function parseMSBuildOutput(output: string): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
  for (const line of output.split('\n')) {
    const match = MSBUILD_DIAG_RE.exec(line.trim());
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        type: match[4] as 'error' | 'warning',
        code: match[5],
        message: match[6],
      });
    }
  }
  return diagnostics;
}

export class DotnetBuildTool implements ITool {
  readonly name = 'dotnet_build';
  readonly description = 'Build a .NET project and parse errors/warnings';
  readonly inputSchema = {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project/solution path (relative to project root)' },
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
      return { content: 'Cannot build: read-only mode is enabled', isError: true };
    }

    try {
      const { project, configuration = 'Debug' } = inputSchema.parse(input);
      const args = ['build'];

      if (project) {
        const resolved = validatePath(project, context.projectPath);
        sanitizeArg(resolved);
        args.push(resolved);
      }

      args.push('--configuration', configuration);
      args.push('--nologo');

      // Uses spawn() via runProcess — safe from shell injection
      const result = await runProcess('dotnet', args, {
        timeout: 120000,
        cwd: context.projectPath,
      });

      const combined = result.stdout + '\n' + result.stderr;
      const diagnostics = parseMSBuildOutput(combined);
      const errors = diagnostics.filter((d) => d.type === 'error');
      const warnings = diagnostics.filter((d) => d.type === 'warning');

      const summary = [
        `Build ${result.exitCode === 0 ? 'succeeded' : 'FAILED'}`,
        `  ${errors.length} error(s), ${warnings.length} warning(s)`,
      ];

      if (errors.length > 0) {
        summary.push('\nErrors:');
        for (const e of errors) {
          summary.push(`  ${e.file}(${e.line},${e.column}): ${e.code} — ${e.message}`);
        }
      }

      if (warnings.length > 0) {
        summary.push('\nWarnings:');
        for (const w of warnings) {
          summary.push(`  ${w.file}(${w.line},${w.column}): ${w.code} — ${w.message}`);
        }
      }

      return {
        content: summary.join('\n'),
        isError: result.exitCode !== 0,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
