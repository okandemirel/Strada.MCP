/**
 * An empty run names what it was empty of.
 *
 * Measured 2026-09-06 (campaign mcov1): "the project has no PlayMode tests, or
 * the filter matched nothing" — twice, against five PlayMode test files. The
 * disjunction sent the agent back to verify instead of to its own filter.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describeEmptyRun, findPlayModeTestAssemblies } from './playmode-empty-run.js';

const EMPTY = { result: 'Passed', total: 0, passed: 0, failed: 0, skipped: 0 };

let project: string;
beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'strada-empty-run-'));
  const asm = (rel: string, body: Record<string, unknown>) => {
    mkdirSync(join(project, 'Assets', rel), { recursive: true });
    writeFileSync(join(project, 'Assets', rel, `${body['name']}.asmdef`), JSON.stringify(body));
  };
  asm('Tests/PlayMode', {
    name: 'Strada.Generated.PlayModeTests',
    references: ['Strada.Core', 'UnityEngine.TestRunner', 'UnityEditor.TestRunner'],
    includePlatforms: [],
  });
  asm('Tests/Editor', {
    name: 'Game.EditorTests',
    references: ['UnityEngine.TestRunner'],
    includePlatforms: ['Editor'],
  });
  asm('Runtime', { name: 'PixelFlow.Runtime', references: ['Strada.Core'] });
  mkdirSync(join(project, 'Library'), { recursive: true });
  writeFileSync(join(project, 'Library', 'Stale.asmdef'), JSON.stringify({ name: 'Stale', references: ['UnityEngine.TestRunner'] }));
});
afterAll(() => rmSync(project, { recursive: true, force: true }));

describe('findPlayModeTestAssemblies', () => {
  it('lists test assemblies under Assets/ that are not Editor-only', () => {
    expect(findPlayModeTestAssemblies(project)).toEqual(['Strada.Generated.PlayModeTests']);
  });
  it('is empty for a project with no Assets/', () => {
    expect(findPlayModeTestAssemblies(join(project, 'nowhere'))).toEqual([]);
  });
});

describe('describeEmptyRun', () => {
  it('blames the filter when one was given, and names it', () => {
    const out = describeEmptyRun(EMPTY, 'Game.Modules.Board.Tests', undefined, ['Strada.Generated.PlayModeTests']);
    expect(out).toContain('filter "Game.Modules.Board.Tests" matched nothing');
    expect(out).toContain('Strada.Generated.PlayModeTests');
    expect(out).not.toContain('no PlayMode test');
  });

  it('names the assemblies Unity dropped when an unfiltered run found zero tests', () => {
    const out = describeEmptyRun(EMPTY, undefined, undefined, ['Strada.Generated.PlayModeTests']);
    expect(out).toContain('found ZERO PlayMode tests');
    expect(out).toContain('1 PlayMode test assembly under Assets/: Strada.Generated.PlayModeTests');
    expect(out).toContain('Unity loaded none of them');
    expect(out).not.toContain('matched nothing');
  });

  it('says the project has no test assembly only when the scan found none', () => {
    const out = describeEmptyRun(EMPTY, undefined, undefined, []);
    expect(out).toContain('no asmdef under Assets/ references UnityEngine.TestRunner');
    expect(out).not.toContain('Unity loaded none');
  });

  it('distinguishes all-skipped from none-found', () => {
    const out = describeEmptyRun({ ...EMPTY, total: 5, skipped: 5 }, undefined, undefined, ['A.Tests']);
    expect(out).toContain('found 5 tests and skipped all of them');
    expect(out).not.toContain('ZERO');
  });

  it('never claims a measurement it did not take', () => {
    expect(describeEmptyRun(EMPTY, undefined, undefined, undefined)).not.toContain('Measured');
  });
});
