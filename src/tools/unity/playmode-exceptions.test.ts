import { describe, expect, it } from 'vitest';

import { PlaymodeVerifyTool } from './playmode-verify.js';

function exceptionsIn(log: string): string[] {
  return (tool as unknown as { playModeExceptions(log: string): string[] }).playModeExceptions(log);
}
const tool = new PlaymodeVerifyTool();

describe('what counts as the game throwing', () => {
  it('ignores a test-framework stack frame whose method is named CaptureException', () => {
    // The measured line, verbatim: this was handed back as the whole evidence
    // for "the game threw while running".
    const log = [
      'UnityEngine.TestRunner.NUnitExtensions.Runner.UnityLogCheckDelegatingCommand:CaptureException (NUnit.Framework.Internal.TestResult,System.Action) (at ./Library/PackageCache/com.unity.test-framework@bd7f943e9647/UnityEngine.TestRunner/NUnitExtensions/Runner/UnityLogCheckDelegatingCommand.cs:72)',
    ].join('\n');

    expect(exceptionsIn(log)).toEqual([]);
  });

  it('keeps an exception that actually says what happened', () => {
    const log = [
      'Some unrelated line',
      'NullReferenceException: Object reference not set to an instance of an object',
      '  at YourGame.PixelFlow.GameFlow.GameFlowService.Tick () [0x00000]',
    ].join('\n');

    expect(exceptionsIn(log)).toEqual([
      'NullReferenceException: Object reference not set to an instance of an object',
    ]);
  });

  it('still ignores the exceptions a test deliberately expected', () => {
    const log = [
      'LogAssert.Expect InvalidOperationException: on purpose',
      'UnityEngine.TestTools InvalidOperationException: framework noise',
    ].join('\n');

    expect(exceptionsIn(log)).toEqual([]);
  });

  it('does not mistake a stack frame that mentions a real exception type', () => {
    const log = 'at System.Collections.Generic.Dictionary.ThrowKeyNotFoundException (at Dictionary.cs:12)';

    expect(exceptionsIn(log)).toEqual([]);
  });
});
