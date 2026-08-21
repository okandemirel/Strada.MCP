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

  it('names the cannot-find errors too', () => {
    // Measured 2026-08-21: the description named only the "already defined"
    // case. The run in front of it had CS0246 — a type it could not FIND,
    // needing exactly this tool to locate the namespace to import — and the
    // agent never reached for it once.
    expect(description).toMatch(/CS0246/);
    expect(description).toMatch(/CS0103/);
  });

  it('says why both errors are the same question', () => {
    expect(description).toMatch(/where a name lives/i);
  });

  it('says searching by name beats guessing a path', () => {
    expect(description).toMatch(/beats guessing a path/i);
  });

  it('still says what it searches', () => {
    expect(description).toMatch(/interfaces/i);
    expect(description).toMatch(/methods/i);
  });
});
