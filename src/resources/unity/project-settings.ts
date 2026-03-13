import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

const CATEGORIES = ['player', 'quality', 'physics', 'input', 'editor', 'graphics'] as const;
type SettingsCategory = (typeof CATEGORIES)[number];

const CATEGORY_FILES: Record<SettingsCategory, string> = {
  player: 'ProjectSettings.asset',
  quality: 'QualitySettings.asset',
  physics: 'DynamicsManager.asset',
  input: 'InputManager.asset',
  editor: 'EditorSettings.asset',
  graphics: 'GraphicsSettings.asset',
};

export class ProjectSettingsResource implements IResource {
  readonly uri = 'unity://project-settings/{category}';
  readonly name = 'Unity Project Settings';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Read ProjectSettings/*.asset files by category',
  };

  constructor(private readonly projectPath: string) {}

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const category = params?.category;

    if (!category) {
      return this.listCategories();
    }

    if (!CATEGORIES.includes(category as SettingsCategory)) {
      throw new Error(
        `Unknown category "${category}". Supported: ${CATEGORIES.join(', ')}`,
      );
    }

    const fileName = CATEGORY_FILES[category as SettingsCategory];
    const filePath = join(this.projectPath, 'ProjectSettings', fileName);

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      throw new Error(
        `Cannot read ${fileName} at ${filePath}. Is UNITY_PROJECT_PATH set correctly?`,
      );
    }

    const parsed = parseUnityYaml(raw);

    return {
      uri: `unity://project-settings/${category}`,
      mimeType: 'application/json',
      text: JSON.stringify(parsed, null, 2),
    };
  }

  private async listCategories(): Promise<ResourceContent> {
    const settingsDir = join(this.projectPath, 'ProjectSettings');
    let files: string[] = [];
    try {
      files = await readdir(settingsDir);
    } catch {
      // Directory doesn't exist, return empty list
    }

    const lines = ['# Unity Project Settings\n', 'Available categories:\n'];
    for (const cat of CATEGORIES) {
      const file = CATEGORY_FILES[cat];
      const exists = files.includes(file);
      lines.push(`- **${cat}** — \`${file}\` ${exists ? '(found)' : '(not found)'}`);
    }

    return {
      uri: this.uri,
      mimeType: 'text/markdown',
      text: lines.join('\n'),
    };
  }
}

/**
 * Simple Unity YAML-like parser using regex.
 * Extracts key-value pairs from Unity .asset files.
 * Does not handle deeply nested structures — returns flat key-value map.
 */
function parseUnityYaml(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Skip Unity header lines (starting with %YAML or ---)
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty, comments, YAML header, document markers
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('%') || trimmed === '---') {
      continue;
    }

    // Match "key: value" patterns
    const match = trimmed.match(/^([a-zA-Z_][\w.]*)\s*:\s*(.+)$/);
    if (match) {
      result[match[1]] = match[2].trim();
    }
  }

  return result;
}
