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

    const status = await getStaticCompileStatus({ projectPath });

    expect(execFileMock.mock.calls.some((c) => c[0] === unity)).toBe(true);
    expect(status.source).toBe('static_dotnet_build');
    expect(status.compile.lastSucceeded).toBe(true);
  });

  it("does not open the project with a mismatched editor version", async () => {
    // Opening a Unity project with a newer editor upgrades it in place. A
    // diagnostic must never cause that, so with no resolvable editor it stops.
    rmSync(editorLogPath, { force: true });
    writeFileSync(
      join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'),
      'm_EditorVersion: 2019.4.0f1\n',
    );
    delete process.env['UNITY_EDITOR_PATH'];

    const status = await getStaticCompileStatus({ projectPath });

    expect(status.source).toBe('unavailable');
    expect(execFileMock.mock.calls.some((c) => String(c[0]).includes('Unity'))).toBe(false);
  });
});
