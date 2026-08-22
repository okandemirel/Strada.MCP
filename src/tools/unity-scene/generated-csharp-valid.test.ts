import { describe, expect, it } from 'vitest';

import { buildBootSmokeTest } from './boot-smoke-test.js';

/**
 * What this generator emits has to compile.
 *
 * Measured 2026-08-22, run 46: unity_scene_build failed three times with
 * "StradaBootSmokeTest.cs(83,13): error CS1010: Newline in constant". Line 83
 * was a string literal I had written into the template as "...:\n", which the
 * template literal turned into a real newline in the emitted C# instead of the
 * two characters an escape needs. The tool compiles the project before it
 * builds a scene, so a broken generated *test* blocked the agent from
 * assembling the game at all.
 *
 * Second time this generator has broken a project's build. The checks below are
 * crude — they do not parse C# — but they catch the shapes that did it.
 */

const { source } = buildBootSmokeTest('Main');
const codeLines = source.split('\n').filter((l) => !l.trim().startsWith('//'));

describe('the generated C# is at least syntactically plausible', () => {
  it('closes every string literal on the line it opens', () => {
    // A raw newline inside a literal is CS1010, and it is what happened.
    const unbalanced = codeLines.filter((l) => ((l.match(/"/gu) ?? []).length) % 2 === 1);

    expect(unbalanced, `unbalanced quotes:\n${unbalanced.join('\n')}`).toEqual([]);
  });

  it('emits newline escapes as escapes, not as line breaks', () => {
    expect(source).toContain(String.raw`\n`);
  });

  it('balances braces and parentheses across the file', () => {
    const count = (ch: string) => (source.match(new RegExp(`\\${ch}`, 'gu')) ?? []).length;

    expect(count('{'), 'braces do not balance').toBe(count('}'));
    expect(count('('), 'parentheses do not balance').toBe(count(')'));
  });

  it('still contains the assertion the fix was about', () => {
    // A generator that emits nothing would pass every check above.
    expect(source).toContain('logged errors while booting');
    expect(source).toContain('Assert.IsEmpty');
  });
});
