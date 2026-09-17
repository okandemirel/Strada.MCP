import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ARTIFACT_DIGEST_VERSION, artifactDigest, artifactManifest, evidenceRunId, projectRevision, renderReceipt, EVIDENCE_FENCE } from './producer-receipt.js';
import { writeArtifactManifest } from '../tools/unity/build-player.js';

describe('producer receipts', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'receipt-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('states the run, the kind and how the process ended — and nothing it did not measure', () => {
    const fenced = renderReceipt({
      runId: 'run-1',
      kind: 'player-build',
      medium: 'builder',
      projectPath: dir,
      target: 'Android',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    expect(fenced).toContain(`\`\`\`${EVIDENCE_FENCE}`);
    const json = JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(fenced)![1]!) as Record<string, unknown>;
    expect(json).toMatchObject({
      schemaVersion: 1,
      runId: 'run-1',
      kind: 'player-build',
      medium: 'builder',
      target: 'Android',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    // No repository here, CONFIRMED: the receipt says so with the empty
    // string, which is the answer the coordinator binds for such a tree
    // (Codex 2026-09-13 AI#6). A revision it could not read stays absent.
    expect(json['revision']).toBe('');
    expect(json['artifactSha256']).toBeUndefined();
  });

  it('tells two artifacts of the SAME SIZE apart (Codex 2026-09-13 AH#8)', () => {
    // The digest hashed paths and sizes, so two different 26 648-byte files
    // were the same artifact as far as a ticket was concerned.
    const make = (name: string, fill: number): string => {
      const app = join(dir, name, 'Contents', 'MacOS');
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, 'Game'), Buffer.alloc(26_648, fill));
      return join(dir, name);
    };
    expect(artifactDigest(make('A.app', 1))).not.toBe(artifactDigest(make('B.app', 2)));
  });

  it('digests a bundle DIRECTORY as one artifact, and says nothing about one that is not there', () => {
    const app = join(dir, 'Game.app');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), Buffer.alloc(1024, 7));
    const first = artifactDigest(app);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(artifactDigest(app)).toBe(first);
    // A changed artifact is a different artifact.
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), Buffer.alloc(2048, 7));
    expect(artifactDigest(app)).not.toBe(first);
    expect(artifactDigest(join(dir, 'Nothing.app'))).toBeUndefined();
    expect(artifactDigest(undefined)).toBeUndefined();
  });

  it('takes a run id only when the caller gave one', () => {
    expect(evidenceRunId({ evidenceRunId: ' run-7 ' })).toBe('run-7');
    expect(evidenceRunId({ evidenceRunId: '' })).toBeUndefined();
    expect(evidenceRunId({ evidenceRunId: 42 })).toBeUndefined();
    expect(evidenceRunId({})).toBeUndefined();
  });
});

/**
 * THREE ANSWERS, NOT TWO (Codex 2026-09-13 AI#6).
 *
 * A correct Unity project outside any repository produced a receipt with no
 * revision at all, while the coordinator bound the empty string: the two could
 * never agree, so no run on such a project could be admitted. An unborn or
 * broken repository is a different thing again — unknown is not "no
 * repository".
 */
describe('projectRevision', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'revision-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

  it('says "" for a project it confirmed has no repository', () => {
    expect(projectRevision(dir)).toBe('');
    // …and the receipt then carries that answer, so both sides can agree.
    const fenced = renderReceipt({
      runId: 'r', kind: 'compile', medium: 'compiler', projectPath: dir,
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    expect(JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(fenced)![1]!)['revision']).toBe('');
  });

  it('says nothing for a repository it cannot read a revision from', () => {
    git('init', '-q');
    // An unborn repository: inside a work tree, no HEAD to read.
    expect(projectRevision(dir)).toBeUndefined();
  });

  it('names the revision when there is one', () => {
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', '-A');
    git('commit', '-qm', 'one');
    expect(projectRevision(dir)).toBe(git('rev-parse', 'HEAD').trim());
  });
});

/**
 * THE GAME BESIDE THE EXECUTABLE (Codex 2026-09-13 AI#9).
 *
 * A Windows or Linux player is an executable plus its `<Name>_Data` folder;
 * hashing only the named file left every asset and managed assembly out of the
 * artifact's identity. Strada.Brain computes the same digest for its ticket,
 * so the two must move together.
 */
