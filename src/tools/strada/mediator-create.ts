import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const bindingSchema = z.object({
  component: z.string(),
  viewProperty: z.string(),
});

const inputSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  path: z.string(),
  viewType: z.string(),
  syncBindings: z.array(bindingSchema),
  pushBindings: z.array(bindingSchema).optional(),
  description: z.string().optional(),
});

function generateMediator(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];

  lines.push(`using ${STRADA_API.namespaces.ecs};`);
  lines.push(`using ${STRADA_API.namespaces.sync};`);
  lines.push(`using ${STRADA_API.namespaces.patterns};`);
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');

  if (input.description) {
    lines.push('    /// <summary>');
    lines.push(`    /// ${input.description}`);
    lines.push('    /// </summary>');
  }

  lines.push(`    public class ${input.name} : EntityMediator<${input.viewType}>`);
  lines.push('    {');

  // SyncBindings
  lines.push('        protected override void SetupSyncBindings()');
  lines.push('        {');
  for (const binding of input.syncBindings) {
    lines.push(`            Sync<${binding.component}>((view, component) => view.${binding.viewProperty} = component);`);
  }
  lines.push('        }');

  // PushBindings
  if (input.pushBindings && input.pushBindings.length > 0) {
    lines.push('');
    lines.push('        protected override void SetupPushBindings()');
    lines.push('        {');
    for (const binding of input.pushBindings) {
      lines.push(`            Push<${binding.component}>((view) => new ${binding.component} { ${binding.viewProperty} = view.${binding.viewProperty} });`);
    }
    lines.push('        }');
  }

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class MediatorCreateTool implements ITool {
  readonly name = 'strada_create_mediator';
  readonly description = 'Generate an EntityMediator binding ECS components to a Unity View';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Mediator class name' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory' },
      viewType: { type: 'string', description: 'View class this mediator binds to' },
      syncBindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            component: { type: 'string' },
            viewProperty: { type: 'string' },
          },
          required: ['component', 'viewProperty'],
        },
      },
      pushBindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            component: { type: 'string' },
            viewProperty: { type: 'string' },
          },
          required: ['component', 'viewProperty'],
        },
      },
      description: { type: 'string' },
    },
    required: ['name', 'namespace', 'path', 'viewType', 'syncBindings'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create mediator: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.name)) {
        return { content: `Invalid C# identifier: "${parsed.name}"`, isError: true };
      }

      const outputDir = validatePath(parsed.path, context.projectPath);
      const filePath = path.join(outputDir, `${parsed.name}.cs`);
      const content = generateMediator(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created mediator ${parsed.name} at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
