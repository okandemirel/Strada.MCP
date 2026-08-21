import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describeRunScope } from './playmode-verify.js';

/**
 * A test count means nothing without the filter that produced it.
 *
 * Measured 2026-08-21, run 37: the same project reported total=33, then
 * total=44, then total=33 again, then total=1 — and every verdict said only
 * "N of M tests failed". The counts moved because the agent was passing
 * different testFilters, but nothing in the verdict said so, so a filtered run
 * reads exactly like a suite that lost twenty-four tests. The codebase already
 * carries a note about mistaking one for the other.
 */

describe('a verdict that names its scope', () => {
  it('says which filter produced the count', () => {
    const scope = describeRunScope('YourGame.PixelFlow.PlayModeTests.WinLevel_ReachesWonState');

    expect(scope).toContain('WinLevel_ReachesWonState');
  });

  it('warns that a filtered run is not the suite', () => {
    // This is the whole point: 30 of 33 green under a filter says nothing about
    // the other assemblies.
    expect(describeRunScope('SomeFilter').toLowerCase()).toMatch(/subset|not the whole|filtered/u);
  });

  it('says so plainly when nothing was filtered', () => {
    expect(describeRunScope(undefined).toLowerCase()).toContain('unfiltered');
    expect(describeRunScope('   ').toLowerCase()).toContain('unfiltered');
  });

  it('rides along with the verdict the agent actually reads', () => {
    // The function is worthless if the rendered verdict does not use it.
    // Look at the verdict statement itself, not the file. The function being
    // *defined* in this module says nothing about whether the sentence the
    // agent reads uses it — a first attempt at this assertion matched the
    // definition and let the mutation through.
    const source = readFileSync('src/tools/unity/playmode-verify.ts', 'utf8');
    // Anchor on the code, not on prose — the first 'tests failed' in this file
    // is inside a comment, and slicing from there measured nothing.
    const at = source.indexOf('PlayMode verification FAILED: ${outcome.failed}');
    const statement = source.slice(source.lastIndexOf('lines.push(', at), source.indexOf(';', at));

    expect(statement, 'the failure verdict reports a count with no scope').toContain(
      'describeRunScope(',
    );
  });
});
