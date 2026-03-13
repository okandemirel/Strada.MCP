import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { glob } from 'glob';
import { z } from 'zod';
import { validatePath, isPathAllowed } from '../../security/path-guard.js';
import { sanitizeOutput } from '../../security/sanitizer.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  include: z.string().optional(),
  contextLines: z.number().int().min(0).max(10).optional(),
  maxResults: z.number().int().min(1).max(500).optional(),
});

interface GrepMatch {
  file: string;
  line: number;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
}

export class GrepSearchTool implements ITool {
  readonly name = 'grep_search';
  readonly description = 'Search file contents using regex with optional context lines';
  readonly inputSchema = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory to search in (relative to project root)' },
      include: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.cs")' },
      contextLines: { type: 'number', description: 'Lines of context before and after match (0-10)' },
      maxResults: { type: 'number', description: 'Maximum number of matches to return (default: 100)' },
    },
    required: ['pattern'],
  };
  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const {
        pattern: regexStr,
        path: searchPath,
        include,
        contextLines = 0,
        maxResults = 100,
      } = inputSchema.parse(input);

      let regex: RegExp;
      try {
        regex = new RegExp(regexStr, 'g');
      } catch {
        return { content: `Invalid regex pattern: "${regexStr}"`, isError: true };
      }

      const searchDir = searchPath
        ? validatePath(searchPath, context.projectPath)
        : context.projectPath;
      if ((context.allowedPaths ?? []).length > 0 && !isPathAllowed(searchDir, context.allowedPaths ?? [])) {
        return { content: `Path is outside allowed paths`, isError: true };
      }

      const filePattern = include ?? '**/*';
      const files = await glob(filePattern, {
        cwd: searchDir,
        nodir: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/*.png', '**/*.jpg', '**/*.gif', '**/*.ico', '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot'],
      });

      const matches: GrepMatch[] = [];
      let totalMatches = 0;

      for (const file of files.sort()) {
        if (totalMatches >= maxResults) break;

        const fullPath = path.join(searchDir, file);

        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > 1024 * 1024) continue; // skip files > 1MB
        } catch {
          continue;
        }

        const fileMatches = await this.searchFile(fullPath, regex, contextLines);

        for (const match of fileMatches) {
          if (totalMatches >= maxResults) break;
          matches.push({ ...match, file });
          totalMatches++;
        }
      }

      if (matches.length === 0) {
        return { content: `No matches found for pattern "${regexStr}"` };
      }

      const output = this.formatMatches(matches, contextLines);
      return { content: sanitizeOutput(output) };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  }

  private async searchFile(
    filePath: string,
    regex: RegExp,
    contextLines: number,
  ): Promise<Omit<GrepMatch, 'file'>[]> {
    const matches: Omit<GrepMatch, 'file'>[] = [];
    const lines: string[] = [];

    try {
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        lines.push(line);
      }
    } catch {
      return [];
    }

    for (let i = 0; i < lines.length; i++) {
      // Reset regex state for each line (global flag reuse)
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        const beforeStart = Math.max(0, i - contextLines);
        const afterEnd = Math.min(lines.length - 1, i + contextLines);

        matches.push({
          line: i + 1,
          text: lines[i],
          contextBefore: contextLines > 0 ? lines.slice(beforeStart, i) : [],
          contextAfter: contextLines > 0 ? lines.slice(i + 1, afterEnd + 1) : [],
        });
      }
    }

    return matches;
  }

  private formatMatches(matches: GrepMatch[], contextLines: number): string {
    const parts: string[] = [`Found ${matches.length} match(es):\n`];

    let lastFile = '';
    for (const match of matches) {
      if (match.file !== lastFile) {
        parts.push(`\n${match.file}:`);
        lastFile = match.file;
      }

      if (contextLines > 0 && match.contextBefore.length > 0) {
        for (let i = 0; i < match.contextBefore.length; i++) {
          const lineNum = match.line - match.contextBefore.length + i;
          parts.push(`  ${lineNum}-${match.contextBefore[i]}`);
        }
      }

      parts.push(`  ${match.line}:${match.text}`);

      if (contextLines > 0 && match.contextAfter.length > 0) {
        for (let i = 0; i < match.contextAfter.length; i++) {
          const lineNum = match.line + 1 + i;
          parts.push(`  ${lineNum}-${match.contextAfter[i]}`);
        }
      }
    }

    return parts.join('\n');
  }
}
