import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validatePath, isPathAllowed } from '../../security/path-guard.js';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { STRADA_API } from '../../context/strada-api-reference.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const fieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  default_value: z.string().optional(),
});

const inputSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  path: z.string(),
  fields: z.array(fieldSchema),
  description: z.string().optional(),
});

function generateComponent(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];

  lines.push('using System.Runtime.InteropServices;');
  lines.push(`using ${STRADA_API.namespaces.ecs};`);
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');

  if (input.description) {
    lines.push('    /// <summary>');
    lines.push(`    /// ${input.description}`);
    lines.push('    /// </summary>');
  }

  lines.push(`    ${STRADA_API.componentApi.structLayout}`);
  lines.push(`    public struct ${input.name} : ${STRADA_API.componentApi.interface}`);
  lines.push('    {');

  for (const field of input.fields) {
    lines.push(`        public ${field.type} ${field.name};`);
  }

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class ComponentCreateTool implements ITool {
  readonly name = 'strada_create_component';
  readonly description = 'Generate an ECS component struct implementing IComponent with StructLayout';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Component name (PascalCase)' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory (relative to project root)' },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            default_value: { type: 'string' },
          },
          required: ['name', 'type'],
        },
        description: 'Component fields',
      },
      description: { type: 'string', description: 'XML doc summary' },
    },
    required: ['name', 'namespace', 'path', 'fields'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create component: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.name)) {
        return { content: `Invalid C# identifier: "${parsed.name}"`, isError: true };
      }
      for (const field of parsed.fields) {
        if (!validateCSharpIdentifier(field.name)) {
          return { content: `Invalid field identifier: "${field.name}"`, isError: true };
        }
      }

      const outputDir = validatePath(parsed.path, context.projectPath);
      if ((context.allowedPaths ?? []).length > 0 && !isPathAllowed(outputDir, context.allowedPaths ?? [])) {
        return { content: `Path is outside allowed paths`, isError: true };
      }
      const filePath = path.join(outputDir, `${parsed.name}.cs`);
      const content = generateComponent(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created component ${parsed.name} at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
