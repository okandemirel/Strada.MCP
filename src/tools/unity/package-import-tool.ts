import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { assetStoreRoots, listPurchasedPackages, searchPackages } from './asset-store-cache.js';
import { importUnityPackage } from './package-import.js';

/**
 * Put a package the user already owns into the project.
 *
 * unity_my_assets answers "do they already have a racing car". Until this tool
 * existed, nothing could act on that answer, so the rule "prefer a package the
 * user already owns over generating one" was unfollowable — the same shape as
 * being able to read a scene but never assign a serialized field.
 *
 * Needs no Editor: the assets and their .meta files are written directly, and
 * Unity imports them on its next refresh. The metas are the point — every
 * reference inside a package is stored by GUID, and the GUID lives in the meta.
 */
export class ImportAssetPackageTool implements ITool {
  readonly name = 'unity_import_asset_package';
  readonly description =
    "Import a Unity Asset Store package the user already owns into the project, by name or path, " +
    'with no Editor open. Preserves each asset\'s .meta so references inside the package survive. ' +
    'Use after unity_my_assets finds a package that fits, instead of generating the asset. ' +
    'Refuses to overwrite existing files unless told to, and reports exactly what it wrote.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'The package to import, as unity_my_assets reported it. Matched against the downloaded ' +
          'packages; the best match is used, and an ambiguous match is reported rather than guessed.',
      },
      packagePath: {
        type: 'string',
        description: 'Full path to a .unitypackage, as an alternative to name.',
      },
      projectPath: {
        type: 'string',
        description: 'Unity project root. Defaults to the tool context project path.',
      },
      only: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Import only assets under these paths, e.g. ["Assets/ARCADE - FREE Racing Car/Meshes"]. ' +
          'Use unity_my_assets with inspect: true to see what a package contains first.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Replace files that already exist (default false, so an import cannot quietly undo work).',
      },
    },
    required: [],
  };

  get metadata(): ToolMetadata {
    return {
      category: 'unity-asset',
      requiresBridge: false,
      dangerous: false,
      readOnly: false,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      timeoutMs: 120_000,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: `Error: Cannot execute ${this.name} in read-only mode.`, isError: true };
    }

    const projectPath = String(input['projectPath'] ?? context.projectPath ?? '');
    if (!projectPath) {
      return { content: 'Error: no projectPath given and none in context.', isError: true };
    }

    const resolved = this.resolvePackage(input);
    if ('error' in resolved) return { content: resolved.error, isError: true };

    const only = Array.isArray(input['only'])
      ? (input['only'] as unknown[]).filter((p): p is string => typeof p === 'string')
      : undefined;

    const result = importUnityPackage(resolved.path, projectPath, {
      only,
      overwrite: input['overwrite'] === true,
    });

    if (result.error) {
      return { content: `Import failed: ${result.error}`, isError: true };
    }
    if (result.imported.length === 0) {
      return {
        content:
          `Nothing was imported from ${resolved.path}.` +
          (result.conflicts.length > 0
            ? ` ${result.conflicts.length} file(s) already exist; pass overwrite: true to replace them:\n  ` +
              result.conflicts.slice(0, 20).join('\n  ')
            : only
              ? ` No asset in the package is under ${only.join(', ')}.`
              : ' The package contains no importable asset.'),
        isError: true,
      };
    }

    return { content: this.render(resolved.path, result), isError: false };
  }

  private resolvePackage(input: Record<string, unknown>): { path: string } | { error: string } {
    const explicit = input['packagePath'];
    if (typeof explicit === 'string' && explicit.trim() !== '') return { path: explicit };

    const name = typeof input['name'] === 'string' ? input['name'].trim() : '';
    if (name === '') return { error: 'Error: pass either `name` or `packagePath`.' };

    const packages = assetStoreRoots().flatMap((root) => listPurchasedPackages(root));
    const exact = packages.filter((p) => p.name === name);
    if (exact.length === 1) return { path: exact[0]!.path };

    const matches = searchPackages(packages, name);
    if (matches.length === 0) {
      return {
        error:
          `No downloaded package matches "${name}". The user has: ` +
          `${packages.map((p) => p.name).join('; ') || '(none)'}.`,
      };
    }
    // An ambiguous top score is reported, not guessed: importing the wrong
    // package writes files that then have to be found and removed by hand.
    if (matches.length > 1 && matches[1]!.score === matches[0]!.score) {
      return {
        error:
          `"${name}" matches more than one package equally well: ` +
          `${matches.filter((m) => m.score === matches[0]!.score).map((m) => m.name).join('; ')}. ` +
          'Pass the exact name or a packagePath.',
      };
    }
    return { path: matches[0]!.path };
  }

  private render(
    packagePath: string,
    result: { imported: Array<{ path: string; isFolder: boolean }>; skipped: string[]; conflicts: string[] },
  ): string {
    const files = result.imported.filter((a) => !a.isFolder);
    const lines = [
      `Imported ${files.length} asset(s) from ${packagePath}.`,
      'Unity will import them on its next refresh; unity_verify_change compiles without opening the Editor.',
      '',
      'Wrote:',
    ];
    for (const asset of files.slice(0, 60)) lines.push(`  ${asset.path}`);
    if (files.length > 60) lines.push(`  ... and ${files.length - 60} more`);

    if (result.conflicts.length > 0) {
      lines.push('', `Left alone because they already exist (${result.conflicts.length}):`);
      for (const path of result.conflicts.slice(0, 20)) lines.push(`  ${path}`);
    }
    if (result.skipped.length > 0) {
      lines.push('', 'Skipped:');
      for (const entry of result.skipped.slice(0, 20)) lines.push(`  ${entry}`);
    }
    return lines.join('\n');
  }
}
