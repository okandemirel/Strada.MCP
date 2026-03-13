import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CSharpParser, type CSharpNode } from '../../intelligence/parser/csharp-parser.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Relative path within project to scan (defaults to entire project)'),
});

const parser = new CSharpParser();

// Managed reference types that cannot be in unmanaged component structs
const MANAGED_TYPES = new Set([
  'string',
  'String',
  'object',
  'Object',
  'dynamic',
]);

// Types that indicate a managed reference when used as a field type suffix
const MANAGED_SUFFIXES = ['[]', 'List', 'Dictionary', 'Array', 'HashSet'];

const SYSTEM_BASE_CLASSES: Set<string> = new Set(STRADA_API.baseClasses.systems);

const SERVICE_BASE_CLASSES = new Set([
  'Service',
  'TickableService',
  'FixedTickableService',
  'OrderedService',
]);

// Severity weights for score calculation
const SEVERITY_WEIGHTS: Record<string, number> = {
  'component-managed-field': 10,
  'system-missing-attribute': 5,
  'system-public-mutable-state': 5,
  'service-not-registered': 3,
  'module-missing-configure': 8,
  'foreach-too-many-components': 7,
  'component-missing-struct-layout': 5,
  'entity-manager-outside-system': 8,
  'circular-namespace-dependency': 6,
};

export interface CodeQualityIssue {
  rule: string;
  message: string;
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface CodeQualityReport {
  issues: CodeQualityIssue[];
  score: number;
  filesScanned: number;
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
 * Flatten all type declarations from parsed nodes (handles namespace nesting).
 */
function flattenTypes(
  nodes: CSharpNode[],
): { node: CSharpNode; namespace: string }[] {
  const result: { node: CSharpNode; namespace: string }[] = [];

  function walk(items: CSharpNode[], ns: string): void {
    for (const n of items) {
      if (n.type === 'namespace') {
        walk(n.children, n.name);
      } else if (
        n.type === 'class' ||
        n.type === 'struct' ||
        n.type === 'interface' ||
        n.type === 'enum'
      ) {
        result.push({ node: n, namespace: ns });
      }
    }
  }

  walk(nodes, '');
  return result;
}

/**
 * Check if a field type looks like a managed reference type.
 */
function isManagedType(fieldNode: CSharpNode, rawCode: string): boolean {
  // Extract the field's raw line from source to inspect the type
  const line = rawCode.split('\n')[fieldNode.startLine - 1] || '';
  const trimmed = line.trim();

  // Check for explicit managed types
  for (const mt of MANAGED_TYPES) {
    // Match pattern: public string Foo; or private String bar;
    const regex = new RegExp(`\\b${mt}\\b`);
    if (regex.test(trimmed)) return true;
  }

  // Check for array notation and generic collections
  for (const suffix of MANAGED_SUFFIXES) {
    if (suffix === '[]') {
      // Look for Type[] pattern
      if (/\w+\s*\[\s*\]/.test(trimmed)) return true;
    } else {
      const regex = new RegExp(`\\b${suffix}\\s*<`);
      if (regex.test(trimmed)) return true;
    }
  }

  return false;
}

/**
 * Check if a type is a system (extends SystemBase, JobSystemBase, or BurstSystemBase).
 */
function isSystem(node: CSharpNode): boolean {
  return node.type === 'class' && node.baseTypes.some((b) => SYSTEM_BASE_CLASSES.has(b));
}

/**
 * Check if a type is a service.
 */
function isService(node: CSharpNode): boolean {
  return node.type === 'class' && node.baseTypes.some((b) => SERVICE_BASE_CLASSES.has(b));
}

/**
 * Check if a type is a module config.
 */
function isModuleConfig(node: CSharpNode): boolean {
  return node.type === 'class' && node.baseTypes.includes('ModuleConfig');
}

/**
 * Check if a type is a component (struct implementing IComponent).
 */
function isComponent(node: CSharpNode): boolean {
  return node.type === 'struct' && node.baseTypes.includes('IComponent');
}

/**
 * Detect ForEach<...> calls with >8 type parameters from raw code.
 */
function detectOversizedForEach(rawCode: string): { line: number; count: number }[] {
  const results: { line: number; count: number }[] = [];
  const lines = rawCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/ForEach\s*<([^>]+)>/);
    if (match) {
      const typeParams = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (typeParams.length > STRADA_API.componentApi.maxQueryComponents) {
        results.push({ line: i + 1, count: typeParams.length });
      }
    }
  }

