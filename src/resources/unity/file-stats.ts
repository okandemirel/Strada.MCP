import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { relative, dirname } from 'node:path';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

interface FileStats {
  totalFiles: number;
  totalLines: number;
  namespaces: Record<string, number>;
  directories: Record<string, number>;
}

export class FileStatsResource implements IResource {
  readonly uri = 'unity://file-stats';
  readonly name = 'Unity Project File Statistics';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Count .cs files, total LOC, namespace distribution, directory breakdown',
  };

  constructor(private readonly projectPath: string) {}

  async read(): Promise<ResourceContent> {
    const pattern = '**/*.cs';
    let files: string[];
    try {
      files = await glob(pattern, {
        cwd: this.projectPath,
        absolute: true,
        nodir: true,
      });
    } catch {
      throw new Error(`Cannot scan for .cs files in ${this.projectPath}`);
    }

    const stats: FileStats = {
      totalFiles: files.length,
      totalLines: 0,
      namespaces: {},
      directories: {},
    };

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        stats.totalLines += lines.length;

        // Extract namespace
        const nsMatch = content.match(/^namespace\s+([\w.]+)/m);
        if (nsMatch) {
          const ns = nsMatch[1];
          stats.namespaces[ns] = (stats.namespaces[ns] ?? 0) + 1;
        }

        // Directory breakdown (relative, top-level)
        const relDir = dirname(relative(this.projectPath, filePath)).split('/')[0] ?? '.';
        stats.directories[relDir] = (stats.directories[relDir] ?? 0) + 1;
      } catch {
        // Skip unreadable files
      }
    }

    // Sort namespaces and directories by count (descending)
    stats.namespaces = sortByValue(stats.namespaces);
    stats.directories = sortByValue(stats.directories);

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(stats, null, 2),
    };
  }
}

function sortByValue(obj: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) => b - a),
  );
}
