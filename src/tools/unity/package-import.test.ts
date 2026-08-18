import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { importUnityPackage, isSafeDestination, readPackageEntries } from './package-import.js';

function tarEntry(name: string, body: string | Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'utf8');
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

/** One asset as a .unitypackage lays it out: pathname, bytes, and its meta. */
function asset(guid: string, pathname: string, body: string | null, meta = `guid: ${guid}`): Buffer[] {
  const entries = [tarEntry(`${guid}/pathname`, pathname), tarEntry(`${guid}/asset.meta`, meta)];
  if (body !== null) entries.push(tarEntry(`${guid}/asset`, body));
  return entries;
}

function packageFile(...entries: Buffer[]): string {
  const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Thing.unitypackage');
  writeFileSync(path, gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
  return path;
}

const project = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'import-'));
  mkdirSync(join(root, 'Assets'), { recursive: true });
  return root;
};

describe('importing a package the user owns', () => {
  it('writes each asset where the package says it goes', () => {
    const pkg = packageFile(...asset('aaa', 'Assets/Car/Meshes/Car.fbx', 'FBX-BYTES'));
    const root = project();

    const result = importUnityPackage(pkg, root);

    expect(result.imported.map((a) => a.path)).toEqual(['Assets/Car/Meshes/Car.fbx']);
    expect(readFileSync(join(root, 'Assets/Car/Meshes/Car.fbx'), 'utf8')).toBe('FBX-BYTES');
  });

  it('writes the .meta, which is what makes it an import and not a copy', () => {
    // Every reference inside a package is stored by GUID, and the GUID lives in
    // the meta. Drop the metas and the package arrives wired to nothing.
    const pkg = packageFile(...asset('bbb', 'Assets/Car/Body.mat', 'MAT', 'guid: bbb\ntimeCreated: 1'));
    const root = project();

    importUnityPackage(pkg, root);

    expect(readFileSync(join(root, 'Assets/Car/Body.mat.meta'), 'utf8')).toContain('guid: bbb');
  });

  it('creates a folder entry, which carries no asset bytes', () => {
    const pkg = packageFile(...asset('ccc', 'Assets/Car/Meshes', null));
    const root = project();

    const result = importUnityPackage(pkg, root);

    expect(result.imported[0]).toEqual({ path: 'Assets/Car/Meshes', isFolder: true });
    expect(existsSync(join(root, 'Assets/Car/Meshes'))).toBe(true);
  });

  it('refuses to overwrite existing work by default', () => {
    const pkg = packageFile(...asset('ddd', 'Assets/Car/Body.mat', 'FROM-PACKAGE'));
    const root = project();
    mkdirSync(join(root, 'Assets/Car'), { recursive: true });
    writeFileSync(join(root, 'Assets/Car/Body.mat'), 'MINE');

    const result = importUnityPackage(pkg, root);

    expect(result.conflicts).toEqual(['Assets/Car/Body.mat']);
    expect(readFileSync(join(root, 'Assets/Car/Body.mat'), 'utf8')).toBe('MINE');
  });

  it('overwrites when told to', () => {
    const pkg = packageFile(...asset('eee', 'Assets/Car/Body.mat', 'FROM-PACKAGE'));
    const root = project();
    mkdirSync(join(root, 'Assets/Car'), { recursive: true });
    writeFileSync(join(root, 'Assets/Car/Body.mat'), 'MINE');

    importUnityPackage(pkg, root, { overwrite: true });

    expect(readFileSync(join(root, 'Assets/Car/Body.mat'), 'utf8')).toBe('FROM-PACKAGE');
  });

  it('imports only the requested subtree when asked', () => {
    const pkg = packageFile(
      ...asset('f1', 'Assets/Car/Meshes/Car.fbx', 'A'),
      ...asset('f2', 'Assets/Car/Scenes/Demo.unity', 'B'),
    );
    const root = project();

    const result = importUnityPackage(pkg, root, { only: ['Assets/Car/Meshes'] });

    expect(result.imported.map((a) => a.path)).toEqual(['Assets/Car/Meshes/Car.fbx']);
    expect(existsSync(join(root, 'Assets/Car/Scenes/Demo.unity'))).toBe(false);
  });

  it('says so rather than throwing on an archive it cannot read', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pkg-')), 'Bad.unitypackage');
    writeFileSync(path, Buffer.from('not gzip'));

    expect(importUnityPackage(path, project()).error).toContain('unreadable package');
  });

  it('reads folder entries and file entries out of one archive', () => {
    const pkg = packageFile(...asset('g1', 'Assets/A', null), ...asset('g2', 'Assets/A/B.mat', 'X'));

    const entries = readPackageEntries(pkg);

    expect(entries.size).toBe(2);
    expect(entries.get('g1')!.asset).toBeUndefined();
    expect(entries.get('g2')!.asset!.toString()).toBe('X');
  });
});

describe('where a package is allowed to write', () => {
  it('accepts the two roots Unity imports', () => {
    expect(isSafeDestination('/p', 'Assets/Car/Car.fbx')).toBe(true);
    expect(isSafeDestination('/p', 'Packages/com.x/Runtime/A.cs')).toBe(true);
  });

  it('refuses to climb out of the project', () => {
    // The pathname comes from an archive the user downloaded, not from us.
    expect(isSafeDestination('/p', 'Assets/../../etc/passwd')).toBe(false);
    expect(isSafeDestination('/p', '../outside.txt')).toBe(false);
    expect(isSafeDestination('/p', '/etc/passwd')).toBe(false);
  });

  it('refuses a path outside the asset roots', () => {
    expect(isSafeDestination('/p', 'Library/whatever')).toBe(false);
    expect(isSafeDestination('/p', 'ProjectSettings/ProjectVersion.txt')).toBe(false);
    expect(isSafeDestination('/p', '')).toBe(false);
  });

  it('skips an unsafe entry and reports it rather than importing nothing', () => {
    const pkg = packageFile(
      ...asset('h1', 'Assets/../escape.txt', 'BAD'),
      ...asset('h2', 'Assets/Car/Good.mat', 'GOOD'),
    );
    const root = project();

    const result = importUnityPackage(pkg, root);

    expect(result.imported.map((a) => a.path)).toEqual(['Assets/Car/Good.mat']);
    expect(result.skipped[0]).toContain('escape.txt');
  });
});
