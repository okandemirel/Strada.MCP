/**
 * What the agent is told when no Unity editor is running.
 *
 * Three things were wrong at once, and together they let an agent believe its
 * code compiled when nothing had compiled it:
 *
 *  1. Unity keeps ONE Editor.log per install, overwritten by whichever project
 *     was opened last. It was read unconditionally. Measured on a Pixel Flow
 *     run: the log's header said `-projectpath /Users/okan/Documents/Soak
 *     Games/Enhanced Package Manager` — a different project entirely — and its
 *     contents were reported as Pixel Flow's compile state.
 *  2. When nothing could verify anything, the answer was `source:
 *     'static_editor_log'` with `compileIssueCount: 0` and `lastSucceeded:
 *     null`. The zero means "no data", but it reads as "no errors".
 *  3. The offline compile path (`dotnet build`) needs a .sln, which only Unity
 *     writes when a project is opened, so a project an agent just created could
 *     never be compiled offline at all.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: execFileMock };
});

const { getStaticCompileStatus } = await import('./local-diagnostics.js');

let projectPath: string;
let otherProject: string;
let editorLogPath: string;

/** An Editor.log whose header names `owner` as the opened project. */
function writeEditorLog(owner: string, body: string[] = []): void {
  writeFileSync(
    editorLogPath,
    [
      'Unity Editor version:    6000.5.7f1',
      '',
      'COMMAND LINE ARGUMENTS:',
      '/Applications/Unity/Hub/Editor/6000.5.7f1/Unity.app/Contents/MacOS/Unity',
      '-projectpath',
      owner,
      '-useHub',
      '',
      ...body,
    ].join('\n'),
  );
}

beforeEach(() => {
  const root = mkdtempSync(join(os.tmpdir(), 'unity-diag-'));
  projectPath = join(root, 'PixelFlow');
  otherProject = join(root, 'OtherGame');
  mkdirSync(join(projectPath, 'Assets'), { recursive: true });
  mkdirSync(join(projectPath, 'ProjectSettings'), { recursive: true });
  mkdirSync(otherProject, { recursive: true });
  editorLogPath = join(root, 'Editor.log');
  process.env['UNITY_EDITOR_LOG_PATH'] = editorLogPath;
  // No editor binary unless a test provides one.
  process.env['UNITY_EDITOR_PATH'] = join(root, 'no-such-unity');
  execFileMock.mockReset();
});

afterEach(() => {
  delete process.env['UNITY_EDITOR_LOG_PATH'];
  delete process.env['UNITY_EDITOR_PATH'];
  delete process.env['UNITY_HUB_EDITOR_DIR'];
});

