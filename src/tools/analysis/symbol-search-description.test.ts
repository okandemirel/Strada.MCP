/**
 * A tool description has to name the occasion, not just the mechanism.
 *
 * Measured 2026-08-20. The agent needed to know whether IInputService already
 * existed. It guessed a path, could not read the file, and created a second
 * declaration of a type that was already there — four compile errors from one
 * duplicate. It then spent three hours failing to resolve them and stopped to
 * ask the user.
 *
 * csharp_symbol_search answers that question directly and was called zero
 * times in that run. Its description said what it parses; nothing said when
 * to reach for it, and "before you write a type" and "when the compiler says
 * it is already defined" are exactly the two moments that were missed.
 */

import { describe, it, expect } from 'vitest';
import { CSharpSymbolSearchTool } from './csharp-symbol-tools.js';

describe('when the agent is told to search for a symbol', () => {
  const description = new CSharpSymbolSearchTool().description;

  it('names checking before writing a new type', () => {
    expect(description).toMatch(/before writing a new type/i);
  });

  it('names the already-defined compile errors by code', () => {
    expect(description).toMatch(/CS0101/);
    expect(description).toMatch(/CS0111/);
  });

  it('says searching by name beats guessing a path', () => {
    expect(description).toMatch(/beats guessing a path/i);
  });

  it('still says what it searches', () => {
    expect(description).toMatch(/interfaces/i);
    expect(description).toMatch(/methods/i);
  });
});
