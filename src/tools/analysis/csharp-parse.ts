import fs from 'node:fs/promises';
import { z } from 'zod';
import { validatePath } from '../../security/path-guard.js';
import { CSharpParser } from '../../intelligence/parser/csharp-parser.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe('Path to .cs file (relative to project root)'),
  code: z
    .string()
    .optional()
    .describe('Raw C# source code to parse (takes priority over filePath)'),
});

const parser = new CSharpParser();

export class CSharpParseTool implements ITool {
  readonly name = 'csharp_parse';
  readonly description =
    'Parse C# source code into a structured AST with classes, structs, methods, fields, namespaces, and more';
  readonly inputSchema = zodToJsonSchema(inputSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const start = performance.now();

    try {
      const parsed = inputSchema.parse(input);

      if (!parsed.code && !parsed.filePath) {
        return {
          content: 'Either filePath or code must be provided',
          isError: true,
        };
      }

      let code: string;
      let source: string;

      if (parsed.code) {
        code = parsed.code;
        source = '<inline>';
      } else {
        const resolved = validatePath(parsed.filePath!, context.projectPath);
        code = await fs.readFile(resolved, 'utf-8');
        source = parsed.filePath!;
      }

      const nodes = parser.parse(code);
      const elapsed = Math.round(performance.now() - start);

      return {
        content: JSON.stringify({ source, nodes }, null, 2),
        metadata: {
          executionTimeMs: elapsed,
          filesAffected: source !== '<inline>' ? [source] : undefined,
        },
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }
}
