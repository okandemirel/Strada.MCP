import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string().optional(),
});

interface ValidationIssue {
  severity: 'error' | 'warning';
  file: string;
  message: string;
  rule: string;
}

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

async function collectCsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return results;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory() && name !== 'Library' && name !== 'Temp' && name !== 'obj') {
      results.push(...(await collectCsFiles(full)));
    } else if (stat.isFile() && name.endsWith('.cs')) {
      results.push(full);
    }
  }
  return results;
}

function validateFile(content: string, relativePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check components are structs with IComponent
  const componentMatch = content.match(/(?:class|struct)\s+(\w+)\s*:\s*IComponent/);
  if (componentMatch) {
    const name = componentMatch[1];
    if (new RegExp(`\\bclass\\s+${name}\\b`).test(content)) {
      issues.push({
        severity: 'error',
        file: relativePath,
        message: `Component "${name}" must be a struct, not a class`,
        rule: 'component-struct',
      });
    }
    if (!content.includes('[StructLayout')) {
      issues.push({
        severity: 'warning',
        file: relativePath,
        message: `Component "${name}" should have [StructLayout(LayoutKind.Sequential)]`,
        rule: 'component-layout',
      });
    }
    if (!PASCAL_CASE_RE.test(name)) {
      issues.push({
        severity: 'warning',
        file: relativePath,
        message: `Component "${name}" should use PascalCase`,
        rule: 'naming-pascal',
      });
    }
  }

  // Check systems have [StradaSystem]
  const systemMatch = content.match(/class\s+(\w+)\s*:\s*(?:SystemBase|JobSystemBase|BurstSystemBase)/);
  if (systemMatch) {
    const name = systemMatch[1];
    if (!content.includes('[StradaSystem]')) {
      issues.push({
        severity: 'error',
        file: relativePath,
        message: `System "${name}" is missing [StradaSystem] attribute`,
        rule: 'system-attribute',
      });
    }
    if (!name.endsWith('System')) {
      issues.push({
        severity: 'warning',
        file: relativePath,
        message: `System "${name}" should end with "System" suffix`,
        rule: 'naming-system-suffix',
      });
    }
    if (!content.includes('[UpdatePhase')) {
      issues.push({
        severity: 'warning',
        file: relativePath,
        message: `System "${name}" should specify [UpdatePhase]`,
        rule: 'system-update-phase',
      });
    }
  }

  // Check modules have Configure
  const moduleMatch = content.match(/class\s+(\w+)\s*:\s*ModuleConfig/);
  if (moduleMatch) {
    const name = moduleMatch[1];
    if (!content.includes('Configure(')) {
      issues.push({
        severity: 'error',
        file: relativePath,
        message: `Module "${name}" must implement Configure method`,
        rule: 'module-configure',
      });
    }
  }

  return issues;
}

export class ArchitectureValidateTool implements ITool {
  readonly name = 'strada_validate_architecture';
  readonly description = 'Validate Strada.Core naming conventions, lifetime rules, and dependency rules';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Project path (defaults to project root)' },
    },
    required: [],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const parsed = inputSchema.parse(input);
      const scanPath = parsed.path
        ? validatePath(parsed.path, context.projectPath)
        : context.projectPath;

      const files = await collectCsFiles(scanPath);
      const allIssues: ValidationIssue[] = [];

      for (const file of files) {
        let content: string;
        try {
          content = await fs.readFile(file, 'utf-8');
        } catch {
          continue;
        }
        const rel = path.relative(scanPath, file);
        allIssues.push(...validateFile(content, rel));
      }

      const errors = allIssues.filter((i) => i.severity === 'error');
      const warnings = allIssues.filter((i) => i.severity === 'warning');

      const report = {
        filesScanned: files.length,
        errors: errors.length,
        warnings: warnings.length,
        issues: allIssues,
        passed: errors.length === 0,
      };

      return { content: JSON.stringify(report, null, 2) };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
