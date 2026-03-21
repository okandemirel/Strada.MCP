import { z } from 'zod';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import {
  applyRenamePreview,
  buildRenamePreview,
  findReferences,
  searchSymbols,
} from './csharp-symbol-utils.js';

const symbolSearchSchema = z.object({
  query: z.string().min(1),
  kinds: z.array(z.enum(['class', 'struct', 'interface', 'enum', 'method', 'field', 'property'])).optional(),
  exact: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

export class CSharpSymbolSearchTool implements ITool {
  readonly name = 'csharp_symbol_search';
  readonly description =
    'Search project C# symbols using tree-sitter parsing across classes, structs, interfaces, methods, fields, and properties';
  readonly inputSchema = zodToJsonSchema(symbolSearchSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = symbolSearchSchema.parse(input);
    const matches = await searchSymbols(context.projectPath, parsed);
    return {
      content: JSON.stringify({
        backend: 'tree-sitter',
        authority: 'inferred',
        query: parsed.query,
        count: matches.length,
        matches,
      }, null, 2),
      metadata: { executionTimeMs: Math.round(performance.now() - start) },
    };
  }
}

const symbolReferencesSchema = z.object({
  symbolName: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional().default(250),
});

export class CSharpSymbolReferencesTool implements ITool {
  readonly name = 'csharp_symbol_references';
  readonly description =
    'Find text references to a C# symbol across project source files with line and column locations';
  readonly inputSchema = zodToJsonSchema(symbolReferencesSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = symbolReferencesSchema.parse(input);
    const references = await findReferences(context.projectPath, parsed.symbolName, { limit: parsed.limit });
    return {
      content: JSON.stringify({
        backend: 'text-search',
        authority: 'inferred',
        symbolName: parsed.symbolName,
        count: references.length,
        references,
      }, null, 2),
      metadata: { executionTimeMs: Math.round(performance.now() - start) },
    };
  }
}

const renamePreviewSchema = z.object({
  oldName: z.string().min(1),
  newName: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional().default(500),
});

export class CSharpRenamePreviewTool implements ITool {
  readonly name = 'csharp_rename_preview';
  readonly description =
    'Preview identifier renames across project source files before applying edits';
  readonly inputSchema = zodToJsonSchema(renamePreviewSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = renamePreviewSchema.parse(input);
    const edits = await buildRenamePreview(context.projectPath, parsed.oldName, parsed.newName, {
      limit: parsed.limit,
    });
    return {
      content: JSON.stringify({
        backend: 'text-search',
        authority: 'inferred',
        oldName: parsed.oldName,
        newName: parsed.newName,
        editCount: edits.length,
        edits,
      }, null, 2),
      metadata: { executionTimeMs: Math.round(performance.now() - start) },
    };
  }
}

const applySymbolEditsSchema = renamePreviewSchema.extend({
  dryRun: z.boolean().optional().default(false),
});

export class CSharpApplySymbolEditsTool implements ITool {
  readonly name = 'csharp_apply_symbol_edits';
  readonly description =
    'Apply a simple identifier rename across project source files using the preview produced by csharp_rename_preview';
  readonly inputSchema = zodToJsonSchema(applySymbolEditsSchema);
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: false,
    dangerous: true,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = applySymbolEditsSchema.parse(input);

    if (context.readOnly && !parsed.dryRun) {
      return {
        content: 'Error: Cannot apply symbol edits in read-only mode.',
        isError: true,
      };
    }

    const edits = await buildRenamePreview(context.projectPath, parsed.oldName, parsed.newName, {
      limit: parsed.limit,
    });

    if (parsed.dryRun) {
      return {
        content: JSON.stringify({
          backend: 'text-search',
          authority: 'inferred',
          dryRun: true,
          oldName: parsed.oldName,
          newName: parsed.newName,
          editCount: edits.length,
          edits,
        }, null, 2),
        metadata: { executionTimeMs: Math.round(performance.now() - start) },
      };
    }

    const applied = await applyRenamePreview(context.projectPath, edits);
    return {
      content: JSON.stringify({
        backend: 'text-search',
        authority: 'inferred',
        dryRun: false,
        oldName: parsed.oldName,
        newName: parsed.newName,
        editCount: applied.editCount,
        filesChanged: applied.filesChanged,
      }, null, 2),
      metadata: {
        executionTimeMs: Math.round(performance.now() - start),
        filesAffected: applied.filesChanged,
      },
    };
  }
}
