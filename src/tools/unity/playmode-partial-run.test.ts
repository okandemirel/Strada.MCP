import { describe, expect, it } from 'vitest';

import { playmodeResultShape } from './playmode-verify.js';

const BUILD_ERRORS = [
  "Assets/Modules/BoardModule/Tests/Runtime/BoardServiceTests.cs(12,20): error CS0246: The type or namespace name 'BoardState' could not be found",
];

describe('a pass that hid an assembly', () => {
  it('refuses to call it a pass when the run logged compile errors', () => {
    const shape = playmodeResultShape(true, BUILD_ERRORS);

    expect(shape.isError).toBe(true);
    expect(shape.suffix).toContain('NOT A CLEAN PASS');
    expect(shape.suffix).toContain('never ran');
    // The evidence has to travel with the verdict or the caller cannot act.
    expect(shape.suffix).toContain('BoardServiceTests.cs');
  });

  it('leaves a genuinely clean pass alone', () => {
    expect(playmodeResultShape(true, [])).toEqual({ isError: false, suffix: '' });
  });

  it('does not stack its warning onto a run that already failed', () => {
    // A failing run already carries its own reason; two verdicts confuse it.
    const shape = playmodeResultShape(false, BUILD_ERRORS);

    expect(shape.isError).toBe(true);
    expect(shape.suffix).toBe('');
  });
});
