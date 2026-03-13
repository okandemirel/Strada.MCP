import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitStatusTool } from './git-status.js';
import { GitDiffTool } from './git-diff.js';
import { GitLogTool } from './git-log.js';
import { GitCommitTool } from './git-commit.js';
import { GitBranchTool } from './git-branch.js';
import { GitStashTool } from './git-stash.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runProcess } from '../../utils/process-runner.js';

describe('Git Tools', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  async function git(args: string[]): Promise<string> {
    const result = await runProcess('git', args, { timeout: 10000, cwd: tmpDir });
    return result.stdout.trim();
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-git-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };

    // Initialize a git repo with an initial commit
    await git(['init']);
    await git(['config', 'user.email', 'test@strada.dev']);
    await git(['config', 'user.name', 'Test']);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test');
    await git(['add', '.']);
    await git(['commit', '-m', 'initial commit']);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('GitStatusTool', () => {
    it('should show clean status', async () => {
      const tool = new GitStatusTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('clean');
    });

    it('should show modified files', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified');
      const tool = new GitStatusTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('README.md');
    });

    it('should show untracked files', async () => {
      await fs.writeFile(path.join(tmpDir, 'new-file.txt'), 'new');
      const tool = new GitStatusTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('new-file.txt');
    });

    it('should have correct metadata', () => {
      const tool = new GitStatusTool();
      expect(tool.name).toBe('git_status');
      expect(tool.metadata.category).toBe('git');
      expect(tool.metadata.readOnly).toBe(true);
    });
  });

  describe('GitDiffTool', () => {
    it('should show unstaged changes', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Changed');
      const tool = new GitDiffTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Changed');
    });

    it('should show staged changes', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Staged');
      await git(['add', 'README.md']);
      const tool = new GitDiffTool();
      const result = await tool.execute({ staged: true }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('Staged');
    });

    it('should diff a specific file', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# A');
      await fs.writeFile(path.join(tmpDir, 'other.txt'), 'B');
      const tool = new GitDiffTool();
      const result = await tool.execute({ file: 'README.md' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('README.md');
    });

    it('should return no differences when clean', async () => {
      const tool = new GitDiffTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('No differences');
    });

    it('should have correct metadata', () => {
      const tool = new GitDiffTool();
      expect(tool.name).toBe('git_diff');
      expect(tool.metadata.readOnly).toBe(true);
    });
  });

  describe('GitLogTool', () => {
    it('should show commit history', async () => {
      const tool = new GitLogTool();
      const result = await tool.execute({}, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('initial commit');
    });

    it('should limit commit count', async () => {
      // Create more commits
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
      await git(['add', '.']);
      await git(['commit', '-m', 'second commit']);

      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b');
      await git(['add', '.']);
      await git(['commit', '-m', 'third commit']);

      const tool = new GitLogTool();
      const result = await tool.execute({ count: 1 }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('third commit');
      expect(result.content).not.toContain('initial commit');
    });

    it('should support file history', async () => {
      await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'v1');
      await git(['add', '.']);
      await git(['commit', '-m', 'add tracked']);

      const tool = new GitLogTool();
      const result = await tool.execute({ file: 'tracked.txt' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('add tracked');
    });

    it('should have correct metadata', () => {
      const tool = new GitLogTool();
      expect(tool.name).toBe('git_log');
      expect(tool.metadata.readOnly).toBe(true);
    });
  });

  describe('GitCommitTool', () => {
    it('should stage and commit files', async () => {
      await fs.writeFile(path.join(tmpDir, 'new.txt'), 'content');
      const tool = new GitCommitTool();
      const result = await tool.execute(
        { message: 'add new file', files: ['new.txt'] },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('add new file');

      // Verify commit exists
      const log = await git(['log', '--oneline', '-1']);
      expect(log).toContain('add new file');
    });

    it('should commit currently staged files', async () => {
      await fs.writeFile(path.join(tmpDir, 'staged.txt'), 'staged');
      await git(['add', 'staged.txt']);
      const tool = new GitCommitTool();
      const result = await tool.execute({ message: 'commit staged' }, ctx);
      expect(result.isError).toBeFalsy();
    });

    it('should reject in read-only mode', async () => {
      const tool = new GitCommitTool();
      const result = await tool.execute(
        { message: 'test' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });

    it('should have correct metadata', () => {
      const tool = new GitCommitTool();
      expect(tool.name).toBe('git_commit');
      expect(tool.metadata.readOnly).toBe(false);
      expect(tool.metadata.dangerous).toBe(true);
    });
  });

  describe('GitBranchTool', () => {
    it('should list branches', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute({ action: 'list' }, ctx);
      expect(result.isError).toBeFalsy();
      // Should show the default branch
      expect(result.content).toBeTruthy();
    });

    it('should create a branch', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute(
        { action: 'create', name: 'feature-test' },
        ctx,
      );
      expect(result.isError).toBeFalsy();

      // Verify branch exists
      const branches = await git(['branch']);
      expect(branches).toContain('feature-test');
    });

    it('should switch branches', async () => {
      await git(['branch', 'dev']);
      const tool = new GitBranchTool();
      const result = await tool.execute(
        { action: 'switch', name: 'dev' },
        ctx,
      );
      expect(result.isError).toBeFalsy();

      // Verify switched
      const current = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
      expect(current).toBe('dev');
    });

    it('should delete a branch', async () => {
      await git(['branch', 'to-delete']);
      const tool = new GitBranchTool();
      const result = await tool.execute(
        { action: 'delete', name: 'to-delete' },
        ctx,
      );
      expect(result.isError).toBeFalsy();
    });

    it('should require name for create/delete/switch', async () => {
      const tool = new GitBranchTool();

      const createResult = await tool.execute({ action: 'create' }, ctx);
      expect(createResult.isError).toBe(true);

      const deleteResult = await tool.execute({ action: 'delete' }, ctx);
      expect(deleteResult.isError).toBe(true);

      const switchResult = await tool.execute({ action: 'switch' }, ctx);
      expect(switchResult.isError).toBe(true);
    });

    it('should reject write operations in read-only mode', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute(
        { action: 'create', name: 'nope' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });

    it('should allow list in read-only mode', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute(
        { action: 'list' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBeFalsy();
    });

    it('should have correct metadata', () => {
      const tool = new GitBranchTool();
      expect(tool.name).toBe('git_branch');
      expect(tool.metadata.category).toBe('git');
    });
  });

  describe('GitStashTool', () => {
    it('should stash changes', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Stash me');
      const tool = new GitStashTool();
      const result = await tool.execute({ action: 'push', message: 'wip' }, ctx);
      expect(result.isError).toBeFalsy();

      // Working tree should be clean after stash
      const statusResult = await git(['status', '--porcelain']);
      expect(statusResult).toBe('');
    });

    it('should list stashes', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Stash me');
      await git(['stash', 'push', '-m', 'test stash']);

      const tool = new GitStashTool();
      const result = await tool.execute({ action: 'list' }, ctx);
      expect(result.isError).toBeFalsy();
      expect(result.content).toContain('test stash');
    });

    it('should pop stash', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Stashed');
      await git(['stash', 'push', '-m', 'to pop']);

      const tool = new GitStashTool();
      const result = await tool.execute({ action: 'pop' }, ctx);
      expect(result.isError).toBeFalsy();

      // File should be restored
      const content = await fs.readFile(path.join(tmpDir, 'README.md'), 'utf-8');
      expect(content).toContain('Stashed');
    });

    it('should reject write operations in read-only mode', async () => {
      const tool = new GitStashTool();
      const result = await tool.execute(
        { action: 'push' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });

    it('should allow list in read-only mode', async () => {
      const tool = new GitStashTool();
      const result = await tool.execute(
        { action: 'list' },
        { ...ctx, readOnly: true },
      );
      expect(result.isError).toBeFalsy();
    });

    it('should have correct metadata', () => {
      const tool = new GitStashTool();
      expect(tool.name).toBe('git_stash');
      expect(tool.metadata.category).toBe('git');
    });
  });
});
