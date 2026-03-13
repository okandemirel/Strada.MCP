import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath, isPathAllowed } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  path: z.string(),
  modelType: z.string(),
  viewType: z.string(),
  description: z.string().optional(),
});

function generateController(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];

  lines.push(`using ${STRADA_API.namespaces.patterns};`);
  lines.push(`using ${STRADA_API.namespaces.di};`);
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');

  if (input.description) {
    lines.push('    /// <summary>');
    lines.push(`    /// ${input.description}`);
    lines.push('    /// </summary>');
  }

  lines.push(`    public class ${input.name} : Controller<${input.modelType}>`);
  lines.push('    {');

  // Inject view
  lines.push(`        [Inject] private readonly ${input.viewType} _view;`);
  lines.push('');

  // Initialize
  lines.push('        public override void Initialize()');
  lines.push('        {');
  lines.push('            base.Initialize();');
  lines.push('        }');
  lines.push('');

  // Dispose
  lines.push('        public override void Dispose()');
  lines.push('        {');
  lines.push('            base.Dispose();');
  lines.push('        }');

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class ControllerCreateTool implements ITool {
  readonly name = 'strada_create_controller';
  readonly description = 'Generate a Strada Controller<TModel> with typed model reference and view injection';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Controller class name' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory' },
      modelType: { type: 'string', description: 'Model type parameter' },
      viewType: { type: 'string', description: 'View type to inject' },
      description: { type: 'string' },
    },
    required: ['name', 'namespace', 'path', 'modelType', 'viewType'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create controller: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.name)) {
        return { content: `Invalid C# identifier: "${parsed.name}"`, isError: true };
      }

      const outputDir = validatePath(parsed.path, context.projectPath);
      if ((context.allowedPaths ?? []).length > 0 && !isPathAllowed(outputDir, context.allowedPaths ?? [])) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      const filePath = path.join(outputDir, `${parsed.name}.cs`);
      const content = generateController(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created controller ${parsed.name} at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
