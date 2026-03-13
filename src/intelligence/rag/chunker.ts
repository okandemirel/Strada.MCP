import { createHash } from 'node:crypto';
import { CSharpParser, type CSharpNode } from '../parser/csharp-parser.js';

export interface CodeChunk {
  /** Unique content-based hash */
  contentHash: string;
  /** Chunk type */
  type: 'class' | 'struct' | 'interface' | 'enum' | 'method';
  /** Type/method name */
  name: string;
  /** Containing namespace */
  namespace: string;
  /** Parent class name (for methods) */
  parentClass?: string;
  /** Source file path (relative) */
  filePath: string;
  /** Raw source text of the chunk */
  content: string;
  /** 1-based start line */
  startLine: number;
  /** 1-based end line */
  endLine: number;
  /** Using directives in the file */
  usings: string[];
  /** Base types / implemented interfaces */
  baseTypes: string[];
  /** Attributes on the type/method */
  attributes: string[];
}

export class StructuralChunker {
  private readonly parser: CSharpParser;

  constructor() {
    this.parser = new CSharpParser();
  }

  chunk(source: string, filePath: string): CodeChunk[] {
    if (!source.trim()) return [];

    const ast = this.parser.parse(source);
    const usings = ast
      .filter((n) => n.type === 'using')
      .map((n) => n.name);
    const namespaceNode = ast.find((n) => n.type === 'namespace');
    const namespace = namespaceNode?.name ?? '';

    const chunks: CodeChunk[] = [];
    const lines = source.split('\n');

    const typeNodes = this.collectTypeNodes(ast);
    if (typeNodes.length === 0) return [];

    for (const node of typeNodes) {
      const typeChunk = this.nodeToChunk(node, filePath, namespace, usings, lines);
      if (typeChunk) {
        chunks.push(typeChunk);
      }

      // Extract method-level chunks from classes/structs
      if (node.type === 'class' || node.type === 'struct') {
        const methods = node.children.filter((c) => c.type === 'method');
        for (const method of methods) {
          const methodChunk = this.methodToChunk(
            method,
            node.name,
            filePath,
            namespace,
            usings,
            lines,
          );
          if (methodChunk) {
            chunks.push(methodChunk);
          }
        }
      }
    }

    return chunks;
  }

  private collectTypeNodes(nodes: CSharpNode[]): CSharpNode[] {
    const types: CSharpNode[] = [];
    for (const node of nodes) {
      if (['class', 'struct', 'interface', 'enum'].includes(node.type)) {
        types.push(node);
      }
      // Check namespace children
      if (node.type === 'namespace' && node.children) {
        types.push(...this.collectTypeNodes(node.children));
      }
    }
    return types;
  }

  private nodeToChunk(
    node: CSharpNode,
    filePath: string,
    namespace: string,
    usings: string[],
    lines: string[],
  ): CodeChunk | null {
    const content = lines.slice(node.startLine - 1, node.endLine).join('\n');
    if (!content.trim()) return null;

    return {
      contentHash: this.hash(content),
      type: node.type as CodeChunk['type'],
      name: node.name,
      namespace,
      filePath,
      content,
      startLine: node.startLine,
      endLine: node.endLine,
      usings,
      baseTypes: node.baseTypes ?? [],
      attributes: node.attributes ?? [],
    };
  }

  private methodToChunk(
    node: CSharpNode,
    parentClass: string,
    filePath: string,
    namespace: string,
    usings: string[],
    lines: string[],
  ): CodeChunk | null {
    const content = lines.slice(node.startLine - 1, node.endLine).join('\n');
    if (!content.trim()) return null;

    return {
      contentHash: this.hash(content),
      type: 'method',
      name: node.name,
      namespace,
      parentClass,
      filePath,
      content,
      startLine: node.startLine,
      endLine: node.endLine,
      usings,
      baseTypes: [],
      attributes: node.attributes ?? [],
    };
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
