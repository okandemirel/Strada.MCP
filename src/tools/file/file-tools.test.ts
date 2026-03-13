import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { FileEditTool } from './file-edit.js';
import { FileDeleteTool } from './file-delete.js';
import { FileRenameTool } from './file-rename.js';
import { ListDirectoryTool } from './list-directory.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('File Tools', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
      allowedPaths: [],
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('FileReadTool', () => {
    it('should read file contents with line numbers', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.cs'), 'line1\nline2\nline3');
      const tool = new FileReadTool();
      const result = await tool.execute({ path: 'test.cs' }, ctx);
      expect(result.content).toContain('1\tline1');
      expect(result.content).toContain('2\tline2');
      expect(result.isError).toBeFalsy();
    });

    it('should support offset and limit', async () => {
      await fs.writeFile(path.join(tmpDir, 'lines.txt'), 'a\nb\nc\nd\ne');
      const tool = new FileReadTool();
      const result = await tool.execute({ path: 'lines.txt', offset: 1, limit: 2 }, ctx);
      expect(result.content).toContain('b');
      expect(result.content).toContain('c');
      expect(result.content).not.toContain('1\ta');
    });

    it('should reject path traversal', async () => {
      const tool = new FileReadTool();
      const result = await tool.execute({ path: '../../etc/passwd' }, ctx);
      expect(result.isError).toBe(true);
    });
  });

  describe('FileWriteTool', () => {
    it('should create file with content', async () => {
      const tool = new FileWriteTool();
      const result = await tool.execute(
        { path: 'Assets/new.cs', content: 'using System;' },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      const written = await fs.readFile(path.join(tmpDir, 'Assets/new.cs'), 'utf-8');
      expect(written).toBe('using System;');
    });

    it('should reject in read-only mode', async () => {
      const tool = new FileWriteTool();
      const result = await tool.execute(
        { path: 'test.cs', content: 'x' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });
  });

  describe('FileEditTool', () => {
    it('should replace text in file', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.cs'), 'Hello World');
      const tool = new FileEditTool();
      const result = await tool.execute(
        { path: 'test.cs', old_string: 'World', new_string: 'Strada' },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      const content = await fs.readFile(path.join(tmpDir, 'test.cs'), 'utf-8');
      expect(content).toBe('Hello Strada');
    });

    it('should return error when string not found', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.cs'), 'Hello World');
      const tool = new FileEditTool();
      const result = await tool.execute(
        { path: 'test.cs', old_string: 'NotFound', new_string: 'X' },
        ctx,
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('FileDeleteTool', () => {
    it('should delete file', async () => {
      await fs.writeFile(path.join(tmpDir, 'delete-me.cs'), 'temp');
      const tool = new FileDeleteTool();
      const result = await tool.execute({ path: 'delete-me.cs' }, ctx);
      expect(result.isError).toBeFalsy();
      await expect(fs.access(path.join(tmpDir, 'delete-me.cs'))).rejects.toThrow();
    });

    it('should reject in read-only mode', async () => {
      await fs.writeFile(path.join(tmpDir, 'keep.cs'), 'keep');
      const tool = new FileDeleteTool();
      const result = await tool.execute({ path: 'keep.cs' }, { ...ctx, readOnly: true });
      expect(result.isError).toBe(true);
    });
  });

  describe('FileRenameTool', () => {
    it('should rename file', async () => {
      await fs.writeFile(path.join(tmpDir, 'old.cs'), 'content');
      const tool = new FileRenameTool();
      const result = await tool.execute({ source: 'old.cs', destination: 'new.cs' }, ctx);
      expect(result.isError).toBeFalsy();
      const content = await fs.readFile(path.join(tmpDir, 'new.cs'), 'utf-8');
      expect(content).toBe('content');
    });
  });

  describe('ListDirectoryTool', () => {
    it('should list directory contents', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.cs'), '');
      await fs.mkdir(path.join(tmpDir, 'subdir'));
      const tool = new ListDirectoryTool();
      const result = await tool.execute({ path: '.' }, ctx);
      expect(result.content).toContain('a.cs');
      expect(result.content).toContain('subdir');
      expect(result.content).toContain('[DIR]');
      expect(result.content).toContain('[FILE]');
    });
  });
});
