import { z } from 'zod';
import { createRequire } from 'module';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import { CSharpParser } from '../../intelligence/parser/csharp-parser.js';

const require = createRequire(import.meta.url);

// tree-sitter is a native module; use createRequire for ESM compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('tree-sitter');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CSharp = require('tree-sitter-c-sharp');

const inputSchema = z.object({
  code: z.string().min(1, 'Code cannot be empty'),
  mode: z.enum(['basic', 'strict']).optional().default('basic'),
});

interface ValidationError {
  code?: string;
  message: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  mode: 'basic' | 'strict';
  errors: ValidationError[];
  warnings: ValidationError[];
  summary?: {
    classes: number;
    methods: number;
    properties: number;
    fields: number;
  };
}

type TSNode = {
  type: string;
  text: string;
  childCount: number;
  startPosition: { row: number; column: number };
  child(index: number): TSNode;
};

export class ScriptValidateTool implements ITool {
  readonly name = 'script_validate';
  readonly description =
    'Validate C# syntax without execution. Basic mode uses tree-sitter (no bridge needed). Strict mode uses Roslyn compilation check via bridge.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'C# code to validate',
      },
      mode: {
        type: 'string',
        enum: ['basic', 'strict'],
        description:
          'Validation mode: basic (tree-sitter syntax) or strict (Roslyn compilation). Default: basic.',
        default: 'basic',
      },
    },
    required: ['code'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: false, // basic mode works offline
    dangerous: false,
    readOnly: true,
  };

  private bridgeClient: BridgeClient | null = null;
  private structParser: CSharpParser | null = null;

  /** Inject the bridge client instance for strict mode. */
  setBridgeClient(client: BridgeClient): void {
    this.bridgeClient = client;
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { code, mode } = parsed.data;

    // If strict mode requested but bridge unavailable, fallback to basic
    const effectiveMode =
      mode === 'strict' && (!context.unityBridgeConnected || !this.bridgeClient)
        ? 'basic'
        : mode;

    try {
      let result: ValidationResult;
      if (effectiveMode === 'strict') {
        result = await this.validateStrict(code);
      } else {
        result = this.validateBasic(code);
      }

      // If we fell back from strict to basic, indicate it
      if (mode === 'strict' && effectiveMode === 'basic') {
        result.mode = 'basic';
      }

      return { content: JSON.stringify(result, null, 2) };
    } catch (err) {
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  private getStructParser(): CSharpParser {
    if (!this.structParser) {
      this.structParser = new CSharpParser();
    }
    return this.structParser;
  }

  private validateBasic(code: string): ValidationResult {
    // Use tree-sitter directly to find ERROR/MISSING nodes
    const errors = this.findTreeSitterErrors(code);

    // Use structured parser to compute summary
    const structParser = this.getStructParser();
    const nodes = structParser.parse(code);

    let classes = 0;
    let methods = 0;
    let properties = 0;
    let fields = 0;

    const countNodes = (
      nodeList: ReturnType<CSharpParser['parse']>,
    ): void => {
      for (const node of nodeList) {
        if (
          node.type === 'class' ||
          node.type === 'struct' ||
          node.type === 'interface'
        ) {
          classes++;
        } else if (node.type === 'method') {
          methods++;
        } else if (node.type === 'property') {
          properties++;
        } else if (node.type === 'field') {
          fields++;
        }
        if (node.children.length > 0) {
          countNodes(node.children);
        }
      }
    };
    countNodes(nodes);

    return {
      valid: errors.length === 0,
      mode: 'basic',
      errors,
      warnings: [],
      summary: { classes, methods, properties, fields },
    };
  }

  private findTreeSitterErrors(code: string): ValidationError[] {
    const parser = new Parser();
    parser.setLanguage(CSharp);
    const tree = parser.parse(code);

    const errors: ValidationError[] = [];
    const walk = (node: TSNode): void => {
      if (node.type === 'ERROR' || node.type === 'MISSING') {
        errors.push({
          message: `Syntax error: unexpected ${
            node.type === 'MISSING'
              ? 'missing token'
              : `'${node.text.slice(0, 50)}'`
          }`,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          severity: 'error',
        });
      }
      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i));
      }
    };
    walk(tree.rootNode as TSNode);
    return errors;
  }

  private async validateStrict(
    code: string,
  ): Promise<ValidationResult> {
    const response = await this.bridgeClient!.request<{
      success: boolean;
      result?: {
        errors: Array<{
          code: string;
          message: string;
          line: number;
          column: number;
        }>;
        warnings: Array<{
          code: string;
          message: string;
          line: number;
          column: number;
        }>;
      };
      error?: string;
    }>('script.validate', { code });

    if (response.result) {
      const errors: ValidationError[] = (response.result.errors ?? []).map(
        (e) => ({
          code: e.code,
          message: e.message,
          line: e.line,
          column: e.column,
          severity: 'error' as const,
        }),
      );
      const warnings: ValidationError[] = (
        response.result.warnings ?? []
      ).map((w) => ({
        code: w.code,
        message: w.message,
        line: w.line,
        column: w.column,
        severity: 'warning' as const,
      }));

      return {
        valid: errors.length === 0,
        mode: 'strict',
        errors,
        warnings,
      };
    }

    throw new Error(response.error ?? 'Unknown validation error');
  }
}
