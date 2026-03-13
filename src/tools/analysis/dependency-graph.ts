import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CSharpParser, type CSharpNode } from '../../intelligence/parser/csharp-parser.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Relative path within project to scan (defaults to entire project)'),
});

const parser = new CSharpParser();

export interface AssemblyDef {
  name: string;
  references: string[];
  file: string;
}

export interface NamespaceDep {
  namespace: string;
  dependsOn: string[];
  files: string[];
}

export interface DependencyGraphReport {
  assemblies: AssemblyDef[];
  namespaceDeps: NamespaceDep[];
  circularDeps: string[][];
  summary: string;
}

/**
 * Recursively collect files matching given extensions under a directory.
 */
async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
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
      const sub = await collectFiles(fullPath, extensions);
      results.push(...sub);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse .asmdef files to extract assembly definitions and their references.
 */
async function parseAsmdefFiles(files: string[], projectPath: string): Promise<AssemblyDef[]> {
  const assemblies: AssemblyDef[] = [];

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as { name?: string; references?: string[] };
      assemblies.push({
        name: data.name ?? path.basename(filePath, '.asmdef'),
        references: data.references ?? [],
        file: path.relative(projectPath, filePath),
      });
    } catch {
      // Skip malformed asmdef files
    }
  }

  return assemblies;
}

/**
 * Extract namespace dependencies from C# files using the parser.
 */
async function extractNamespaceDeps(
  csFiles: string[],
  projectPath: string,
): Promise<{
  deps: NamespaceDep[];
  allNamespaces: Set<string>;
}> {
  // Map: namespace -> { dependsOn set, files set }
  const nsMap = new Map<string, { dependsOn: Set<string>; files: Set<string> }>();
  const allNamespaces = new Set<string>();

  for (const filePath of csFiles) {
    const code = await fs.readFile(filePath, 'utf-8');
    const relPath = path.relative(projectPath, filePath);
    const nodes = parser.parse(code);

    const usings = nodes
      .filter((n) => n.type === 'using')
      .map((n) => n.name);

    const namespaces = extractNamespaces(nodes);

    for (const ns of namespaces) {
      allNamespaces.add(ns);
      if (!nsMap.has(ns)) {
        nsMap.set(ns, { dependsOn: new Set(), files: new Set() });
      }
      const entry = nsMap.get(ns)!;
      entry.files.add(relPath);
      for (const u of usings) {
        if (u !== ns) {
          entry.dependsOn.add(u);
        }
      }
    }
  }

  // Filter dependencies to only include known project namespaces
  const deps: NamespaceDep[] = [];
  for (const [ns, data] of nsMap) {
    const projectDeps = [...data.dependsOn].filter((d) => allNamespaces.has(d));
    deps.push({
      namespace: ns,
      dependsOn: projectDeps,
      files: [...data.files],
    });
  }

  return { deps, allNamespaces };
}

/**
 * Extract all namespace names from parsed nodes.
 */
function extractNamespaces(nodes: CSharpNode[]): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    if (n.type === 'namespace') {
      result.push(n.name);
    }
  }
  return result;
}

/**
 * Detect circular dependencies in the namespace graph.
 */
function detectCycles(deps: NamespaceDep[]): string[][] {
  const graph = new Map<string, Set<string>>();
  for (const dep of deps) {
    graph.set(dep.namespace, new Set(dep.dependsOn));
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(stack.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const dep of neighbors) {
        if (graph.has(dep)) {
          dfs(dep);
        }
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const ns of graph.keys()) {
    dfs(ns);
  }

  return cycles;
}

/**
 * Build a human-readable summary of the dependency graph.
 */
function buildSummary(
  assemblies: AssemblyDef[],
  namespaceDeps: NamespaceDep[],
  circularDeps: string[][],
): string {
  const lines: string[] = [];

  lines.push(`Dependency Graph Summary`);
  lines.push(`========================`);
  lines.push(``);

  // Assembly summary
  if (assemblies.length > 0) {
    lines.push(`Assemblies: ${assemblies.length}`);
    for (const asm of assemblies) {
      const refs = asm.references.length > 0 ? asm.references.join(', ') : '(none)';
      lines.push(`  ${asm.name} -> ${refs}`);
    }
    lines.push(``);
  }

  // Namespace summary
  lines.push(`Namespaces: ${namespaceDeps.length}`);
  for (const dep of namespaceDeps) {
    if (dep.dependsOn.length > 0) {
      lines.push(`  ${dep.namespace} -> ${dep.dependsOn.join(', ')}`);
    } else {
      lines.push(`  ${dep.namespace} (no internal deps)`);
    }
  }

  // Circular deps
  if (circularDeps.length > 0) {
    lines.push(``);
    lines.push(`Circular Dependencies: ${circularDeps.length}`);
    for (const cycle of circularDeps) {
      lines.push(`  ${cycle.join(' -> ')}`);
    }
  } else {
    lines.push(``);
    lines.push(`No circular dependencies detected.`);
  }

  return lines.join('\n');
}

export class DependencyGraphTool implements ITool {
  readonly name = 'dependency_graph';
  readonly description =
    'Analyze Unity project assembly references and namespace dependencies, detecting circular dependencies';
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

      // Collect .asmdef and .cs files
      const [asmdefFiles, csFiles] = await Promise.all([
        collectFiles(scanRoot, ['.asmdef']),
        collectFiles(scanRoot, ['.cs']),
      ]);

      // Parse assembly definitions
      const assemblies = await parseAsmdefFiles(asmdefFiles, context.projectPath);

      // Extract namespace dependencies
      const { deps: namespaceDeps } = await extractNamespaceDeps(csFiles, context.projectPath);

      // Detect circular dependencies
      const circularDeps = detectCycles(namespaceDeps);

      // Build summary
      const summary = buildSummary(assemblies, namespaceDeps, circularDeps);

      const report: DependencyGraphReport = {
        assemblies,
        namespaceDeps,
        circularDeps,
        summary,
      };

      const elapsed = Math.round(performance.now() - start);

      return {
        content: JSON.stringify(report, null, 2),
        metadata: {
          executionTimeMs: elapsed,
          filesAffected: [
            ...asmdefFiles.map((f) => path.relative(context.projectPath, f)),
            ...csFiles.map((f) => path.relative(context.projectPath, f)),
          ],
        },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
