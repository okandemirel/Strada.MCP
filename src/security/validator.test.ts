import { describe, it, expect } from 'vitest';
import { validateInput, validateCSharpIdentifier } from './validator.js';
import { z } from 'zod';

describe('Validator', () => {
  it('should validate input against schema', () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    const result = validateInput({ name: 'test', count: 5 }, schema);
    expect(result.name).toBe('test');
    expect(result.count).toBe(5);
  });

  it('should throw on invalid input', () => {
    const schema = z.object({ name: z.string() });
    expect(() => validateInput({ name: 123 }, schema)).toThrow();
  });

  it('should validate C# identifiers', () => {
    expect(validateCSharpIdentifier('MyClass')).toBe(true);
    expect(validateCSharpIdentifier('_private')).toBe(true);
  });

  it('should reject invalid C# identifiers', () => {
    expect(validateCSharpIdentifier('123invalid')).toBe(false);
    expect(validateCSharpIdentifier('has space')).toBe(false);
    expect(validateCSharpIdentifier('')).toBe(false);
  });

  it('should reject C# keywords', () => {
    expect(validateCSharpIdentifier('class')).toBe(false);
    expect(validateCSharpIdentifier('namespace')).toBe(false);
    expect(validateCSharpIdentifier('void')).toBe(false);
  });

  it('should allow identifiers similar to keywords', () => {
    expect(validateCSharpIdentifier('className')).toBe(true);
    expect(validateCSharpIdentifier('_class')).toBe(true);
  });
});
