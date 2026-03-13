import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CSharpParser } from '../../intelligence/parser/csharp-parser.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { CodeQualityTool } from './code-quality.js';
import { DependencyGraphTool } from './dependency-graph.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Relative path within project to scan (defaults to entire project)'),
});

const parser = new CSharpParser();

export interface FileStats {
  csFileCount: number;
  totalLoc: number;
  namespaceDistribution: Record<string, number>;
}

export interface ProjectHealthReport {
  codeQuality: {
    score: number;
    issueCount: number;
  };
  dependencyHealth: {
    circularDepCount: number;
    namespaceCount: number;
    assemblyCount: number;
  };
  fileStats: FileStats;
  overallScore: number;
  summary: string;
}

/**
 * Recursively collect all .cs files under a directory.
 */
async function collectCsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectCsFiles(fullPath);
      results.push(...sub);
    } else if (entry.isFile() && entry.name.endsWith('.cs')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Calculate file statistics: file count, LOC, and namespace distribution.
 */
async function computeFileStats(
  csFiles: string[],
): Promise<FileStats> {
  let totalLoc = 0;
  const nsDist: Record<string, number> = {};

  for (const filePath of csFiles) {
    const code = await fs.readFile(filePath, 'utf-8');
    const lines = code.split('\n');
    // Count non-empty, non-comment-only lines
    const loc = lines.filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('//');
    }).length;
    totalLoc += loc;

    // Extract namespaces
    const nodes = parser.parse(code);
    for (const n of nodes) {
      if (n.type === 'namespace') {
        nsDist[n.name] = (nsDist[n.name] ?? 0) + 1;
      }
    }
  }

  return {
    csFileCount: csFiles.length,
    totalLoc,
    namespaceDistribution: nsDist,
  };
}

/**
 * Build human-readable summary.
 */
function buildSummary(report: Omit<ProjectHealthReport, 'summary'>): string {
  const lines: string[] = [];

  lines.push('Project Health Report');
  lines.push('=====================');
  lines.push('');
  lines.push(`Overall Score: ${report.overallScore}/100`);
  lines.push('');

  // Code quality
  lines.push(`Code Quality: ${report.codeQuality.score}/100 (${report.codeQuality.issueCount} issues)`);

  // Dependencies
  lines.push(
    `Dependencies: ${report.dependencyHealth.namespaceCount} namespaces, ` +
      `${report.dependencyHealth.assemblyCount} assemblies, ` +
      `${report.dependencyHealth.circularDepCount} circular deps`,
  );

  // File stats
  lines.push(
    `Files: ${report.fileStats.csFileCount} .cs files, ${report.fileStats.totalLoc} LOC`,
  );

  // Namespace breakdown
  const nsKeys = Object.keys(report.fileStats.namespaceDistribution);
  if (nsKeys.length > 0) {
    lines.push('');
    lines.push('Namespace Distribution:');
    for (const ns of nsKeys.sort()) {
      lines.push(`  ${ns}: ${report.fileStats.namespaceDistribution[ns]} file(s)`);
    }
  }

  return lines.join('\n');
}

export class ProjectHealthTool implements ITool {
  readonly name = 'project_health';
  readonly description =
    'Comprehensive project health check combining code quality, dependency analysis, and file statistics';
  readonly inputSchema = zodToJsonSchema(inputSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const start = performance.now();

    try {
      const parsed = inputSchema.parse(input);
      const scanRoot = parsed.path
        ? path.resolve(context.projectPath, parsed.path)
        : context.projectPath;

      // Run code quality and dependency graph tools in parallel
      const codeQualityTool = new CodeQualityTool();
      const depGraphTool = new DependencyGraphTool();

      const toolInput = parsed.path ? { path: parsed.path } : {};

      const [cqResult, dgResult] = await Promise.all([
        codeQualityTool.execute(toolInput, context),
        depGraphTool.execute(toolInput, context),
      ]);

      // Parse sub-tool results
      const cqReport = JSON.parse(cqResult.content) as {
        issues: unknown[];
        score: number;
        filesScanned: number;
      };

      const dgReport = JSON.parse(dgResult.content) as {
        assemblies: unknown[];
        namespaceDeps: { namespace: string }[];
        circularDeps: unknown[];
        summary: string;
      };

      // Compute file stats
      const csFiles = await collectCsFiles(scanRoot);
      const fileStats = await computeFileStats(csFiles);

      // Calculate dependency health score (100 if no circular deps, penalty per cycle)
      const circularPenalty = dgReport.circularDeps.length * 15;
      const depScore = Math.max(0, 100 - circularPenalty);

      // Overall score: weighted average
      // 60% code quality, 30% dependency health, 10% baseline (file organization)
      const overallScore = Math.round(
        cqReport.score * 0.6 +
          depScore * 0.3 +
          (fileStats.csFileCount > 0 ? 100 : 100) * 0.1,
      );

      const reportData: Omit<ProjectHealthReport, 'summary'> = {
        codeQuality: {
          score: cqReport.score,
          issueCount: cqReport.issues.length,
        },
        dependencyHealth: {
          circularDepCount: dgReport.circularDeps.length,
          namespaceCount: dgReport.namespaceDeps.length,
          assemblyCount: dgReport.assemblies.length,
        },
        fileStats,
        overallScore,
      };

      const report: ProjectHealthReport = {
        ...reportData,
        summary: buildSummary(reportData),
      };

      const elapsed = Math.round(performance.now() - start);

      return {
        content: JSON.stringify(report, null, 2),
        metadata: {
          executionTimeMs: elapsed,
          filesAffected: csFiles.map((f) => path.relative(context.projectPath, f)),
        },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
