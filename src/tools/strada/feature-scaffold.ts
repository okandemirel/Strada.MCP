import { z } from 'zod';
import { validateCSharpIdentifier } from '../../security/validator.js';
import { ComponentCreateTool } from './component-create.js';
import { SystemCreateTool } from './system-create.js';
import { ModuleCreateTool } from './module-create.js';
import { MediatorCreateTool } from './mediator-create.js';
import { ControllerCreateTool } from './controller-create.js';
import { ModelCreateTool } from './model-create.js';
import { ServiceCreateTool } from './service-create.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const componentSpec = z.object({
  name: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })),
});

const systemSpec = z.object({
  name: z.string(),
  baseType: z.enum(['SystemBase', 'JobSystemBase', 'BurstSystemBase']).default('SystemBase'),
  components: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  featureName: z.string(),
  namespace: z.string().optional(),
  path: z.string(),
  components: z.array(componentSpec).default([]),
  systems: z.array(systemSpec).default([]),
  hasView: z.boolean().default(false),
});

export class FeatureScaffoldTool implements ITool {
  readonly name = 'strada_scaffold_feature';
  readonly description = 'Generate a complete feature skeleton: module + components + systems + optional MVCS views';
  readonly inputSchema = {
    type: 'object',
    properties: {
      featureName: { type: 'string', description: 'Feature name (PascalCase)' },
      namespace: { type: 'string', description: 'Root namespace (defaults to featureName)' },
      path: { type: 'string', description: 'Base output directory' },
      components: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            fields: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' } }, required: ['name', 'type'] } },
          },
          required: ['name', 'fields'],
        },
      },
      systems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            baseType: { type: 'string', enum: ['SystemBase', 'JobSystemBase', 'BurstSystemBase'] },
            components: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
        },
      },
      hasView: { type: 'boolean', description: 'Generate MVCS view layer (controller, model, mediator)' },
    },
    required: ['featureName', 'path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'strada',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: 'Cannot scaffold feature: read-only mode is enabled', isError: true };
    }
    try {
      const parsed = inputSchema.parse(input);

      if (!validateCSharpIdentifier(parsed.featureName)) {
        return { content: `Invalid C# identifier: "${parsed.featureName}"`, isError: true };
      }

      const ns = parsed.namespace ?? parsed.featureName;
      const modulePath = parsed.path;
      const scriptsPath = `${modulePath}/${parsed.featureName}/Scripts`;
      const allFiles: string[] = [];
      const errors: string[] = [];

      // 1. Create module
      const moduleTool = new ModuleCreateTool();
      const moduleResult = await moduleTool.execute(
        { moduleName: parsed.featureName, namespace: ns, path: modulePath },
        context,
      );
      if (moduleResult.isError) {
        errors.push(`Module: ${moduleResult.content}`);
      } else if (moduleResult.metadata?.filesAffected) {
        allFiles.push(...moduleResult.metadata.filesAffected);
      }

      // 2. Create components
      const componentTool = new ComponentCreateTool();
      for (const comp of parsed.components) {
        const result = await componentTool.execute(
          { name: comp.name, namespace: `${ns}.Components`, path: `${scriptsPath}/Components`, fields: comp.fields },
          context,
        );
        if (result.isError) {
          errors.push(`Component ${comp.name}: ${result.content}`);
        } else if (result.metadata?.filesAffected) {
          allFiles.push(...result.metadata.filesAffected);
        }
      }

      // 3. Create systems
      const systemTool = new SystemCreateTool();
      for (const sys of parsed.systems) {
        const result = await systemTool.execute(
          {
            name: sys.name,
            namespace: `${ns}.Systems`,
            path: `${scriptsPath}/Systems`,
            baseType: sys.baseType ?? 'SystemBase',
            components: sys.components,
          },
          context,
        );
        if (result.isError) {
          errors.push(`System ${sys.name}: ${result.content}`);
        } else if (result.metadata?.filesAffected) {
          allFiles.push(...result.metadata.filesAffected);
        }
      }

      // 4. Create MVCS view layer
      if (parsed.hasView) {
        const modelName = `${parsed.featureName}Model`;
        const viewName = `${parsed.featureName}View`;
        const controllerName = `${parsed.featureName}Controller`;
        const mediatorName = `${parsed.featureName}Mediator`;

        const modelTool = new ModelCreateTool();
        const modelResult = await modelTool.execute(
          { name: modelName, namespace: `${ns}.Models`, path: `${scriptsPath}/Models`, properties: [] },
          context,
        );
        if (!modelResult.isError && modelResult.metadata?.filesAffected) {
          allFiles.push(...modelResult.metadata.filesAffected);
        }

        const controllerTool = new ControllerCreateTool();
        const controllerResult = await controllerTool.execute(
          { name: controllerName, namespace: `${ns}.Controllers`, path: `${scriptsPath}/Controllers`, modelType: modelName, viewType: viewName },
          context,
        );
        if (!controllerResult.isError && controllerResult.metadata?.filesAffected) {
          allFiles.push(...controllerResult.metadata.filesAffected);
        }

        // Mediator with bindings from components
        const syncBindings = parsed.components.map((c) => ({
          component: c.name,
          viewProperty: c.name,
        }));
        const mediatorTool = new MediatorCreateTool();
        const mediatorResult = await mediatorTool.execute(
          { name: mediatorName, namespace: `${ns}.Mediators`, path: `${scriptsPath}/Mediators`, viewType: viewName, syncBindings },
          context,
        );
        if (!mediatorResult.isError && mediatorResult.metadata?.filesAffected) {
          allFiles.push(...mediatorResult.metadata.filesAffected);
        }

        // Also create a service
        const serviceTool = new ServiceCreateTool();
        const serviceResult = await serviceTool.execute(
          { name: `${parsed.featureName}Service`, namespace: `${ns}.Services`, path: `${scriptsPath}/Services`, serviceType: 'Service' },
          context,
        );
        if (!serviceResult.isError && serviceResult.metadata?.filesAffected) {
          allFiles.push(...serviceResult.metadata.filesAffected);
        }
      }

      if (errors.length > 0) {
        return {
          content: `Scaffolded feature ${parsed.featureName} with errors:\n${errors.join('\n')}\n\nCreated ${allFiles.length} files.`,
          isError: true,
          metadata: { filesAffected: allFiles },
        };
      }

      return {
        content: `Scaffolded feature ${parsed.featureName} with ${allFiles.length} files:\n${allFiles.join('\n')}`,
        metadata: { filesAffected: allFiles },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
