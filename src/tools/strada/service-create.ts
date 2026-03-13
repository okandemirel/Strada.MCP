import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const serviceTypes = ['Service', 'TickableService', 'FixedTickableService', 'OrderedService'] as const;

const inputSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  path: z.string(),
  serviceType: z.enum(serviceTypes).default('Service'),
  isTickable: z.boolean().optional(),
  tickOrder: z.number().optional(),
  description: z.string().optional(),
});

function generateService(input: z.infer<typeof inputSchema>): string {
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

  lines.push(`    public class ${input.name} : ${input.serviceType}`);
  lines.push('    {');

  // Constructor
  lines.push(`        public ${input.name}()`);
  lines.push('        {');
  lines.push('        }');

  // Tick method for tickable services
  if (input.serviceType === 'TickableService' || input.serviceType === 'FixedTickableService') {
    lines.push('');
    lines.push('        public override void Tick(float deltaTime)');
    lines.push('        {');
    lines.push('        }');
  }

  if (input.serviceType === 'OrderedService' && input.tickOrder !== undefined) {
    lines.push('');
    lines.push(`        public override int Order => ${input.tickOrder};`);
    lines.push('');
    lines.push('        public override void Tick(float deltaTime)');
    lines.push('        {');
    lines.push('        }');
  }

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class ServiceCreateTool implements ITool {
  readonly name = 'strada_create_service';
  readonly description = 'Generate a Strada service (Service, TickableService, FixedTickableService, or OrderedService)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Service class name' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory' },
      serviceType: { type: 'string', enum: [...serviceTypes] },
      isTickable: { type: 'boolean' },
      tickOrder: { type: 'number', description: 'Execution order for OrderedService' },
      description: { type: 'string' },
    },
    required: ['name', 'namespace', 'path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create service: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.name)) {
        return { content: `Invalid C# identifier: "${parsed.name}"`, isError: true };
      }

      const outputDir = validatePath(parsed.path, context.projectPath);
      const filePath = path.join(outputDir, `${parsed.name}.cs`);
      const content = generateService(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created service ${parsed.name} (${parsed.serviceType}) at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
