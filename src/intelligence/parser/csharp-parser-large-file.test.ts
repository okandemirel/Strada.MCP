/**
 * tree-sitter's Node binding rejects a source string above 32KB.
 *
 * Measured 2026-08-20 on the delivered project: every C# file up to 32515
 * characters parsed, every file from 33159 up threw a bare "Invalid argument",
 * and eleven of 380 files were over the line. The error named neither the file
 * nor the reason, and one unparsable file failed the entire symbol search — so
 * an agent searching for a class it had just written got "Invalid argument"
 * and nothing else, three times.
 */

import { describe, it, expect } from 'vitest';
import { CSharpParser } from './csharp-parser.js';

function sourceOfAtLeast(chars: number): string {
  const unit = 'public class Filler { public int Value; }\n';
  let out = 'namespace Big {\n';
  while (out.length < chars) out += unit;
  return out + '}\n';
}

describe('parsing a file past the binding limit', () => {
  it('parses a source well above 32KB', () => {
    const big = sourceOfAtLeast(40_000);

    expect(big.length).toBeGreaterThan(32_768);
    expect(() => new CSharpParser().parse(big)).not.toThrow();
  });

  it('finds the same declarations it would in a small file', () => {
    const small = new CSharpParser().parse('namespace N { public class Solo { } }');
    const big = new CSharpParser().parse(sourceOfAtLeast(40_000));

    expect(small.length).toBeGreaterThan(0);
    expect(big.length, 'a large file parsed to nothing').toBeGreaterThan(0);
  });

  it('still handles an ordinary small file', () => {
    const nodes = new CSharpParser().parse('public class Tiny { }');

    expect(nodes.length).toBeGreaterThan(0);
  });

  it('still returns nothing for empty source', () => {
    expect(new CSharpParser().parse('   ')).toEqual([]);
  });
});
