import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { validatePath } from '../../security/path-guard.js';
import { CSharpParser, type CSharpNode } from '../../intelligence/parser/csharp-parser.js';

export interface CSharpSymbolMatch {
  name: string;
  kind: string;
  filePath: string;
  namespace: string | null;
  parentChain: string[];
  startLine: number;
  endLine: number;
  modifiers: string[];
  snippet: string;
}

export interface CSharpReferenceMatch {
  filePath: string;
  line: number;
  column: number;
  text: string;
  isDefinition: boolean;
}

export interface CSharpRenameEdit {
  filePath: string;
  line: number;
  column: number;
  oldText: string;
  newText: string;
  context: string;
}

const parser = new CSharpParser();
const CSHARP_FILE_IGNORE = [
  'Library/**',
  'Logs/**',
  'Temp/**',
  'obj/**',
  'bin/**',
  '.git/**',
  'node_modules/**',
];

export async function collectCSharpFiles(projectPath: string): Promise<string[]> {
  const roots = await Promise.all([
    exists(path.join(projectPath, 'Assets')),
    exists(path.join(projectPath, 'Packages')),
  ]);

  const patterns = roots.some(Boolean)
    ? [
      roots[0] ? 'Assets/**/*.cs' : null,
      roots[1] ? 'Packages/**/*.cs' : null,
    ].filter((value): value is string => Boolean(value))
    : ['**/*.cs'];

  const files = new Set<string>();
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      nodir: true,
      ignore: CSHARP_FILE_IGNORE,
      windowsPathsNoEscape: true,
    });
    for (const match of matches) {
      files.add(match);
    }
  }

  return [...files].sort((a, b) => a.localeCompare(b));
}

export async function searchSymbols(
  projectPath: string,
  options: {
    query?: string;
    kinds?: string[];
    limit?: number;
    exact?: boolean;
  },
): Promise<CSharpSymbolMatch[]> {
  const files = await collectCSharpFiles(projectPath);
  const results: CSharpSymbolMatch[] = [];
  const normalizedQuery = (options.query ?? '').trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const allowedKinds = new Set((options.kinds ?? []).map((kind) => kind.toLowerCase()));

  for (const relativePath of files) {
    const absolutePath = validatePath(relativePath, projectPath);
    const source = await fs.readFile(absolutePath, 'utf8');
    const nodes = parser.parse(source);
    const lines = source.split(/\r?\n/);

    walkSymbols(nodes, [], null, (node, namespaceName, parentChain) => {
      if (results.length >= (options.limit ?? 100)) {
        return;
      }

      if (allowedKinds.size > 0 && !allowedKinds.has(node.type)) {
        return;
      }

      if (normalizedQuery) {
        const candidate = node.name.toLowerCase();
        const matched = options.exact
          ? candidate === lowerQuery
          : candidate.includes(lowerQuery);
        if (!matched) {
          return;
        }
      }

      results.push({
        name: node.name,
        kind: node.type,
        filePath: relativePath,
        namespace: namespaceName,
        parentChain,
        startLine: node.startLine,
        endLine: node.endLine,
        modifiers: node.modifiers,
        snippet: sliceLines(lines, node.startLine, node.endLine),
      });
    });
  }

  return results.slice(0, options.limit ?? 100);
}

export async function findReferences(
  projectPath: string,
  symbolName: string,
  options?: { limit?: number },
): Promise<CSharpReferenceMatch[]> {
  const files = await collectCSharpFiles(projectPath);
  const results: CSharpReferenceMatch[] = [];
  const expression = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');

  for (const relativePath of files) {
    const absolutePath = validatePath(relativePath, projectPath);
    const source = await fs.readFile(absolutePath, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((lineText, index) => {
      expression.lastIndex = 0;
      let match: RegExpExecArray | null = expression.exec(lineText);
      while (match) {
        results.push({
          filePath: relativePath,
          line: index + 1,
          column: match.index + 1,
          text: lineText.trim(),
          isDefinition: isDefinitionLine(lineText, symbolName),
        });

        if (results.length >= (options?.limit ?? 500)) {
          return;
        }

        match = expression.exec(lineText);
      }
    });

    if (results.length >= (options?.limit ?? 500)) {
      break;
    }
  }

  return results.slice(0, options?.limit ?? 500);
}

export async function buildRenamePreview(
  projectPath: string,
  oldName: string,
  newName: string,
  options?: { limit?: number },
): Promise<CSharpRenameEdit[]> {
  const references = await findReferences(projectPath, oldName, options);
  return references.map((reference) => ({
    filePath: reference.filePath,
    line: reference.line,
    column: reference.column,
    oldText: oldName,
    newText: newName,
    context: reference.text,
  }));
}

export async function applyRenamePreview(
  projectPath: string,
  edits: CSharpRenameEdit[],
): Promise<{ filesChanged: string[]; editCount: number }> {
  const grouped = new Map<string, CSharpRenameEdit[]>();
  for (const edit of edits) {
    const existing = grouped.get(edit.filePath);
    if (existing) {
      existing.push(edit);
    } else {
      grouped.set(edit.filePath, [edit]);
    }
  }

  const filesChanged: string[] = [];

  for (const [relativePath, fileEdits] of grouped) {
    const absolutePath = validatePath(relativePath, projectPath);
    const source = await fs.readFile(absolutePath, 'utf8');
    const lines = source.split(/\r?\n/);

    const sortedEdits = [...fileEdits].sort((a, b) => {
      if (b.line !== a.line) return b.line - a.line;
      return b.column - a.column;
    });

    let changed = false;
    for (const edit of sortedEdits) {
      const lineIndex = edit.line - 1;
      const line = lines[lineIndex];
      if (line === undefined) {
        continue;
      }

      const start = edit.column - 1;
      const current = line.slice(start, start + edit.oldText.length);
      if (current !== edit.oldText) {
        continue;
      }

      lines[lineIndex] = `${line.slice(0, start)}${edit.newText}${line.slice(start + edit.oldText.length)}`;
      changed = true;
    }

    if (changed) {
      await fs.writeFile(absolutePath, `${lines.join('\n')}\n`, 'utf8');
      filesChanged.push(relativePath);
    }
  }

  return {
    filesChanged,
    editCount: edits.length,
  };
}

function walkSymbols(
  nodes: CSharpNode[],
  parentChain: string[],
  namespaceName: string | null,
  onMatch: (node: CSharpNode, namespaceName: string | null, parentChain: string[]) => void,
): void {
  for (const node of nodes) {
    if (node.type !== 'namespace' && node.type !== 'using') {
      onMatch(node, namespaceName, parentChain);
    }

    const nextNamespace = node.type === 'namespace' ? node.name : namespaceName;
    const nextParentChain = node.type === 'class'
      || node.type === 'struct'
      || node.type === 'interface'
      || node.type === 'enum'
      ? [...parentChain, node.name]
      : parentChain;

    if (node.children.length > 0) {
      walkSymbols(node.children, nextParentChain, nextNamespace, onMatch);
    }
  }
}

function sliceLines(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine)).join('\n');
}

function isDefinitionLine(lineText: string, symbolName: string): boolean {
  const expression = new RegExp(
    `\\b(class|struct|interface|enum|void|bool|int|float|double|string|public|private|protected|internal|static|readonly|partial)\\b.*\\b${escapeRegExp(symbolName)}\\b`,
  );
  return expression.test(lineText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
