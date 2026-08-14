/**
 * A broken assembly definition must reach the agent as a compile diagnostic.
 *
 * Unity reports a malformed .asmdef as
 *   JSON parse error: Invalid value. (Assets/…/X.Tests.asmdef)
 *   Scripts have compiler errors.
 *
 * The first line names the exact file. The compile-entry filter dropped it: no
 * CS number, none of the keywords it looked for, and a path ending in .asmdef
 * rather than .cs. So the verdict came back "compile failed" with nothing in it.
 *
 * Measured on a live run with four malformed .asmdef files: the agent called
 * unity_verify_change three times, opened all four files, and repaired none. It
 * had been told the build was broken and not what had broken it.
 *
 * The Unity output quoted here was captured from a real headless batch run
 * (6000.3.22f1) against a project containing one deliberately corrupted asmdef.
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
let unity: string;

/** Unity's real output for a corrupted .asmdef, verbatim. */
const UNITY_OUTPUT = [
  'LogAssemblyErrors (0ms)',
  'JSON parse error: Invalid value. (Assets/Modules/PixelFlow/Tests/Editor/PixelFlow.Domain.Editor.Tests.asmdef)',
  'JSON parse error: Invalid value. (Assets/Modules/PixelFlow/Tests/Editor/PixelFlow.Core.Editor.Tests.asmdef)',
  'Scripts have compiler errors.',
].join('\n');

beforeEach(() => {
  const root = mkdtempSync(join(os.tmpdir(), 'asmdef-diag-'));
  projectPath = join(root, 'PixelFlow');
  mkdirSync(join(projectPath, 'ProjectSettings'), { recursive: true });
  unity = join(projectPath, 'FakeUnity');
  writeFileSync(unity, '#!/bin/sh\n');
  process.env['UNITY_EDITOR_PATH'] = unity;
  process.env['UNITY_EDITOR_LOG_PATH'] = join(root, 'no-such-editor.log');
  execFileMock.mockReset();
  execFileMock.mockImplementation((file: string, _a: string[], _o: unknown, cb: Function) => {
    if (file === unity) {
      cb(Object.assign(new Error('exit 1'), { code: 1, stdout: UNITY_OUTPUT, stderr: '' }));
      return;
    }
    cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });
});

afterEach(() => {
  delete process.env['UNITY_EDITOR_PATH'];
  delete process.env['UNITY_EDITOR_LOG_PATH'];
  rmSync(projectPath, { recursive: true, force: true });
});

describe('malformed assembly definitions', () => {
  it('reports the compile as failed', async () => {
    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.source).toBe('static_unity_batch');
    expect(status.compile.lastSucceeded).toBe(false);
  });

  it('names the files that need fixing', async () => {
    // The whole point: "compile failed" is not actionable, a path is.
    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    const entries = JSON.stringify(status.diagnostics?.['entries'] ?? []);
    expect(entries).toContain('PixelFlow.Domain.Editor.Tests.asmdef');
    expect(entries).toContain('PixelFlow.Core.Editor.Tests.asmdef');
  });

  it('counts them as errors, not as noise', async () => {
    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.compile.compileIssueCount).toBeGreaterThan(0);
    expect(Number(status.diagnostics?.['errorCount'])).toBeGreaterThan(0);
  });

  it("treats a folder with several assembly definitions as an error", async () => {
    // Unity states this one without the word "error", so it was classified as a
    // log line: a project that cannot build reported zero errors. Measured
    // verbatim from a headless run after five per-layer test assemblies were
    // written into one Tests/Editor folder.
    execFileMock.mockImplementation((file: string, _a: string[], _o: unknown, cb: Function) => {
      if (file === unity) {
        cb(
          Object.assign(new Error("exit 1"), {
            code: 1,
            stdout: [
              "Folder 'Assets/Modules/PixelFlow/Tests/Editor/' contains multiple assembly definition files (Assets/Modules/PixelFlow/Tests/Editor/PixelFlow.Core.Editor.Tests.asmdef)",
              "Scripts have compiler errors.",
            ].join("\n"),
            stderr: "",
          }),
        );
        return;
      }
      cb(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const status = await getStaticCompileStatus({ projectPath, allowHeadlessCompile: true });

    expect(status.compile.lastSucceeded).toBe(false);
    expect(Number(status.diagnostics?.["errorCount"])).toBeGreaterThan(0);
    // And it must name the folder, or the agent cannot act on it.
    expect(JSON.stringify(status.diagnostics?.["entries"] ?? [])).toContain("Tests/Editor/");
  });
});
