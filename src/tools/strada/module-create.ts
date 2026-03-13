import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  moduleName: z.string(),
  namespace: z.string(),
  path: z.string(),
  references: z.array(z.string()).optional(),
  hasEditor: z.boolean().default(false),
});

function generateModuleConfig(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];

  lines.push(`using ${STRADA_API.namespaces.modules};`);
  lines.push(`using ${STRADA_API.namespaces.di};`);
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');
  lines.push(`    public class ${input.moduleName}ModuleConfig : ${STRADA_API.baseClasses.moduleConfig}`);
  lines.push('    {');
  lines.push('        public override void Configure(IModuleBuilder builder)');
  lines.push('        {');
  lines.push('            // Register systems, services, and models here');
  lines.push('        }');
  lines.push('');
  lines.push('        public override void Initialize(IServiceLocator services)');
  lines.push('        {');
  lines.push('            base.Initialize(services);');
  lines.push('        }');
  lines.push('');
  lines.push('        public override void Shutdown()');
  lines.push('        {');
  lines.push('            base.Shutdown();');
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateAsmdef(input: z.infer<typeof inputSchema>): string {
  const refs = [STRADA_API.assemblyReferences.core, ...(input.references ?? [])];
  return JSON.stringify(
    {
      name: input.namespace,
      rootNamespace: input.namespace,
      references: refs,
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    },
    null,
    2,
  ) + '\n';
}

function generateEditorAsmdef(input: z.infer<typeof inputSchema>): string {
  return JSON.stringify(
    {
      name: `${input.namespace}.Editor`,
      rootNamespace: `${input.namespace}.Editor`,
      references: [input.namespace, STRADA_API.assemblyReferences.core],
      includePlatforms: ['Editor'],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    },
    null,
    2,
  ) + '\n';
}

export class ModuleCreateTool implements ITool {
  readonly name = 'strada_create_module';
  readonly description = 'Generate a Strada module with ModuleConfig, assembly definition, and folder structure';
  readonly inputSchema = {
    type: 'object',
    properties: {
      moduleName: { type: 'string', description: 'Module name (PascalCase)' },
      namespace: { type: 'string', description: 'Root namespace' },
      path: { type: 'string', description: 'Base output directory' },
      references: { type: 'array', items: { type: 'string' }, description: 'Additional assembly references' },
      hasEditor: { type: 'boolean', description: 'Generate Editor folder and asmdef' },
    },
    required: ['moduleName', 'namespace', 'path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create module: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.moduleName)) {
        return { content: `Invalid C# identifier: "${parsed.moduleName}"`, isError: true };
      }

      const baseDir = validatePath(parsed.path, context.projectPath);
      const moduleDir = path.join(baseDir, parsed.moduleName);
      const scriptsDir = path.join(moduleDir, 'Scripts');
      const filesAffected: string[] = [];

      await fs.mkdir(scriptsDir, { recursive: true });

      // ModuleConfig
      const configPath = path.join(scriptsDir, `${parsed.moduleName}ModuleConfig.cs`);
      await fs.writeFile(configPath, generateModuleConfig(parsed), 'utf-8');
      filesAffected.push(path.join(parsed.path, parsed.moduleName, 'Scripts', `${parsed.moduleName}ModuleConfig.cs`));

      // Runtime asmdef
      const asmdefPath = path.join(moduleDir, `${parsed.namespace}.asmdef`);
      await fs.writeFile(asmdefPath, generateAsmdef(parsed), 'utf-8');
      filesAffected.push(path.join(parsed.path, parsed.moduleName, `${parsed.namespace}.asmdef`));

      // Editor folder
      if (parsed.hasEditor) {
        const editorDir = path.join(moduleDir, 'Editor');
        await fs.mkdir(editorDir, { recursive: true });
        const editorAsmdefPath = path.join(editorDir, `${parsed.namespace}.Editor.asmdef`);
        await fs.writeFile(editorAsmdefPath, generateEditorAsmdef(parsed), 'utf-8');
        filesAffected.push(path.join(parsed.path, parsed.moduleName, 'Editor', `${parsed.namespace}.Editor.asmdef`));
      }

      return {
        content: `Created module ${parsed.moduleName} with ${filesAffected.length} files`,
        metadata: { filesAffected },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