describe('artifactDigest over a player layout', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'layout-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const layout = (target: string, level: string): string => {
    const build = join(dir, target);
    mkdirSync(join(build, 'Game_Data'), { recursive: true });
    writeFileSync(join(build, 'Game.x86_64'), 'the executable');
    writeFileSync(join(build, 'Game_Data', 'level0'), level);
    return join(build, 'Game.x86_64');
  };

  it('moves when the data folder changes, with the executable untouched', () => {
    const exe = layout('linux', 'level one');
    const before = artifactDigest(exe);
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(dir, 'linux', 'Game_Data', 'level0'), 'level one, edited');
    expect(artifactDigest(exe)).not.toBe(before);
  });

  it('adopts only a layout it can recognise, and names which artifact it is', () => {
    const loose = join(dir, 'loose');
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(loose, 'tool'), 'the executable');
    const before = artifactDigest(join(loose, 'tool'));
    writeFileSync(join(loose, 'notes.txt'), 'unrelated');
    expect(artifactDigest(join(loose, 'tool'))).toBe(before);
    expect(before).not.toBe(artifactDigest(layout('linux2', 'level one')));
  });

  it('names its scheme, so a digest written under an older one cannot pass as this', () => {
    expect(ARTIFACT_DIGEST_VERSION).toBe('strada-artifact-v3-layout');
  });
});

/**
 * THE FILES A BUILD SAID IT SHIPPED (Codex 2026-09-13 AJ#4).
 *
 * Hashing the whole player layout pulls in whatever is written beside the
 * executable afterwards — the log the game writes on its first run — so an
 * artifact nobody touched hashed differently before and after it ran, which a
 * gate would call ARTIFACT_MISMATCH.
 */
