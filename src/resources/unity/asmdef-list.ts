import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { relative } from 'node:path';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

interface AsmdefInfo {
  name: string;
  path: string;
  references: string[];
}

export class AsmdefListResource implements IResource {
  readonly uri = 'unity://assemblies';
  readonly name = 'Unity Assembly Definitions';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'List all .asmdef files with their references',
  };

  constructor(private readonly projectPath: string) {}

  async read(): Promise<ResourceContent> {
    const pattern = '**/*.asmdef';
    let files: string[];
    try {
      files = await glob(pattern, {
        cwd: this.projectPath,
        absolute: true,
        nodir: true,
      });
    } catch {
      throw new Error(`Cannot scan for .asmdef files in ${this.projectPath}`);
    }

    const asmdefs: AsmdefInfo[] = [];

    for (const filePath of files) {
      try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as { name?: string; references?: string[] };
        asmdefs.push({
          name: parsed.name ?? 'unknown',
          path: relative(this.projectPath, filePath),
          references: parsed.references ?? [],
        });
      } catch {
        // Skip malformed asmdef files
        asmdefs.push({
          name: 'parse-error',
          path: relative(this.projectPath, filePath),
          references: [],
        });
      }
    }

    // Sort by name
    asmdefs.sort((a, b) => a.name.localeCompare(b.name));

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify({ count: asmdefs.length, assemblies: asmdefs }, null, 2),
    };
  }
}
