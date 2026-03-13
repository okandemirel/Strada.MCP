import { describe, it, expect } from 'vitest';
import { runProcess, sanitizeArg } from './process-runner.js';

describe('ProcessRunner', () => {
  describe('sanitizeArg', () => {
    it('should allow safe arguments', () => {
      expect(() => sanitizeArg('--flag')).not.toThrow();
      expect(() => sanitizeArg('file.cs')).not.toThrow();
      expect(() => sanitizeArg('path/to/file')).not.toThrow();
      expect(() => sanitizeArg('-n')).not.toThrow();
      expect(() => sanitizeArg('10')).not.toThrow();
      expect(() => sanitizeArg('main')).not.toThrow();
      expect(() => sanitizeArg('feat/new-feature')).not.toThrow();
      expect(() => sanitizeArg('commit message here')).not.toThrow();
    });

    it('should reject semicolons', () => {
      expect(() => sanitizeArg('; rm -rf /')).toThrow('shell metacharacter');
    });

    it('should reject command substitution', () => {
      expect(() => sanitizeArg('$(whoami)')).toThrow('shell metacharacter');
    });

    it('should reject backtick execution', () => {
      expect(() => sanitizeArg('`cat /etc/passwd`')).toThrow('shell metacharacter');
    });

    it('should reject pipe', () => {
      expect(() => sanitizeArg('file | evil')).toThrow('shell metacharacter');
    });

    it('should reject ampersand', () => {
      expect(() => sanitizeArg('cmd & bg')).toThrow('shell metacharacter');
    });

    it('should reject angle brackets', () => {
      expect(() => sanitizeArg('> /dev/null')).toThrow('shell metacharacter');
      expect(() => sanitizeArg('< input')).toThrow('shell metacharacter');
    });

    it('should reject curly braces', () => {
      expect(() => sanitizeArg('{a,b}')).toThrow('shell metacharacter');
    });

    it('should reject square brackets', () => {
      expect(() => sanitizeArg('[test]')).toThrow('shell metacharacter');
    });

    it('should reject exclamation mark', () => {
      expect(() => sanitizeArg('!important')).toThrow('shell metacharacter');
    });

    it('should reject backslash', () => {
      expect(() => sanitizeArg('path\\file')).toThrow('shell metacharacter');
    });
  });

  describe('runProcess', () => {
    it('should execute simple command', async () => {
      const result = await runProcess('echo', ['hello'], { timeout: 5000 });
      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr', async () => {
      const result = await runProcess('node', ['-e', 'console.error("err")'], {
        timeout: 5000,
      });
      expect(result.stderr.trim()).toBe('err');
    });

    it('should return non-zero exit code', async () => {
      const result = await runProcess('node', ['-e', 'process.exit(42)'], {
        timeout: 5000,
      });
      expect(result.exitCode).toBe(42);
    });

    it('should timeout long processes', async () => {
      await expect(
        runProcess('sleep', ['10'], { timeout: 100 }),
      ).rejects.toThrow('timed out');
    });

    it('should respect cwd option', async () => {
      const result = await runProcess('pwd', [], { timeout: 5000, cwd: '/tmp' });
      // /tmp may resolve to /private/tmp on macOS
      expect(result.stdout.trim()).toMatch(/\/?tmp$/);
    });

    it('should reject non-existent command', async () => {
      await expect(
        runProcess('nonexistentcommand12345', [], { timeout: 5000 }),
      ).rejects.toThrow();
    });

    it('should sanitize credentials in output', async () => {
      const result = await runProcess(
        'node',
        ['-e', 'console.log("token: sk-abc12345678901234567890")'],
        { timeout: 5000 },
      );
      expect(result.stdout).toContain('[REDACTED]');
      expect(result.stdout).not.toContain('sk-abc12345678901234567890');
    });
  });
});
