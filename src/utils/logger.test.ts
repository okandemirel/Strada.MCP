import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from './logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('should log at configured level', () => {
    const logger = createLogger('info');
    logger.info('test message');
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('should skip logs below configured level', () => {
    const logger = createLogger('warn');
    logger.info('should not appear');
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('should include component name', () => {
    const logger = createLogger('debug');
    const child = logger.child('MyComponent');
    child.debug('test');
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('MyComponent');
  });

  it('should format errors with stack trace', () => {
    const logger = createLogger('error');
    const err = new Error('test error');
    logger.error('failed', err);
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('test error');
  });
});
