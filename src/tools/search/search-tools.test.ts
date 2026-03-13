import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GlobSearchTool } from './glob-search.js';
import { GrepSearchTool } from './grep-search.js';
import { CodeSearchTool } from './code-search.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Search Tools', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-search-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };

    // Create test file structure
    await fs.mkdir(path.join(tmpDir, 'Assets', 'Scripts'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'Assets', 'Prefabs'), { recursive: true });

    await fs.writeFile(
      path.join(tmpDir, 'Assets', 'Scripts', 'Player.cs'),
      [
        'using UnityEngine;',
        '',
        'public class Player : MonoBehaviour',
        '{',
        '    public float speed = 5f;',
        '    public int health = 100;',
        '',
        '    void Update()',
        '    {',
        '        transform.Translate(Vector3.forward * speed * Time.deltaTime);',
        '    }',
        '}',
      ].join('\n'),
    );

    await fs.writeFile(
      path.join(tmpDir, 'Assets', 'Scripts', 'Enemy.cs'),
      [
        'using UnityEngine;',
        '',
        'public class Enemy : MonoBehaviour',
        '{',
        '    public int health = 50;',
        '    public float attackRange = 2f;',
        '}',
      ].join('\n'),
    );

    await fs.writeFile(
      path.join(tmpDir, 'Assets', 'Prefabs', 'Player.prefab'),
      'prefab content',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('GlobSearchTool', () => {
    it('should find files matching pattern', async () => {
      const tool = new GlobSearchTool();
      const result = await tool.execute({ pattern: '**/*.cs' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player.cs');
      expect(result.content).toContain('Enemy.cs');
      expect(result.content).toContain('2 file(s)');
    });

    it('should find prefab files', async () => {
      const tool = new GlobSearchTool();
      const result = await tool.execute({ pattern: '**/*.prefab' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player.prefab');
    });

    it('should support path parameter', async () => {
      const tool = new GlobSearchTool();
      const result = await tool.execute(
        { pattern: '*.cs', path: 'Assets/Scripts' },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player.cs');
    });

    it('should return message when no matches', async () => {
      const tool = new GlobSearchTool();
      const result = await tool.execute({ pattern: '**/*.java' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('No files matched');
    });

    it('should reject path traversal in path param', async () => {
      const tool = new GlobSearchTool();
      const result = await tool.execute(
        { pattern: '*', path: '../../../etc' },
        ctx,
      );
      expect(result.isError).toBe(true);
    });

    it('should have correct metadata', () => {
      const tool = new GlobSearchTool();
      expect(tool.name).toBe('glob_search');
      expect(tool.metadata.category).toBe('search');
      expect(tool.metadata.readOnly).toBe(true);
      expect(tool.metadata.requiresBridge).toBe(false);
    });
  });

  describe('GrepSearchTool', () => {
    it('should find content matches', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute({ pattern: 'health' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player.cs');
      expect(result.content).toContain('Enemy.cs');
    });

    it('should support regex patterns', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute({ pattern: 'public\\s+class\\s+\\w+' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player');
      expect(result.content).toContain('Enemy');
    });

    it('should support include filter', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute(
        { pattern: 'health', include: '**/Player.cs' },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Player.cs');
      expect(result.content).not.toContain('Enemy.cs');
    });

    it('should support context lines', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute(
        { pattern: 'void Update', contextLines: 1 },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      // Should have context lines around the match
      expect(result.content).toContain('Update');
    });

    it('should limit results with maxResults', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute(
        { pattern: 'public', maxResults: 1 },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('1 match');
    });

    it('should return message when no matches', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute({ pattern: 'nonexistentpattern123' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('No matches found');
    });

    it('should reject invalid regex', async () => {
      const tool = new GrepSearchTool();
      const result = await tool.execute({ pattern: '[invalid' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid regex');
    });

    it('should have correct metadata', () => {
      const tool = new GrepSearchTool();
      expect(tool.name).toBe('grep_search');
      expect(tool.metadata.category).toBe('search');
      expect(tool.metadata.readOnly).toBe(true);
    });
  });

  describe('CodeSearchTool', () => {
    it('should return RAG not initialized message', async () => {
      const tool = new CodeSearchTool();
      const result = await tool.execute({ query: 'player movement' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('RAG not yet initialized');
    });

    it('should have correct metadata', () => {
      const tool = new CodeSearchTool();
      expect(tool.name).toBe('code_search');
      expect(tool.metadata.category).toBe('search');
      expect(tool.metadata.readOnly).toBe(true);
    });
  });
});
