import { z } from 'zod';
import fs from 'node:fs/promises';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { validatePath } from '../../security/path-guard.js';
import { parseUnityYaml } from '../../utils/unity-yaml-parser.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const prefabAnalyzeSchema = z.object({
  path: z.string().describe('Relative path to the .prefab file within the project'),
});

export class PrefabAnalyzeTool implements ITool {
  readonly name = 'unity_prefab_analyze';
  readonly description =
    'Analyze a .prefab file structure: GameObjects, components, hierarchy, nested prefabs, scripts';

  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(prefabAnalyzeSchema);
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
      const parsed = prefabAnalyzeSchema.parse(input);
      const prefabPath = parsed.path;

      // Validate file extension
      if (!prefabPath.endsWith('.prefab')) {
        return {
          content: 'Error: Path must end with .prefab',
          isError: true,
        };
      }

      // Validate path security
      let resolvedPath: string;
      try {
        resolvedPath = validatePath(prefabPath, context.projectPath);
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

      // Find root GameObject name
      const rootGo = gameObjects.length > 0 ? gameObjects[0] : undefined;
      const rootName = (rootGo?.properties['m_Name'] as string) ?? 'unknown';

      // Component distribution (exclude GameObjects and settings)
      const componentDistribution: Record<string, number> = {};
      for (const doc of docs) {
        if (doc.classId === 1) continue; // Skip GameObjects
        if (doc.classId === 1001 || doc.classId === 1101) continue; // Skip PrefabInstances
        componentDistribution[doc.typeName] = (componentDistribution[doc.typeName] ?? 0) + 1;
      }

      // Build transform hierarchy for depth calculation
      const transforms = docs.filter((d) => d.classId === 4 || d.classId === 224);
      const transformByFileId = new Map<number, (typeof docs)[0]>();
      for (const t of transforms) {
        transformByFileId.set(t.fileId, t);
      }

      // Find root transforms (m_Father fileID === 0)
      const rootTransforms = transforms.filter((t) => {
        const father = t.properties['m_Father'] as Record<string, unknown> | undefined;
        return father && (father['fileID'] === 0 || father['fileID'] === '0');
      });

      // Calculate hierarchy depth
      function calcDepth(transform: (typeof docs)[0]): number {
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

      let hierarchyDepth = 0;
      for (const root of rootTransforms) {
        hierarchyDepth = Math.max(hierarchyDepth, calcDepth(root));
      }

      // Detect nested prefab instances (classId 1001 = Prefab, 1101 = PrefabInstance)
      const prefabInstances = docs.filter((d) => d.classId === 1001 || d.classId === 1101);
      const nestedPrefabGuids: string[] = [];
      for (const pi of prefabInstances) {
        const sourcePrefab = pi.properties['m_SourcePrefab'] as
          | Record<string, unknown>
          | undefined;
        if (sourcePrefab) {
          const guid = sourcePrefab['guid'] as string | undefined;
          if (guid) {
            nestedPrefabGuids.push(guid);
          }
        }
      }

      // Extract MonoBehaviour script GUIDs
      const monoBehaviours = docs.filter((d) => d.classId === 114);
      const scriptGuids: string[] = [];
      for (const mb of monoBehaviours) {
        const script = mb.properties['m_Script'] as Record<string, unknown> | undefined;
        if (script) {
          const guid = script['guid'] as string | undefined;
          if (guid) {
            scriptGuids.push(guid);
          }
        }
      }

      // Warnings
      const warnings: string[] = [];
      if (hierarchyDepth > 5) warnings.push(`Deep nesting (${hierarchyDepth} levels)`);
      if (nestedPrefabGuids.length > 10)
        warnings.push(`Many nested prefabs (${nestedPrefabGuids.length})`);

      const analysis = {
        prefabPath,
        fileSizeBytes: stat.size,
        rootName,
        gameObjectCount: gameObjects.length,
        totalObjectCount: docs.length,
        hierarchyDepth,
        componentDistribution,
        nestedPrefabCount: nestedPrefabGuids.length,
        nestedPrefabGuids,
        scriptGuids,
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
