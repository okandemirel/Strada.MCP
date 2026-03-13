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
  baseType: z.enum(['SystemBase', 'JobSystemBase', 'BurstSystemBase']),
  updatePhase: z.enum(['Initialization', 'Update', 'LateUpdate', 'FixedUpdate']).default('Update'),
  components: z.array(z.string()).optional(),
  executionOrder: z.number().optional(),
  runBefore: z.array(z.string()).optional(),
  runAfter: z.array(z.string()).optional(),
  description: z.string().optional(),
});

function generateSystem(input: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];

  lines.push(`using ${STRADA_API.namespaces.ecs};`);
  lines.push(`using ${STRADA_API.namespaces.systems};`);
  if (input.components && input.components.length > 0) {
    lines.push(`using ${STRADA_API.namespaces.query};`);
  }
  lines.push('');
  lines.push(`namespace ${input.namespace}`);
  lines.push('{');

  if (input.description) {
    lines.push('    /// <summary>');
    lines.push(`    /// ${input.description}`);
    lines.push('    /// </summary>');
  }

  lines.push(`    ${STRADA_API.systemAttributes.stradaSystem}`);
  lines.push(`    ${STRADA_API.systemAttributes.updatePhase(input.updatePhase)}`);

  if (input.executionOrder !== undefined) {
    lines.push(`    ${STRADA_API.systemAttributes.executionOrder(input.executionOrder)}`);
  }
  if (input.runBefore) {
    for (const sys of input.runBefore) {
      lines.push(`    ${STRADA_API.systemAttributes.runBefore(sys)}`);
    }
  }
  if (input.runAfter) {
    for (const sys of input.runAfter) {
      lines.push(`    ${STRADA_API.systemAttributes.runAfter(sys)}`);
    }
  }

  lines.push(`    public class ${input.name} : ${input.baseType}`);
  lines.push('    {');

  // OnInitialize
  lines.push('        protected override void OnInitialize()');
  lines.push('        {');
  lines.push('            base.OnInitialize();');
  lines.push('        }');
  lines.push('');

  // OnUpdate
  lines.push('        protected override void OnUpdate(float deltaTime)');
  lines.push('        {');

  if (input.components && input.components.length > 0) {
    const typeParams = input.components.join(', ');
    const lambdaParams = input.components
      .map((c, i) => `ref ${c} c${i}`)
      .join(', ');
    lines.push(`            ForEach<${typeParams}>((int entity, ${lambdaParams}) =>`);
    lines.push('            {');
    lines.push('            });');
  }

  lines.push('        }');
  lines.push('');

  // OnDispose
  lines.push('        protected override void OnDispose()');
  lines.push('        {');
  lines.push('            base.OnDispose();');
  lines.push('        }');

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class SystemCreateTool implements ITool {
  readonly name = 'strada_create_system';
  readonly description = 'Generate a Strada ECS system (SystemBase, JobSystemBase, or BurstSystemBase)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'System class name' },
      namespace: { type: 'string', description: 'C# namespace' },
      path: { type: 'string', description: 'Output directory' },
      baseType: { type: 'string', enum: ['SystemBase', 'JobSystemBase', 'BurstSystemBase'] },
      updatePhase: { type: 'string', enum: ['Initialization', 'Update', 'LateUpdate', 'FixedUpdate'] },
      components: { type: 'array', items: { type: 'string' }, description: 'Component types for ForEach query' },
      executionOrder: { type: 'number' },
      runBefore: { type: 'array', items: { type: 'string' } },
      runAfter: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
    },
    required: ['name', 'namespace', 'path', 'baseType'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot create system: read-only mode is enabled', isError: true };
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
      const content = generateSystem(parsed);

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      const relativePath = path.join(parsed.path, `${parsed.name}.cs`);
      return {
        content: `Created system ${parsed.name} (${parsed.baseType}) at ${relativePath}`,
        metadata: { filesAffected: [relativePath] },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
