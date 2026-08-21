/**
 * A compile error is reported at every use, not once at its cause.
 *
 * Measured 2026-08-20: a run sat at 109 compile issues while the verification
 * tool handed the agent `entries.slice(0, 20)` — the first twenty lines in log
 * order. One missing interface produces an error in every file that references
 * it, so those twenty slots can carry a single root cause twenty times over,
 * and the agent fixes a scattered subset while writing code that adds more.
 */

import { describe, it, expect } from 'vitest';
import { distinctCompileEntries, errorsFirst } from './local-diagnostics.js';

function entry(message: string): { message: string; type: string } {
  return { message, type: 'Error' };
}

describe('distinct compile causes', () => {
  it('keeps one entry per fault however many places report it', () => {
    const entries = [
      entry("Assets/A.cs(10,5): error CS0246: The type or namespace name 'IBoardService' could not be found"),
      entry("Assets/B.cs(22,9): error CS0246: The type or namespace name 'IBoardService' could not be found"),
      entry("Assets/C.cs(3,1): error CS0246: The type or namespace name 'IBoardService' could not be found"),
    ];

    expect(distinctCompileEntries(entries)).toHaveLength(1);
  });

  it('keeps genuinely different faults apart', () => {
    const entries = [
      entry("Assets/A.cs(10,5): error CS0246: The type or namespace name 'IBoardService' could not be found"),
      entry("Assets/A.cs(11,5): error CS1061: 'Board' does not contain a definition for 'Tick'"),
    ];

    expect(distinctCompileEntries(entries)).toHaveLength(2);
  });

  it('treats the same fault at another line as the same fault', () => {
    const entries = [
      entry("Assets/A.cs(10,5): error CS0103: The name 'foo' does not exist"),
      entry("Assets/A.cs(99,7): error CS0103: The name 'foo' does not exist"),
    ];

    expect(distinctCompileEntries(entries)).toHaveLength(1);
  });

  it('drops entries with nothing to say', () => {
    expect(distinctCompileEntries([entry(''), { type: 'Error' }])).toEqual([]);
  });

  it('preserves the order faults first appeared', () => {
    const entries = [
      entry("Assets/A.cs(1,1): error CS0001: first"),
      entry("Assets/B.cs(2,2): error CS0002: second"),
      entry("Assets/C.cs(3,3): error CS0001: first"),
    ];

    expect(distinctCompileEntries(entries).map((e) => e.message)).toEqual([
      "Assets/A.cs(1,1): error CS0001: first",
      "Assets/B.cs(2,2): error CS0002: second",
    ]);
  });
});

describe('what a failing compile hands back first', () => {
  // Measured 2026-08-21: a build failing with 7 errors returned 20 entries
  // whose first was {"type":"log","message":"Mono: successfully reloaded
  // assembly"}. The agent could see that errors existed and was handed the
  // reload chatter as evidence; it spent twenty minutes trying to get the real
  // list out of Unity by other means.
  const mixed = [
    { type: 'log', message: 'Mono: successfully reloaded assembly' },
    { type: 'warning', message: "Assets/A.cs(1,1): warning CS0414: 'x' is assigned but never used" },
    { type: 'error', message: "Assets/B.cs(2,2): error CS0246: type 'IFoo' could not be found" },
    { type: 'log', message: 'Refresh completed' },
    { type: 'error', message: "Assets/C.cs(3,3): error CS0103: name 'bar' does not exist" },
  ];

  it('puts errors before anything else', () => {
    const ordered = errorsFirst(mixed);

    expect(ordered[0]!.type).toBe('error');
    expect(ordered[1]!.type).toBe('error');
  });

  it('puts warnings ahead of plain logs', () => {
    const ordered = errorsFirst(mixed);

    expect(ordered[2]!.type).toBe('warning');
  });

  it('keeps every entry — this ranks, it does not filter', () => {
    expect(errorsFirst(mixed)).toHaveLength(mixed.length);
  });

  it('preserves the original order within a rank', () => {
    const ordered = errorsFirst(mixed).filter((e) => e.type === 'error');

    expect(ordered[0]!.message).toContain('CS0246');
    expect(ordered[1]!.message).toContain('CS0103');
  });
});

describe('the payload actually uses the ranking', () => {
  // The function above is tested directly; without this, removing it from the
  // call site would break the thing that matters and fail nothing.
  it('ranks the entries it hands back', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/tools/unity/local-diagnostics.ts', 'utf8');
    const line = source.split('\n').find((l) => l.includes('entries: ') && l.includes('batchSnapshot.entries'));

    expect(line, 'the batch payload no longer builds entries from distinct causes').toBeDefined();
    expect(line, 'entries are handed back unranked — log noise can lead').toContain('errorsFirst');
  });
});
