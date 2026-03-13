import { describe, it, expect } from 'vitest';
import { validatePath, isPathAllowed } from './path-guard.js';
import path from 'node:path';

describe('PathGuard', () => {
  const root = '/Users/test/project';

  it('should allow paths within project root', () => {
    expect(validatePath('/Users/test/project/Assets/script.cs', root)).toBe(
      '/Users/test/project/Assets/script.cs',
    );
  });

  it('should reject directory traversal', () => {
    expect(() => validatePath('/Users/test/project/../../../etc/passwd', root)).toThrow(
      'outside allowed directory',
    );
  });

  it('should reject null bytes', () => {
    expect(() => validatePath('/Users/test/project/file\0.cs', root)).toThrow('null byte');
  });

  it('should resolve relative paths against root', () => {
    const result = validatePath('Assets/script.cs', root);
    expect(result).toBe(path.join(root, 'Assets/script.cs'));
  });

  it('should reject paths with .. components', () => {
    expect(() => validatePath('Assets/../../etc/passwd', root)).toThrow(
      'outside allowed directory',
    );
  });

  it('should handle absolute paths outside root', () => {
    expect(() => validatePath('/etc/passwd', root)).toThrow('outside allowed directory');
  });

  it('should allow multiple allowed paths', () => {
    const allowed = ['/Users/test/project', '/Users/test/packages'];
    expect(isPathAllowed('/Users/test/packages/pkg/file.cs', allowed)).toBe(true);
    expect(isPathAllowed('/tmp/evil', allowed)).toBe(false);
  });
});
