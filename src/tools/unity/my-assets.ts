import type { ITool, ToolResult, ToolMetadata } from '../tool.interface.js';
import {
  assetStoreRoots,
  listPurchasedPackages,
  searchPackages,
  readPackageContents,
  type PurchasedPackage,
} from './asset-store-cache.js';

/**
 * Search what the user already owns before making anything.
 *
 * Generating a racing car for someone who already bought one wastes the time to
 * make it and delivers a worse asset than the one on their disk. The instruction
 * this serves is explicit: prefer a package from the user's My Assets when one
 * fits, and only generate when nothing does.
 *
 * The Package Manager's My Assets tab is backed by a logged-in web API. Every
 * package the user has downloaded is also already on disk, which is readable
 * with no account, no network and no Editor — the only kind of answer available
 * on the headless path this product runs on.
 */
export class MyAssetsTool implements ITool {
  readonly name = 'unity_my_assets';
  readonly description =
    "Search the Unity Asset Store packages the user has already downloaded (Package Manager's " +
    '"My Assets"), by keyword, and optionally list the files inside a package. Use this BEFORE ' +
    'generating or importing any art, model, texture or tool asset: a package the user already ' +
    'owns beats one that has to be made. Reads the local download cache, so it needs no Unity ' +
    'Editor, no login and no network.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'What is needed, in plain words, e.g. "racing car model" or "UI icons". Omit to list ' +
          'everything the user has.',
      },
      inspect: {
        type: 'boolean',
        description:
          'Also list the asset paths inside each match, so you can see whether a package really ' +
          'contains the mesh, prefab or texture you need rather than guessing from its name.',
      },
      limit: {
        type: 'number',
        description: 'Maximum packages to report (default 20).',
      },
    },
    required: [],
  };

  get metadata(): ToolMetadata {
    return {
      category: 'unity-asset',
      requiresBridge: false,
      dangerous: false,
      readOnly: true,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      timeoutMs: 30_000,
    };
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const roots = assetStoreRoots();
    const packages = roots.flatMap((root) => listPurchasedPackages(root));

    if (packages.length === 0) {
      return {
        content:
          'No downloaded Asset Store packages found. Looked in:\n' +
          roots.map((r) => `  ${r}`).join('\n') +
          '\n\nThe cache only holds packages the user has downloaded at least once, so an empty ' +
          'result means nothing is available locally — not that the user owns nothing. Generate ' +
          'or import what is needed.',
        isError: false,
      };
    }

    const query = typeof input['query'] === 'string' ? input['query'].trim() : '';
    const limit = typeof input['limit'] === 'number' ? Math.max(1, input['limit']) : 20;
    const matches = query === ''
      ? packages.map((p) => ({ ...p, score: 0 }))
      : searchPackages(packages, query);

    if (matches.length === 0) {
      return {
        content:
          `None of the user's ${packages.length} downloaded packages matches "${query}". ` +
          `They have: ${packages.map((p) => p.name).join('; ')}.\n\n` +
          'Nothing here fits, so generating or importing is the right call.',
        isError: false,
      };
    }

    const shown = matches.slice(0, limit);
    const inspect = input['inspect'] === true;
    return { content: this.render(shown, packages.length, query, inspect), isError: false };
  }

  private render(
    matches: Array<PurchasedPackage & { score: number }>,
    total: number,
    query: string,
    inspect: boolean,
  ): string {
    const lines: string[] = [];
    lines.push(
      query === ''
        ? `${total} downloaded Asset Store package(s):`
        : `${matches.length} of ${total} downloaded package(s) match "${query}", best first:`,
    );

    for (const p of matches) {
      lines.push('');
      lines.push(`  ${p.name}`);
      lines.push(`    by ${p.publisher} — ${p.category} — ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
      lines.push(`    ${p.path}`);

      if (!inspect) continue;
      const contents = readPackageContents(p.path, 60);
      if (contents.skippedReason) {
        lines.push(`    contents not read: ${contents.skippedReason}`);
        continue;
      }
      lines.push(`    contains ${contents.paths.length}${contents.truncated ? '+' : ''} asset(s):`);
      for (const path of contents.paths) lines.push(`      ${path}`);
    }

    if (!inspect) {
      lines.push('', 'Pass inspect: true to see what is actually inside these, rather than judging by name.');
    }
    return lines.join('\n');
  }
}
