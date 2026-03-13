import { z } from 'zod';
import fs from 'node:fs/promises';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { validatePath } from '../../security/path-guard.js';
import { parseUnityYaml } from '../../utils/unity-yaml-parser.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const sceneAnalyzeSchema = z.object({
  path: z.string().describe('Relative path to the .unity scene file within the project'),
});

export class SceneAnalyzeTool implements ITool {
  readonly name = 'unity_scene_analyze';
  readonly description =
    'Analyze a .unity scene file structure: GameObjects, components, hierarchy depth, tag usage';

  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(sceneAnalyzeSchema);
    }
    return this._inputSchema;
  }

  get metadata(): ToolMetadata {
    return {
      category: 'unity-scene',
      requiresBridge: false,
      dangerous: false,
      readOnly: true,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const parsed = sceneAnalyzeSchema.parse(input);
      const scenePath = parsed.path;

      // Validate file extension
      if (!scenePath.endsWith('.unity')) {
        return {
          content: 'Error: Path must end with .unity',
          isError: true,
        };
      }

      // Validate path security
      let resolvedPath: string;
      try {
        resolvedPath = validatePath(scenePath, context.projectPath);
      } catch {
        return {
          content: 'Error: Path resolves outside project directory',
          isError: true,
        };
      }

      // Read and parse file
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const stat = await fs.stat(resolvedPath);
      const docs = parseUnityYaml(content);

      // Count GameObjects
      const gameObjects = docs.filter((d) => d.classId === 1);

      // Component distribution (exclude GameObjects and settings)
      const componentDistribution: Record<string, number> = {};
      for (const doc of docs) {
        // Skip non-component types (settings, etc.)
        if (doc.classId === 29 || doc.classId === 104 || doc.classId === 111 || doc.classId === 128) continue;
        if (doc.classId === 1) continue; // Skip GameObjects themselves
        componentDistribution[doc.typeName] = (componentDistribution[doc.typeName] ?? 0) + 1;
      }

      // Build transform hierarchy for depth calculation
      const transforms = docs.filter((d) => d.classId === 4 || d.classId === 224);
      const transformByFileId = new Map<number, typeof docs[0]>();
      for (const t of transforms) {
        transformByFileId.set(t.fileId, t);
      }

      // Find root transforms (m_Father fileID === 0)
      const rootTransforms = transforms.filter((t) => {
        const father = t.properties['m_Father'] as Record<string, unknown> | undefined;
        return father && (father['fileID'] === 0 || father['fileID'] === '0');
      });

      // Calculate max hierarchy depth
      function calcDepth(transform: typeof docs[0]): number {
        const children = transform.properties['m_Children'] as
          | Array<Record<string, unknown>>
          | undefined;
        if (!children || children.length === 0) return 1;

        let maxChildDepth = 0;
        for (const childRef of children) {
          const childId = childRef['fileID'] as number | undefined;
          if (childId) {
            const childTransform = transformByFileId.get(childId);
            if (childTransform) {
              maxChildDepth = Math.max(maxChildDepth, calcDepth(childTransform));
            }
          }
        }
        return 1 + maxChildDepth;
      }

      let maxHierarchyDepth = 0;
      for (const root of rootTransforms) {
        maxHierarchyDepth = Math.max(maxHierarchyDepth, calcDepth(root));
      }

      // Tag usage
      const tagUsage: Record<string, number> = {};
      for (const go of gameObjects) {
        const tag = go.properties['m_TagString'] as string | undefined;
        if (tag && tag !== 'Untagged') {
          tagUsage[tag] = (tagUsage[tag] ?? 0) + 1;
        }
      }

      // Warnings
      const warnings: string[] = [];
      if (maxHierarchyDepth > 10) warnings.push(`Deep hierarchy (${maxHierarchyDepth} levels)`);
      if (gameObjects.length > 1000) warnings.push(`Large scene (${gameObjects.length} GameObjects)`);

      const analysis = {
        scenePath,
        fileSizeBytes: stat.size,
        gameObjectCount: gameObjects.length,
        totalObjectCount: docs.length,
        rootObjectCount: rootTransforms.length,
        maxHierarchyDepth,
        componentDistribution,
        tagUsage,
        warnings,
      };

      return { content: JSON.stringify(analysis, null, 2) };
    } catch (err) {
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
