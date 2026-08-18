import { gunzipSync } from 'node:zlib';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { parseTarEntries } from './asset-store-cache.js';

/**
 * Import a .unitypackage into a project, without the Editor.
 *
 * unity_my_assets can find that the user already owns a racing car. Nothing
 * could then put it in the project, which left the instruction "prefer a package
 * the user already owns" unfollowable — the same missing-verb shape as being able
 * to inspect a scene but never assign a serialized field.
 *
 * The extraction is done here rather than through AssetDatabase.ImportPackage
 * because that call is event-driven and does not reliably complete before an
 * -executeMethod process exits. A .unitypackage is a gzipped tar of GUID
 * directories, each holding `pathname` (where the asset goes), `asset` (its
 * bytes, absent for a folder) and `asset.meta`. Writing those out is fully
 * deterministic, and Unity imports them on its next refresh.
 *
 * Writing asset.meta is what makes this an import rather than a file copy: the
 * meta carries the GUID, and every reference inside the package — material to
 * texture, prefab to mesh — is stored by GUID. Drop the metas and the package
 * arrives as a pile of files wired to nothing.
 */

export interface ImportedAsset {
  readonly path: string;
  readonly isFolder: boolean;
}

export interface ImportResult {
  readonly imported: ImportedAsset[];
  readonly skipped: string[];
  readonly conflicts: string[];
  readonly error?: string;
}

/**
 * Is this destination inside the project, and inside a directory Unity imports?
 *
 * A pathname comes from an archive the user downloaded, not from us. One
 * containing `../` would otherwise write outside the project entirely.
 */
export function isSafeDestination(projectPath: string, pathname: string): boolean {
  if (pathname.trim() === '') return false;

  // Unity only imports these two roots; anything else is not an asset path.
  const declared = /^(Assets|Packages)\//.exec(pathname)?.[1];
  if (!declared) return false;

  // The check is "inside the root it declared", not "inside the project".
  // `Assets/../escape.txt` resolves to a path that is still under the project
  // and is nonetheless outside Assets/ — it lands where Unity imports nothing,
  // under a name the package did not declare.
  const root = resolve(projectPath, declared);
  const target = resolve(projectPath, pathname);
  return target.startsWith(root + sep);
}

/** The entries of a .unitypackage, grouped by the GUID directory they belong to. */
export function readPackageEntries(
  packagePath: string,
): Map<string, { pathname?: string; asset?: Buffer; meta?: Buffer }> {
  const entries = parseTarEntries(gunzipSync(readFileSync(packagePath)));
  const byGuid = new Map<string, { pathname?: string; asset?: Buffer; meta?: Buffer }>();

  for (const entry of entries) {
    const slash = entry.name.indexOf('/');
    if (slash === -1) continue;
    const guid = entry.name.slice(0, slash);
    const kind = entry.name.slice(slash + 1);

    const record = byGuid.get(guid) ?? {};
    if (kind === 'pathname') record.pathname = entry.content.toString('utf8').split('\n')[0]?.trim();
    else if (kind === 'asset') record.asset = entry.content;
    else if (kind === 'asset.meta') record.meta = entry.content;
    // preview.png and anything else is not part of the project.
    byGuid.set(guid, record);
  }

  return byGuid;
}

export interface ImportOptions {
  /** Only import assets whose path starts with one of these, e.g. ["Assets/Car/Meshes"]. */
  readonly only?: readonly string[];
  /** Overwrite files that already exist. Off by default: an import must not silently replace work. */
  readonly overwrite?: boolean;
}

/** Writes a package's assets into the project. */
export function importUnityPackage(
  packagePath: string,
  projectPath: string,
  options: ImportOptions = {},
): ImportResult {
  let byGuid: ReturnType<typeof readPackageEntries>;
  try {
    byGuid = readPackageEntries(packagePath);
  } catch (error) {
    return { imported: [], skipped: [], conflicts: [], error: `unreadable package: ${String(error)}` };
  }

  const imported: ImportedAsset[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];

  for (const record of byGuid.values()) {
    const pathname = record.pathname;
    if (!pathname) continue;

    if (!isSafeDestination(projectPath, pathname)) {
      skipped.push(`${pathname} (outside the project's asset roots)`);
      continue;
    }
    if (options.only && options.only.length > 0 && !options.only.some((p) => pathname.startsWith(p))) {
      continue;
    }

    const destination = join(projectPath, pathname);
    const isFolder = record.asset === undefined;

    if (!options.overwrite && existsSync(destination) && !isFolder) {
      conflicts.push(pathname);
      continue;
    }

    try {
      if (isFolder) {
        mkdirSync(destination, { recursive: true });
      } else {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, record.asset!);
      }
      // The meta carries the GUID every reference in the package points at.
      if (record.meta) writeFileSync(`${destination}.meta`, record.meta);
      imported.push({ path: pathname, isFolder });
    } catch (error) {
      skipped.push(`${pathname} (${String(error)})`);
    }
  }

  imported.sort((a, b) => a.path.localeCompare(b.path));
  return { imported, skipped, conflicts };
}
