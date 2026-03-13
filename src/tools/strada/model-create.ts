import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const propertySchema = z.object({
  name: z.string(),
  type: z.string(),
  reactive: z.boolean().optional(),
});

const inputSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  path: z.string(),
  properties: z.array(propertySchema),
  dataType: z.string().optional(),
  description: z.string().optional(),
});

function generateModel(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];
  const hasReactive = input.properties.some((p) => p.reactive);
  const baseClass = hasReactive
    ? STRADA_API.baseClasses.patterns.reactiveModel
    : input.dataType
      ? `Model<${input.dataType}>`
      : STRADA_API.baseClasses.patterns.model;

  lines.push(`using ${STRADA_API.namespaces.patterns};`);
  if (hasReactive) {
    lines.push(`using ${STRADA_API.namespaces.sync};`);
  }
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');

  if (input.description) {
    lines.push('    /// <summary>');
    lines.push(`    /// ${input.description}`);
    lines.push('    /// </summary>');
  }

  lines.push(`    public class ${input.name} : ${baseClass}`);
  lines.push('    {');

  for (const prop of input.properties) {
    if (prop.reactive) {
      lines.push(`        public ReactiveProperty<${prop.type}> ${prop.name} { get; } = new();`);
    } else {
      lines.push(`        public ${prop.type} ${prop.name} { get; set; }`);
    }
  }

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class ModelCreateTool implements ITool {
  readonly name = 'strada_create_model';
  readonly description = 'Generate a Strada Model or ReactiveModel with typed properties';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Model class name' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory' },
      properties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            reactive: { type: 'boolean' },
          },
          required: ['name', 'type'],
        },
      },
      dataType: { type: 'string', description: 'Generic data type for Model<TData>' },
      description: { type: 'string' },
    },
    required: ['name', 'namespace', 'path', 'properties'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create model: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.name)) {
        return { content: `Invalid C# identifier: "${parsed.name}"`, isError: true };
      }

      const outputDir = validatePath(parsed.path, context.projectPath);
      const filePath = path.join(outputDir, `${parsed.name}.cs`);
      const content = generateModel(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created model ${parsed.name} at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