  return results;
}

/**
 * Detect EntityManager references from raw code lines.
 */
function detectEntityManagerReferences(rawCode: string): number[] {
  const lines = rawCode.split('\n');
  const lineNumbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (/\bEntityManager\b/.test(lines[i])) {
      lineNumbers.push(i + 1);
    }
  }

  return lineNumbers;
}

/**
 * Check if any module config file registers a service name via RegisterService pattern.
 */
function isServiceRegisteredInModules(
  serviceName: string,
  allFilesCode: Map<string, string>,
): boolean {
  for (const [, code] of allFilesCode) {
    // Check for RegisterService<..., ServiceName>() or RegisterService<ServiceName>()
    if (code.includes(serviceName)) {
      const regex = new RegExp(`RegisterService\\s*<[^>]*\\b${serviceName}\\b[^>]*>`);
      if (regex.test(code)) return true;
      // Also check RegisterInstance or other registration patterns
      const instanceRegex = new RegExp(`Register\\w*\\s*<[^>]*\\b${serviceName}\\b[^>]*>`);
      if (instanceRegex.test(code)) return true;
    }
  }
  return false;
}

/**
 * Build namespace dependency graph and detect cycles.
 */
function detectCircularNamespaceDeps(
  fileData: { nodes: CSharpNode[]; file: string }[],
): string[][] {
  // Build: namespace -> set of namespaces it depends on (via using directives)
  const graph = new Map<string, Set<string>>();
  const allNamespaces = new Set<string>();

  for (const { nodes } of fileData) {
    const usings = nodes.filter((n) => n.type === 'using').map((n) => n.name);
    const namespaces = nodes
      .filter((n) => n.type === 'namespace')
      .map((n) => n.name);

    for (const ns of namespaces) {
      allNamespaces.add(ns);
      if (!graph.has(ns)) graph.set(ns, new Set());
      for (const u of usings) {
        // Only track dependencies between project namespaces (not System, etc.)
        // We'll check if the using target is a namespace defined in the project
        if (u !== ns) {
          graph.get(ns)!.add(u);
        }
      }
    }
  }

  // Filter graph to only include edges between known project namespaces
  for (const [, deps] of graph) {
    for (const dep of deps) {
      if (!allNamespaces.has(dep)) {
        deps.delete(dep);
      }
    }
  }

  // Detect cycles using DFS
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      // Found a cycle: extract it from stack
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = stack.slice(cycleStart).concat(node);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep);
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const ns of allNamespaces) {
    dfs(ns);
  }

  return cycles;
}

export class CodeQualityTool implements ITool {
  readonly name = 'code_quality';
  readonly description =
    'Analyze C# code for Strada.Core anti-patterns and best-practice violations';
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

      const csFiles = await collectCsFiles(scanRoot);
      const issues: CodeQualityIssue[] = [];

      // Parse all files and collect raw code
      const fileData: { file: string; nodes: CSharpNode[]; code: string }[] = [];
      const allFilesCode = new Map<string, string>();

      for (const filePath of csFiles) {
        const code = await fs.readFile(filePath, 'utf-8');
        const relPath = path.relative(context.projectPath, filePath);
        const nodes = parser.parse(code);
        fileData.push({ file: relPath, nodes, code });
        allFilesCode.set(relPath, code);
      }

      // Collect all service names and module config files for cross-file checks
      const allServiceNames: { name: string; file: string; line: number }[] = [];

