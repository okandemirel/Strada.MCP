import { describe, it, expect } from 'vitest';
import { buildPlaymodeArgs } from './playmode-verify.js';

const base = {
  projectPath: '/p',
  resultsPath: '/r/results.xml',
  logPath: '/r/run.log',
};

describe('the play-mode command line', () => {
  it('never passes -quit', () => {
    // The rule the replaced fixture broke. The test runner owns
    // EditorApplication.Exit and returns a code that reflects the results;
    // -quit overrides it with 0 whatever the tests did, and can cut the run off
    // before the results XML is written.
    expect(buildPlaymodeArgs(base)).not.toContain('-quit');
    expect(buildPlaymodeArgs({ ...base, capture: true })).not.toContain('-quit');
  });

  it('stays headless by default', () => {
    expect(buildPlaymodeArgs(base)).toContain('-nographics');
  });

  it('drops -nographics to record, because that is what would be recorded into', () => {
    const args = buildPlaymodeArgs({ ...base, capture: true });

    expect(args).not.toContain('-nographics');
    // Still batch: no window, no Editor, just a graphics device.
    expect(args).toContain('-batchmode');
  });

  it('asks for PlayMode, not EditMode', () => {
    const args = buildPlaymodeArgs(base);
    expect(args[args.indexOf('-testPlatform') + 1]).toBe('PlayMode');
  });

  it('passes a filter through when given one', () => {
    const args = buildPlaymodeArgs({ ...base, testFilter: '  Board.Tests  ' });
    expect(args[args.indexOf('-testFilter') + 1]).toBe('Board.Tests');
  });

  it('omits an empty filter rather than matching nothing', () => {
    // A blank -testFilter selects no tests, and a run of nothing reports as a
    // pass under any check that only counts failures.
    expect(buildPlaymodeArgs({ ...base, testFilter: '   ' })).not.toContain('-testFilter');
    expect(buildPlaymodeArgs({ ...base, categories: '' })).not.toContain('-testCategory');
  });
});
