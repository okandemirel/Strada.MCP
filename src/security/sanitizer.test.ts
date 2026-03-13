import { describe, it, expect } from 'vitest';
import { sanitizeOutput } from './sanitizer.js';

describe('Sanitizer', () => {
  it('should redact API keys (sk-*)', () => {
    expect(sanitizeOutput('key: sk-abc123def456ghijklmnopqrs')).toBe('key: [REDACTED]');
  });

  it('should redact Google API keys (AIza*)', () => {
    expect(sanitizeOutput('key: AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).toBe(
      'key: [REDACTED]',
    );
  });

  it('should redact Bearer tokens', () => {
    expect(sanitizeOutput('Authorization: Bearer eyJhbGciOiJIUz.token')).toBe(
      'Authorization: [REDACTED]',
    );
  });

  it('should redact GitHub tokens', () => {
    expect(
      sanitizeOutput('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn'),
    ).toBe('token: [REDACTED]');
  });

  it('should redact git credential URLs', () => {
    expect(sanitizeOutput('https://user:pass@github.com/repo')).toBe(
      'https://[REDACTED]@github.com/repo',
    );
  });

  it('should not modify clean text', () => {
    expect(sanitizeOutput('Hello world')).toBe('Hello world');
  });

  it('should handle multiple secrets in one string', () => {
    const input =
      'sk-abc123def456ghijklmnopqrs and AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('sk-abc');
    expect(result).not.toContain('AIzaSy');
  });
});