      for (const { file, nodes, code } of fileData) {
        const types = flattenTypes(nodes);

        for (const { node } of types) {
          // Rule: Component struct with managed reference fields
          if (isComponent(node)) {
            // Check for StructLayout attribute
            if (!node.attributes.includes('StructLayout')) {
              issues.push({
                rule: 'component-missing-struct-layout',
                message: `Component struct '${node.name}' is missing [StructLayout(LayoutKind.Sequential)] attribute`,
                file,
                line: node.startLine,
                severity: 'warning',
              });
            }

            // Check for managed fields
            for (const child of node.children) {
              if (child.type === 'field' && isManagedType(child, code)) {
                issues.push({
                  rule: 'component-managed-field',
                  message: `Component '${node.name}' has managed reference field '${child.name}' — components must be unmanaged structs`,
                  file,
                  line: child.startLine,
                  severity: 'error',
                });
              }
            }
          }

          // Rule: System without [StradaSystem] attribute
          if (isSystem(node)) {
            if (!node.attributes.includes('StradaSystem')) {
              issues.push({
                rule: 'system-missing-attribute',
                message: `System '${node.name}' is missing [StradaSystem] attribute`,
                file,
                line: node.startLine,
                severity: 'error',
              });
            }

            // Rule: System with public mutable state
            for (const child of node.children) {
              if (
                child.type === 'field' &&
                child.modifiers.includes('public') &&
                !child.modifiers.includes('readonly') &&
                !child.modifiers.includes('const')
              ) {
                issues.push({
                  rule: 'system-public-mutable-state',
                  message: `System '${node.name}' has public mutable field '${child.name}' — systems should not expose mutable state`,
                  file,
                  line: child.startLine,
                  severity: 'warning',
                });
              }
            }
          }

          // Track services for cross-file registration check
          if (isService(node)) {
            allServiceNames.push({ name: node.name, file, line: node.startLine });
          }

          // Rule: Module without Configure method
          if (isModuleConfig(node)) {
            const hasConfigure = node.children.some(
              (c) => c.type === 'method' && c.name === 'Configure',
            );
            if (!hasConfigure) {
              issues.push({
                rule: 'module-missing-configure',
                message: `Module '${node.name}' extends ModuleConfig but has no Configure method`,
                file,
                line: node.startLine,
                severity: 'error',
              });
            }
          }

          // Rule: Direct EntityManager access outside systems
          if (
            node.type === 'class' &&
            !isSystem(node)
          ) {
            const emLines = detectEntityManagerReferences(code);
            // Filter to lines that fall within this class's range
            for (const lineNum of emLines) {
              if (lineNum >= node.startLine && lineNum <= node.endLine) {
                issues.push({
                  rule: 'entity-manager-outside-system',
                  message: `'${node.name}' references EntityManager directly — only systems should access EntityManager`,
                  file,
                  line: lineNum,
                  severity: 'error',
                });
              }
            }
          }
        }

        // Rule: ForEach with >8 components (raw code scan)
        const oversized = detectOversizedForEach(code);
        for (const { line, count } of oversized) {
          issues.push({
            rule: 'foreach-too-many-components',
            message: `ForEach query has ${count} type parameters (max ${STRADA_API.componentApi.maxQueryComponents})`,
            file,
            line,
            severity: 'error',
          });
        }
      }

      // Rule: Service not registered in any module
      for (const svc of allServiceNames) {
        if (!isServiceRegisteredInModules(svc.name, allFilesCode)) {
          issues.push({
            rule: 'service-not-registered',
            message: `Service '${svc.name}' is not registered in any ModuleConfig`,
            file: svc.file,
            line: svc.line,
            severity: 'warning',
          });
        }
      }

      // Rule: Circular namespace dependencies
      const cycles = detectCircularNamespaceDeps(fileData);
      for (const cycle of cycles) {
        issues.push({
          rule: 'circular-namespace-dependency',
          message: `Circular namespace dependency: ${cycle.join(' -> ')}`,
          file: '',
          severity: 'warning',
        });
      }

      // Calculate score
      let totalPenalty = 0;
      for (const issue of issues) {
        totalPenalty += SEVERITY_WEIGHTS[issue.rule] ?? 5;
      }
      const score = Math.max(0, Math.min(100, 100 - totalPenalty));

      const report: CodeQualityReport = {
        issues,
        score,
        filesScanned: csFiles.length,
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
