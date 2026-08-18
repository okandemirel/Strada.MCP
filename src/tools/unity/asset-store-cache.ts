import { gunzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

/**
 * What the user already owns.
 *
 * Generating a racing car for someone who bought one is waste twice over: the
 * time to make it, and a worse asset than the one sitting on their disk. So
 * before anything is generated, this answers what is actually there.
 *
 * The Package Manager's "My Assets" tab is backed by a logged-in web API, but
 * every package the user has downloaded is already on disk, laid out as
 * <root>/<Publisher>/<Category>/<Name>.unitypackage. That is readable with no
 * account, no network and no Editor, which makes it usable on the headless path
 * where everything else in this product runs.
 */

/** Where Unity keeps downloaded Asset Store packages, per platform. */
export function assetStoreRoots(home: string = homedir(), os: string = platform()): string[] {
  const candidates: Record<string, string[]> = {
    darwin: [join(home, 'Library', 'Unity', 'Asset Store-5.x')],
    win32: [
      join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'Unity', 'Asset Store-5.x'),
    ],
    linux: [join(home, '.local', 'share', 'unity3d', 'Asset Store-5.x')],
  };
  return candidates[os] ?? candidates['linux']!;
}

export interface PurchasedPackage {
  readonly name: string;
  readonly publisher: string;
  /** Asset Store category, as the cache spells it, e.g. "3D ModelsVehiclesLand". */
  readonly category: string;
  readonly path: string;
  readonly sizeBytes: number;
  /** Download time in ms; the closest thing the cache has to a purchase date. */
  readonly downloadedAtMs: number;
}

/** Every package under a cache root. Missing roots yield nothing, not an error. */
export function listPurchasedPackages(root: string): PurchasedPackage[] {
  if (!existsSync(root)) return [];

  const packages: PurchasedPackage[] = [];
  for (const publisher of safeDirs(root)) {
    const publisherDir = join(root, publisher);
    for (const category of safeDirs(publisherDir)) {
      const categoryDir = join(publisherDir, category);
      for (const entry of safeEntries(categoryDir)) {
        if (!entry.endsWith('.unitypackage')) continue;
        const path = join(categoryDir, entry);
        try {
          const stat = statSync(path);
          packages.push({
            name: entry.replace(/\.unitypackage$/, ''),
            publisher,
            category,
            path,
            sizeBytes: stat.size,
            downloadedAtMs: stat.mtimeMs,
          });
        } catch {
          // Vanished between listing and stat; nothing to report.
        }
      }
    }
  }
  return packages;
}

/**
 * Packages matching a free-text need, best first.
 *
 * Scored rather than filtered: a query like "racing car" should still surface a
 * package named "ARCADE FREE Racing Car" when one word is spelled differently,
 * and should rank a name match above a category match — the category is a broad
 * bucket ("3D ModelsVehiclesLand") that matches far too much on its own.
 */
export function searchPackages(
  packages: readonly PurchasedPackage[],
  query: string,
): Array<PurchasedPackage & { score: number }> {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return packages.map((p) => ({ ...p, score: 0 }));

  const scored = packages.map((p) => {
    const name = p.name.toLowerCase();
    const category = p.category.toLowerCase();
    const publisher = p.publisher.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) score += 3;
      else if (category.includes(term)) score += 1;
      else if (publisher.includes(term)) score += 1;
    }
    return { ...p, score };
  });

  return scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * A minimal tar reader.
 *
 * A .unitypackage is a gzipped tar in which every asset is a GUID directory
 * holding a `pathname` file with its path inside a project. Reading those is the
 * difference between knowing a package is called "ARCADE FREE Racing Car" and
 * knowing it contains a drivable car prefab.
 *
 * Written out rather than shelling to `tar` because the flag for extracting a
 * subset differs between BSD and GNU tar, and this runs on whatever the user
 * has.
 */
export function parseTarEntries(buffer: Buffer): Array<{ name: string; content: Buffer }> {
  const entries: Array<{ name: string; content: Buffer }> = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    // Two consecutive zero blocks end the archive; one is enough to stop here.
    if (header.every((byte) => byte === 0)) break;

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeField, 8);
    if (!Number.isFinite(size) || size < 0) break;

    const start = offset + 512;
    const end = start + size;
    if (end > buffer.length) break;

    if (name !== '') entries.push({ name, content: buffer.subarray(start, end) });
    // Entry data is padded to a 512-byte boundary.
    offset = start + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export interface PackageContents {
  readonly paths: string[];
  readonly truncated: boolean;
  readonly skippedReason?: string;
}

/** Default ceiling on inspection: decompressing a multi-GB package in memory is not worth an answer. */
export const INSPECT_SIZE_LIMIT_BYTES = 500 * 1024 * 1024;

/** The project paths a package would add, read out of the archive itself. */
export function readPackageContents(
  packagePath: string,
  limit = 400,
  sizeLimitBytes = INSPECT_SIZE_LIMIT_BYTES,
): PackageContents {
  let size: number;
  try {
    size = statSync(packagePath).size;
  } catch {
    return { paths: [], truncated: false, skippedReason: 'the package could not be read' };
  }

  if (size > sizeLimitBytes) {
    return {
      paths: [],
      truncated: false,
      skippedReason:
        `the package is ${Math.round(size / 1024 / 1024)} MB, over the ` +
        `${Math.round(sizeLimitBytes / 1024 / 1024)} MB inspection limit`,
    };
  }

  let entries: Array<{ name: string; content: Buffer }>;
  try {
    entries = parseTarEntries(gunzipSync(readFileSync(packagePath)));
  } catch (error) {
    return { paths: [], truncated: false, skippedReason: `unreadable archive: ${String(error)}` };
  }

  const paths: string[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('/pathname')) continue;
    const value = entry.content.toString('utf8').split('\n')[0]?.trim();
    if (value) paths.push(value);
  }

  paths.sort();
  return { paths: paths.slice(0, limit), truncated: paths.length > limit };
}

function safeDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function safeEntries(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}