describe('offline compile status', () => {
  it("refuses an Editor.log that belongs to another project", async () => {
    // The log is full of errors — from a project we were not asked about.
    writeEditorLog(otherProject, [
      "Assets/Other.cs(3,5): error CS0246: The type or namespace name 'Foo' could not be found",
    ]);

    const status = await getStaticCompileStatus({ projectPath });

    expect(status.source).not.toBe('static_editor_log');
    expect(status.verified).toBe(false);
    expect(status.compile.compileIssueCount).toBeNull();
  });

  it("uses the Editor.log when it does belong to this project", async () => {
    writeEditorLog(projectPath, [
      "Assets/Board.cs(7,9): error CS0103: The name 'Grid' does not exist in the current context",
    ]);

    const status = await getStaticCompileStatus({ projectPath });

    expect(status.source).toBe('static_editor_log');
    expect(status.compile.lastSucceeded).toBe(false);
  });

  it("says UNKNOWN rather than implying a clean compile", async () => {
    // Nothing available at all: no bridge, no solution, no usable log.
    rmSync(editorLogPath, { force: true });

    const status = await getStaticCompileStatus({ projectPath });

    expect(status.source).toBe('unavailable');
    expect(status.verified).toBe(false);
    // The heart of it: a caller must not be able to read this as "0 problems".
    expect(status.compile.compileIssueCount).toBeNull();
    expect(status.compile.lastSucceeded).toBeNull();
    expect(status.message).toMatch(/UNKNOWN/);
    expect(status.message).toMatch(/not treat this as a successful compile/i);
  });

  it("compiles with headless Unity when there is no .NET SDK", async () => {
    // The common case on a developer machine: `dotnet` is absent, so generating
    // a .sln buys nothing. Unity compiles every script before it will run
    // -executeMethod, so one batch invocation is a real compile signal.
    const unity = join(projectPath, 'FakeUnity');
    writeFileSync(unity, '#!/bin/sh\n');
    process.env['UNITY_EDITOR_PATH'] = unity;
    rmSync(editorLogPath, { force: true });

    execFileMock.mockImplementation((file: string, args: string[], _opts: unknown, cb: Function) => {
      if (file === unity) {
        expect(args).toContain('-batchmode');
        expect(args).toContain('-quit');
        expect(args).toContain('-nographics');
        cb(
          Object.assign(new Error('exit 1'), {
            code: 1,
            stdout:
              "Assets/Modules/PixelFlow/Domain/Board.cs(12,9): error CS0246: The type or namespace name 'Grid' could not be found\n",
            stderr: '',
          }),
        );
        return;
      }
      // No dotnet on this machine.
      cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.source).toBe('static_unity_batch');
    expect(status.verified).toBe(true);
    expect(status.compile.lastSucceeded).toBe(false);
    expect(status.compile.compileIssueCount).toBeGreaterThan(0);
  });

  it("reports unknown when headless Unity produces no diagnostics at all", async () => {
    // A licence failure or timeout yields an empty log. That is "unknown", and
    // reporting it as a clean compile is the exact bug this file exists for.
    const unity = join(projectPath, 'FakeUnity');
    writeFileSync(unity, '#!/bin/sh\n');
    process.env['UNITY_EDITOR_PATH'] = unity;
    rmSync(editorLogPath, { force: true });

    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(Object.assign(new Error('timeout'), { code: 1, stdout: '', stderr: '' }));
    });

    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.source).toBe('unavailable');
    expect(status.verified).toBe(false);
    expect(status.compile.compileIssueCount).toBeNull();
  });

  it("generates a missing solution with headless Unity, then builds it", async () => {
    // The whole point of the third fix: a project that has never been opened in
    // the editor can still be compiled.
    const unity = join(projectPath, 'FakeUnity');
    writeFileSync(unity, '#!/bin/sh\n');
    process.env['UNITY_EDITOR_PATH'] = unity;
    writeFileSync(
      join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'),
      'm_EditorVersion: 6000.5.7f1\n',
    );
    rmSync(editorLogPath, { force: true });

    execFileMock.mockImplementation((file: string, args: string[], _opts: unknown, cb: Function) => {
      if (file === unity) {
        // Unity writes the solution as its side effect.
        expect(args).toContain('-batchmode');
        expect(args).toContain('-quit');
        expect(args).toContain('-nographics');
        expect(args).toContain('UnityEditor.SyncVS.SyncSolution');
        writeFileSync(join(projectPath, 'PixelFlow.sln'), '');
        cb(null, { stdout: '', stderr: '' });
        return;
      }
      cb(null, { stdout: 'Build succeeded.\n', stderr: '' });
    });

    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(execFileMock.mock.calls.some((c) => c[0] === unity)).toBe(true);
    expect(status.source).toBe('static_dotnet_build');
    expect(status.compile.lastSucceeded).toBe(true);
  });

  it("uses an installed editor even when it is not the pinned version", async () => {
    // Forcing an exact version match means never verifying anything on a normal
    // machine: measured here, the project pinned 6000.0.30f1 while 6000.3.22f1
    // and 6000.5.7f1 were installed. Working with what the user has is the
    // point; the mismatch is reported, not used as a reason to refuse.
    const hub = join(projectPath, 'Hub');
    for (const version of ['6000.3.22f1', '6000.5.7f1']) {
      mkdirSync(join(hub, version, 'Unity.app/Contents/MacOS'), { recursive: true });
      writeFileSync(join(hub, version, 'Unity.app/Contents/MacOS/Unity'), '#!/bin/sh\n');
    }
    writeFileSync(
      join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'),
      'm_EditorVersion: 6000.0.30f1\n',
    );
    rmSync(editorLogPath, { force: true });
    delete process.env['UNITY_EDITOR_PATH'];
    process.env['UNITY_HUB_EDITOR_DIR'] = hub;

    execFileMock.mockImplementation((file: string, _args: string[], _o: unknown, cb: Function) => {
      if (String(file).includes('Unity')) {
        cb(Object.assign(new Error('exit 1'), {
          code: 1,
          stdout: "Assets/Board.cs(3,1): error CS1002: ; expected\n",
          stderr: '',
        }));
        return;
      }
      cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.source).toBe('static_unity_batch');
    expect(status.verified).toBe(true);
    // The closest editor that can open the project, not the pinned one…
    expect(status.diagnostics?.['editorVersion']).toBe('6000.3.22f1');
    expect(status.diagnostics?.['projectVersion']).toBe('6000.0.30f1');
    // …and the user is told, because a newer editor upgrades the project.
    expect(String(status.diagnostics?.['editorVersionMismatch'])).toMatch(/upgrades it in place/);
  });

  it("never launches Unity for a passive status poll", async () => {
    // A status query must stay cheap and side-effect free. Launching the editor
    // takes minutes, may need a licence, and upgrades the project in place when
    // the installed version is newer — none of which a poll should cause.
    const hub = join(projectPath, 'Hub');
    mkdirSync(join(hub, '6000.5.7f1/Unity.app/Contents/MacOS'), { recursive: true });
    writeFileSync(join(hub, '6000.5.7f1/Unity.app/Contents/MacOS/Unity'), '#!/bin/sh\n');
    process.env['UNITY_HUB_EDITOR_DIR'] = hub;
    delete process.env['UNITY_EDITOR_PATH'];
    rmSync(editorLogPath, { force: true });
    // No dotnet either, so the only thing that COULD answer is a Unity launch.
    execFileMock.mockImplementation((_f: string, _a: string[], _o: unknown, cb: Function) => {
      cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    const status = await getStaticCompileStatus({ projectPath });

    expect(execFileMock.mock.calls.some((c) => String(c[0]).includes('Unity'))).toBe(false);
    expect(status.source).toBe('unavailable');
    // …and it says how to get a real answer instead of leaving a dead end.
    expect(status.message).toMatch(/headless Unity compile/i);
  });
});