describe('artifactDigest over a build manifest', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'manifest-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const layout = (): string => {
    const build = join(dir, 'linux');
    mkdirSync(join(build, 'Game_Data'), { recursive: true });
    writeFileSync(join(build, 'Game.x86_64'), 'the executable');
    writeFileSync(join(build, 'Game_Data', 'level0'), 'level one');
    return join(build, 'Game.x86_64');
  };

  it('ignores what is written beside the artifact after the build', () => {
    const exe = layout();
    expect(writeArtifactManifest(exe)).toEqual(['Game.x86_64', 'Game_Data/level0']);
    const built = artifactDigest(exe);
    expect(built).toMatch(/^[0-9a-f]{64}$/);
    // The player writes its own log next to itself; the GAME is unchanged.
    writeFileSync(join(dir, 'linux', 'player.log'), 'started\n');
    expect(artifactDigest(exe)).toBe(built);
    // …and a file the build DID ship still moves it.
    writeFileSync(join(dir, 'linux', 'Game_Data', 'level0'), 'level one, edited');
    expect(artifactDigest(exe)).not.toBe(built);
  });

  it('a manifest that drops a file is a different manifest', () => {
    const exe = layout();
    writeArtifactManifest(exe);
    const built = artifactDigest(exe);
    writeFileSync(`${exe}.strada-artifact.json`, JSON.stringify({ version: 'strada-manifest-v1', files: ['Game.x86_64'] }));
    expect(artifactDigest(exe)).not.toBe(built);
  });

  it('a manifest it cannot use is no manifest: the layout answers instead', () => {
    const exe = layout();
    for (const bad of [
      '{not json',
      JSON.stringify({ version: 'strada-manifest-v0', files: ['Game.x86_64'] }),
      JSON.stringify({ version: 'strada-manifest-v1', files: [] }),
      JSON.stringify({ version: 'strada-manifest-v1', files: ['../secrets.txt'] }),
      JSON.stringify({ version: 'strada-manifest-v1' }),
    ]) {
      writeFileSync(`${exe}.strada-artifact.json`, bad);
      expect(artifactManifest(exe)).toBeUndefined();
      // The digest still answers — from the layout, as it did before.
      expect(artifactDigest(exe)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  const HEX = /^[0-9a-f]{64}$/;
  const manifest = (exe: string, files: string[]): void => {
    writeFileSync(`${exe}.strada-artifact.json`, JSON.stringify({ version: 'strada-manifest-v1', files }));
  };

  it('a manifest that leaves the GAME out is not adopted: the executable\'s BYTES stay in the identity (D78)', () => {
    const exe = layout();
    writeFileSync(join(dir, 'linux', 'readme.txt'), 'read me');
    manifest(exe, ['readme.txt']);
    expect(artifactManifest(exe)).toBeUndefined();
    const before = artifactDigest(exe);
    expect(before).toMatch(HEX);
    writeFileSync(exe, 'THE EXECUTABLE'); // same size, same name: only the bytes differ
    expect(artifactDigest(exe)).not.toBe(before);
  });

  it('a manifest lists the WHOLE game beside a player, or it is not adopted (Codex D78 review #1)', () => {
    const exe = layout();
    writeFileSync(join(dir, 'linux', 'Game_Data', 'level1'), 'level two');
    writeFileSync(join(dir, 'linux', 'UnityPlayer.so'), 'the runtime');
    mkdirSync(join(dir, 'linux', 'MonoBleedingEdge', 'etc'), { recursive: true });
    writeFileSync(join(dir, 'linux', 'MonoBleedingEdge', 'etc', 'config'), 'mono');
    const whole = ['Game.x86_64', 'Game_Data/level0', 'Game_Data/level1', 'MonoBleedingEdge/etc/config', 'UnityPlayer.so'];
    for (const omitted of whole) {
      manifest(exe, whole.filter((f) => f !== omitted));
      expect(artifactManifest(exe), `without ${omitted}`).toBeUndefined();
    }
    // The producer's own manifest is the whole game (guard).
    expect(writeArtifactManifest(exe)).toEqual(whole);
    expect(artifactManifest(exe)?.files).toEqual(whole);
    const adopted = artifactDigest(exe);
    expect(adopted).toMatch(HEX);
    writeFileSync(join(dir, 'linux', 'player.log'), 'started\n');
    expect(artifactDigest(exe)).toBe(adopted);
    writeFileSync(join(dir, 'linux', 'Game_Data', 'level1'), 'LEVEL TWO');
    const dataChanged = artifactDigest(exe);
    expect(dataChanged).not.toBe(adopted);
    writeFileSync(join(dir, 'linux', 'UnityPlayer.so'), 'THE RUNTIME');
    expect(artifactDigest(exe)).not.toBe(dataChanged);
    manifest(exe, whole.map((f) => f.replace(/\//g, '\\')));
    expect(artifactManifest(exe)?.files).toEqual(whole);
  });

  it('nothing outside the layout: a symlink to another build refuses the manifest', () => {
    const exe = layout();
    mkdirSync(join(dir, 'elsewhere'), { recursive: true });
    writeFileSync(join(dir, 'elsewhere', 'other.bin'), 'other build');
    symlinkSync(join(dir, 'elsewhere', 'other.bin'), join(dir, 'linux', 'escape.bin'));
    manifest(exe, ['Game.x86_64', 'Game_Data/level0', 'escape.bin']);
    expect(artifactManifest(exe)).toBeUndefined();
    expect(artifactDigest(exe)).toMatch(HEX);
  });

  it('a declared file the tree does not have means NO digest, not a walk of what is left (Codex D78 review #5)', () => {
    const exe = layout();
    manifest(exe, ['Game.x86_64', 'missing.bin']);
    expect(artifactDigest(exe)).toBeUndefined();
  });

  it('a bundle\'s manifest lists the bundle in full: a decoy beside the binary is not the binary (Codex D78 review #2)', () => {
    const app = join(dir, 'mac', 'Game.app');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    mkdirSync(join(app, 'Contents', 'Resources', 'Data'), { recursive: true });
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), 'mach-o');
    writeFileSync(join(app, 'Contents', 'MacOS', 'readme.txt'), 'decoy');
    writeFileSync(join(app, 'Contents', 'Info.plist'), '<plist/>');
    writeFileSync(join(app, 'Contents', 'Resources', 'Data', 'level0'), 'level one');
    const full = ['Game.app/Contents/Info.plist', 'Game.app/Contents/MacOS/Game', 'Game.app/Contents/MacOS/readme.txt', 'Game.app/Contents/Resources/Data/level0'];
    manifest(app, full.filter((f) => !f.endsWith('/Game')));
    expect(artifactManifest(app)).toBeUndefined();
    expect(writeArtifactManifest(app)).toEqual(full);
    expect(artifactManifest(app)?.files).toEqual(full);
    const adopted = artifactDigest(app);
    expect(adopted).toMatch(HEX);
    writeFileSync(join(dir, 'mac', 'Player.log'), 'ran');
    expect(artifactDigest(app)).toBe(adopted);
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), 'MACH-O');
    expect(artifactDigest(app)).not.toBe(adopted);
  });

  it('a WebGL player is index.html WITH its Build folder (Codex D78 review #3)', () => {
    const web = join(dir, 'web');
    mkdirSync(join(web, 'Build'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<html/>');
    writeFileSync(join(web, 'Build', 'game.wasm'), 'wasm bytes');
    const page = join(web, 'index.html');
    const walked = artifactDigest(page);
    expect(walked).toMatch(HEX);
    writeFileSync(join(web, 'Build', 'game.wasm'), 'WASM BYTES');
    expect(artifactDigest(page)).not.toBe(walked);
    manifest(page, ['index.html']);
    expect(artifactManifest(page)).toBeUndefined();
    expect(writeArtifactManifest(page)).toEqual(['Build/game.wasm', 'index.html']);
    expect(artifactManifest(page)?.files).toEqual(['Build/game.wasm', 'index.html']);
  });


  it('never lists itself', () => {
    const exe = layout();
    writeArtifactManifest(exe);
    expect(artifactManifest(exe)!.files.some((f) => f.endsWith('.strada-artifact.json'))).toBe(false);
    // …and a second call after the manifest exists lists the same files.
    expect(writeArtifactManifest(exe)).toEqual(['Game.x86_64', 'Game_Data/level0']);
  });
});
