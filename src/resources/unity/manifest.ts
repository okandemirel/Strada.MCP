import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

export class ManifestResource implements IResource {
  readonly uri = 'unity://manifest';
  readonly name = 'Unity Package Manifest';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Read Packages/manifest.json from Unity project',
  };

  constructor(private readonly projectPath: string) {}

  async read(): Promise<ResourceContent> {
    const manifestPath = join(this.projectPath, 'Packages', 'manifest.json');

    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(
        `Cannot read manifest at ${manifestPath}. Is UNITY_PROJECT_PATH set correctly?`,
      );
    }

    // Validate it's valid JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`manifest.json is not valid JSON`);
    }

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(parsed, null, 2),
    };
  }
}
