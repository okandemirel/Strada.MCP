import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assetStoreRoots,
  listPurchasedPackages,
  searchPackages,
  parseTarEntries,
  readPackageContents,
} from './asset-store-cache.js';

/** One tar entry, header and padded body, as the real format lays it out. */
function tarEntry(name: string, body: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'utf8');
  // Size is octal, NUL-terminated, at offset 124.
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
  const content = Buffer.from(body, 'utf8');
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

const tar = (...entries: Buffer[]): Buffer => Buffer.concat([...entries, Buffer.alloc(1024)]);

describe('where the cache lives', () => {
  it('knows the macOS location', () => {
    expect(assetStoreRoots('/Users/x', 'darwin')).toEqual([
      '/Users/x/Library/Unity/Asset Store-5.x',
    ]);
  });

  it('falls back rather than returning nothing on an unknown platform', () => {
    expect(assetStoreRoots('/home/x', 'aix').length).toBeGreaterThan(0);
  });
});

describe('listing what the user has downloaded', () => {
  function cache(): string {
    const root = mkdtempSync(join(tmpdir(), 'asset-store-'));
    // The real layout: <Publisher>/<Category>/<Name>.unitypackage
    mkdirSync(join(root, 'Mena', '3D ModelsVehiclesLand'), { recursive: true });
    writeFileSync(join(root, 'Mena', '3D ModelsVehiclesLand', 'ARCADE FREE Racing Car.unitypackage'), 'x');
    mkdirSync(join(root, 'Pirate Parrot', 'Textures MaterialsIcons UI'), { recursive: true });
    writeFileSync(join(root, 'Pirate Parrot', 'Textures MaterialsIcons UI', '20 Logo Templates.unitypackage'), 'x');
    // Stray files at the wrong depth must not be mistaken for packages.
    writeFileSync(join(root, 'Mena', 'notes.txt'), 'x');
    writeFileSync(join(root, 'Mena', '3D ModelsVehiclesLand', 'preview.png'), 'x');
    return root;
  }

  it('reads publisher, category and name from the layout', () => {
    const found = listPurchasedPackages(cache());

    expect(found).toHaveLength(2);
    const car = found.find((p) => p.name.includes('Racing'))!;
    expect(car.publisher).toBe('Mena');
    expect(car.category).toBe('3D ModelsVehiclesLand');
    expect(car.name).toBe('ARCADE FREE Racing Car');
  });

  it('returns nothing for a cache that is not there', () => {
    // A user who never downloaded anything is not an error.
    expect(listPurchasedPackages(join(tmpdir(), 'no-such-cache-anywhere'))).toEqual([]);
  });
});

describe('finding the package that fits', () => {
  const packages = [
    { name: 'ARCADE FREE Racing Car', publisher: 'Mena', category: '3D ModelsVehiclesLand', path: '/a', sizeBytes: 1, downloadedAtMs: 1 },
    { name: '20 Logo Templates', publisher: 'Pirate Parrot', category: 'Textures MaterialsIcons UI', path: '/b', sizeBytes: 1, downloadedAtMs: 1 },
    { name: 'Asset Store Publishing Tools', publisher: 'Unity Technologies', category: 'Editor ExtensionsUtilities', path: '/c', sizeBytes: 1, downloadedAtMs: 1 },
  ];

  it('ranks a name match above a category match', () => {
    // "3D ModelsVehiclesLand" would match half a query on its own; the name is
    // the part that says what the package actually is.
    const results = searchPackages(packages, 'racing car');

    expect(results[0]!.name).toBe('ARCADE FREE Racing Car');
    expect(results[0]!.score).toBeGreaterThan(1);
  });

  it('still matches on category when the name says nothing', () => {
    expect(searchPackages(packages, 'icons').map((r) => r.name)).toEqual(['20 Logo Templates']);
  });

  it('returns nothing rather than everything when nothing fits', () => {
    // The answer that leads to generating the asset. A search that degrades to
    // "here is all of it" would have the agent import something irrelevant.
    expect(searchPackages(packages, 'spaceship cockpit')).toEqual([]);
  });

  it('ignores one-letter noise in the query', () => {
    expect(searchPackages(packages, 'a car').map((r) => r.name)).toEqual(['ARCADE FREE Racing Car']);
  });
});

describe('reading what is inside a package', () => {
  it('pulls the project paths out of the archive', () => {
    const archive = gzipSync(
      tar(
        tarEntry('abc123/pathname', 'Assets/Car/Meshes/Car.fbx'),
        tarEntry('abc123/asset', 'binary junk'),
        tarEntry('def456/pathname', 'Assets/Car/Materials/Body.mat'),
      ),
    );
    const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Car.unitypackage');
    writeFileSync(path, archive);

    expect(readPackageContents(path).paths).toEqual([
      'Assets/Car/Materials/Body.mat',
      'Assets/Car/Meshes/Car.fbx',
    ]);
  });

  it('reports truncation rather than silently showing part of the list', () => {
    const entries = Array.from({ length: 5 }, (_, i) => tarEntry(`g${i}/pathname`, `Assets/A${i}.mat`));
    const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Many.unitypackage');
    writeFileSync(path, gzipSync(tar(...entries)));

    const contents = readPackageContents(path, 2);

    expect(contents.paths).toHaveLength(2);
    expect(contents.truncated).toBe(true);
  });

  it('refuses a package too large to decompress in memory', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Huge.unitypackage');
    writeFileSync(path, gzipSync(tar(tarEntry('a/pathname', 'Assets/A.mat'))));

    const contents = readPackageContents(path, 400, 1);

    expect(contents.paths).toEqual([]);
    expect(contents.skippedReason).toContain('inspection limit');
  });

  it('explains itself instead of throwing on a corrupt archive', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Bad.unitypackage');
    writeFileSync(path, Buffer.from('not a gzip stream at all'));

    expect(readPackageContents(path).skippedReason).toContain('unreadable archive');
  });
});

describe('the tar reader', () => {
  it('stops at the end-of-archive blocks instead of reading padding as entries', () => {
    expect(parseTarEntries(tar(tarEntry('a/pathname', 'Assets/A.mat')))).toHaveLength(1);
  });

  it('stops on a truncated archive rather than reading past the end', () => {
    // A download interrupted mid-write must not crash the search.
    const full = tar(tarEntry('a/pathname', 'Assets/A.mat'));
    expect(() => parseTarEntries(full.subarray(0, 600))).not.toThrow();
  });

  it('reads a name shorter than its 100-byte field', () => {
    const entries = parseTarEntries(tar(tarEntry('x/pathname', 'Assets/X.mat')));
    expect(entries[0]!.name).toBe('x/pathname');
  });
});
