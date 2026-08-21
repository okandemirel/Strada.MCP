import { describe, expect, it } from 'vitest';

import { resolveProjectPath } from './project-path.js';

const LEASE = '/var/folders/fd/T/strada-workspaces/task-85db6668';
const ORIGIN = '/Users/okan/Documents/MaxedOutEntertainment/PixelFlow-Agent';

describe('resolveProjectPath', () => {
  it('says so when the answer is about a tree the caller is not editing', () => {
    const resolved = resolveProjectPath(ORIGIN, LEASE);

    expect(resolved.projectPath).toBe(ORIGIN);
    expect(resolved.mismatchNote).toContain(ORIGIN);
    expect(resolved.mismatchNote).toContain(LEASE);
  });

  it('stays quiet when the caller asked about the tree it is editing', () => {
    expect(resolveProjectPath(LEASE, LEASE).mismatchNote).toBeUndefined();
  });

  it('treats a path inside the workspace as the same tree', () => {
    expect(resolveProjectPath(`${LEASE}/Assets`, LEASE).mismatchNote).toBeUndefined();
  });

  it('normalises before comparing, so a scenic route is still the same tree', () => {
    expect(resolveProjectPath(`${LEASE}/Assets/..`, LEASE).mismatchNote).toBeUndefined();
  });

  it('falls back to the context path when the caller named none', () => {
    expect(resolveProjectPath(undefined, LEASE)).toEqual({ projectPath: LEASE });
    expect(resolveProjectPath('   ', LEASE)).toEqual({ projectPath: LEASE });
  });

  it('has nothing to warn about when there is no context', () => {
    expect(resolveProjectPath(ORIGIN, undefined).mismatchNote).toBeUndefined();
    expect(resolveProjectPath(ORIGIN, '').projectPath).toBe(ORIGIN);
  });
});
