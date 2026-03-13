import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  path: z.string().optional(),
});

interface ProjectAnalysis {
  modules: string[];
  systems: string[];
  components: string[];
  services: string[];
  controllers: string[];
  models: string[];
  mediators: string[];
  assemblies: string[];
  fileCount: number;
  namespaces: string[];
}

const PATTERNS: Record<string, RegExp> = {
  module: /class\s+(\w+)\s*:\s*ModuleConfig/,
  system: /class\s+(\w+)\s*:\s*(?:SystemBase|JobSystemBase|BurstSystemBase)/,
  component: /struct\s+(\w+)\s*:\s*IComponent/,
  service: /class\s+(\w+)\s*:\s*(?:Service|TickableService|FixedTickableService|OrderedService)/,
  controller: /class\s+(\w+)\s*:\s*Controller/,
  model: /class\s+(\w+)\s*:\s*(?:Model|ReactiveModel)/,
  mediator: /class\s+(\w+)\s*:\s*EntityMediator/,
  namespace: /namespace\s+([\w.]+)/,
};

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

export class ProjectAnalyzeTool implements ITool {
  readonly name = 'strada_analyze_project';
  readonly description = 'Scan .cs files to map modules, systems, components, services, and DI usage';
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
      const analysis: ProjectAnalysis = {
        modules: [],
        systems: [],
        components: [],
        services: [],
        controllers: [],
        models: [],
        mediators: [],
        assemblies: [],
        fileCount: files.length,
        namespaces: [],
      };

      const namespaceSet = new Set<string>();

      for (const file of files) {
        let content: string;
        try {
          content = await fs.readFile(file, 'utf-8');
        } catch {
          continue;
        }

        const rel = path.relative(scanPath, file);

        for (const [key, pattern] of Object.entries(PATTERNS)) {
          const match = content.match(pattern);
          if (!match) continue;

          if (key === 'namespace') {
            namespaceSet.add(match[1]);
          } else {
            const name = match[1];
            const entry = `${name} (${rel})`;
            switch (key) {
              case 'module': analysis.modules.push(entry); break;
              case 'system': analysis.systems.push(entry); break;
              case 'component': analysis.components.push(entry); break;
              case 'service': analysis.services.push(entry); break;
              case 'controller': analysis.controllers.push(entry); break;
              case 'model': analysis.models.push(entry); break;
              case 'mediator': analysis.mediators.push(entry); break;
            }
          }
        }
      }

      // Find asmdef files
      const asmdefFiles = await collectAsmdefFiles(scanPath);
      analysis.assemblies = asmdefFiles.map((f) => path.relative(scanPath, f));
      analysis.namespaces = [...namespaceSet].sort();

      return {
        content: JSON.stringify(analysis, null, 2),
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}

async function collectAsmdefFiles(dir: string): Promise<string[]> {
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
    if (stat.isDirectory() && name !== 'Library' && name !== 'Temp') {
      results.push(...(await collectAsmdefFiles(full)));
    } else if (stat.isFile() && name.endsWith('.asmdef')) {
      results.push(full);
    }
  }
  return results;
}
