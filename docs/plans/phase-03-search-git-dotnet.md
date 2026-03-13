# Phase 3: Search + Git + .NET Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 11 tools — glob search, grep search, code search (placeholder for RAG), 6 git tools, and 2 .NET tools.

**Architecture:** Search tools use Node.js glob and line-by-line regex. Git tools use safe child_process execution with argument sanitization. .NET tools parse MSBuild and test runner output.

**Tech Stack:** glob, child_process, node:readline

---

### Task 1: Process runner — safe shell execution

**Files:**
- Create: `src/utils/process-runner.ts`
- Create: `src/utils/process-runner.test.ts`

**Step 1: Write the failing test**

```typescript
// src/utils/process-runner.test.ts
import { describe, it, expect } from 'vitest';
import { runProcess, sanitizeArg } from './process-runner.js';

describe('ProcessRunner', () => {
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

  it('should timeout long processes', async () => {
    await expect(
      runProcess('sleep', ['10'], { timeout: 100 }),
    ).rejects.toThrow('timed out');
  });

  it('should sanitize dangerous args', () => {
    expect(() => sanitizeArg('--flag')).not.toThrow();
    expect(() => sanitizeArg('file.cs')).not.toThrow();
    expect(() => sanitizeArg('; rm -rf /')).toThrow('shell metacharacter');
    expect(() => sanitizeArg('$(whoami)')).toThrow('shell metacharacter');
    expect(() => sanitizeArg('`cat /etc/passwd`')).toThrow('shell metacharacter');
  });
});
```

**Step 2: Write implementation**

```typescript
// src/utils/process-runner.ts
import { spawn } from 'node:child_process';
import { sanitizeOutput } from '../security/sanitizer.js';

const SHELL_METACHAR_RE = /[;&|`$(){}[\]<>!\\]/;

export function sanitizeArg(arg: string): string {
  if (SHELL_METACHAR_RE.test(arg)) {
    throw new Error(`Argument contains shell metacharacter: "${arg}"`);
  }
  return arg;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runProcess(
  command: string,
  args: string[],
  options: { timeout: number; cwd?: string },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Process "${command}" timed out after ${options.timeout}ms`));
    }, options.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
```

**Step 3: Run tests, commit**

```bash
npx vitest run src/utils/process-runner.test.ts
git add src/utils/process-runner.*
git commit -m "feat: add safe process runner with argument sanitization"
```

---

### Task 2: Search tools (glob_search, grep_search)

**Files:**
- Create: `src/tools/search/glob-search.ts`
- Create: `src/tools/search/grep-search.ts`
- Create: `src/tools/search/code-search.ts` (placeholder — RAG comes in Phase 6)
- Create: `src/tools/search/index.ts`
- Create: `src/tools/search/search-tools.test.ts`

Implement:
- `glob_search`: Uses `glob` package with pattern matching, returns file paths
- `grep_search`: Line-by-line regex search with context lines (-A, -B, -C), uses `node:readline`
- `code_search`: Placeholder that returns "RAG not yet initialized" until Phase 6

**Step 1: Test, Step 2: Implement, Step 3: Commit**

```bash
git add src/tools/search/
git commit -m "feat: add glob_search and grep_search tools"
```

---

### Task 3: Git tools (6 tools)

**Files:**
- Create: `src/tools/git/git-status.ts`
- Create: `src/tools/git/git-diff.ts`
- Create: `src/tools/git/git-log.ts`
- Create: `src/tools/git/git-commit.ts`
- Create: `src/tools/git/git-branch.ts`
- Create: `src/tools/git/git-stash.ts`
- Create: `src/tools/git/index.ts`
- Create: `src/tools/git/git-tools.test.ts`

All git tools:
- Use `runProcess('git', [...args])` with `sanitizeArg()` on all user inputs
- Read-only tools: status, diff, log
- Write tools: commit, branch, stash — reject in read-only mode
- Output sanitized via credential scrubbing
- Git args prefixed with `--` before file paths to prevent flag injection

Key patterns:
- `git_status`: `git status --porcelain`
- `git_diff`: `git diff [--staged] [-- file]`
- `git_log`: `git log --oneline -n {count}`
- `git_commit`: `git add [files] && git commit -m "{message}"`
- `git_branch`: `git branch [-a] [name] [-d name]`
- `git_stash`: `git stash [push|pop|list|drop]`

```bash
git add src/tools/git/
git commit -m "feat: add 6 git tools with credential scrubbing"
```

---

### Task 4: .NET tools (dotnet_build, dotnet_test)

**Files:**
- Create: `src/tools/dotnet/dotnet-build.ts`
- Create: `src/tools/dotnet/dotnet-test.ts`
- Create: `src/tools/dotnet/index.ts`
- Create: `src/tools/dotnet/dotnet-tools.test.ts`

Implement:
- `dotnet_build`: `runProcess('dotnet', ['build', projectPath])` + MSBuild error/warning regex parsing
- `dotnet_test`: `runProcess('dotnet', ['test', projectPath])` + result summary parsing (passed/failed/skipped)

Both validate project paths via path-guard and respect read-only mode.

```bash
git add src/tools/dotnet/
git commit -m "feat: add dotnet build and test tools with output parsing"
```

---

### Task 5: Register all tools + push

Register all 11 new tools in the tool registry via a registration function. Run full test suite.

```bash
npx vitest run
npx tsc --noEmit
git add .
git commit -m "feat: register search, git, and dotnet tools in registry"
git push origin main
```

**Phase 3 complete.** Deliverables:
- Safe process runner with shell metacharacter rejection
- 2 search tools (glob, grep) + code_search placeholder
- 6 git tools with credential scrubbing and flag injection prevention
- 2 .NET tools with MSBuild output parsing
- ~55 tests passing
