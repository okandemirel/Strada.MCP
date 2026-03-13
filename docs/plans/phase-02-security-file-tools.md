# Phase 2: Security Layer + File Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the security foundation (path guard, sanitizer, validator) and 6 file tools that all other tools depend on.

**Architecture:** Security utilities are standalone functions imported by every tool. File tools use the path guard for every operation.

**Tech Stack:** Node.js fs/promises, path, zod

---

### Task 1: Path guard — directory traversal prevention

**Files:**
- Create: `src/security/path-guard.ts`
- Create: `src/security/path-guard.test.ts`

**Step 1: Write the failing test**

```typescript
// src/security/path-guard.test.ts
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

  it('should handle symlink-like traversal', () => {
    expect(() => validatePath('/etc/passwd', root)).toThrow('outside allowed directory');
  });

  it('should allow multiple allowed paths', () => {
    const allowed = ['/Users/test/project', '/Users/test/packages'];
    expect(isPathAllowed('/Users/test/packages/pkg/file.cs', allowed)).toBe(true);
    expect(isPathAllowed('/tmp/evil', allowed)).toBe(false);
  });
});
```

**Step 2: Write implementation**

```typescript
// src/security/path-guard.ts
import path from 'node:path';

export function validatePath(filePath: string, rootDir: string): string {
  if (filePath.includes('\0')) {
    throw new Error('Path contains null byte — rejected');
  }

  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(rootDir, filePath);

  const normalizedRoot = path.resolve(rootDir);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path "${filePath}" resolves outside allowed directory "${rootDir}"`);
  }

  return resolved;
}

export function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(filePath);
  return allowedPaths.some((allowed) => {
    const normalizedAllowed = path.resolve(allowed);
    return (
      resolved.startsWith(normalizedAllowed + path.sep) || resolved === normalizedAllowed
    );
  });
}
```

**Step 3: Run tests**

Run: `npx vitest run src/security/path-guard.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/security/
git commit -m "feat: add path guard with directory traversal prevention"
```

---

### Task 2: Credential sanitizer

**Files:**
- Create: `src/security/sanitizer.ts`
- Create: `src/security/sanitizer.test.ts`

**Step 1: Write the failing test**

```typescript
// src/security/sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeOutput } from './sanitizer.js';

describe('Sanitizer', () => {
  it('should redact API keys (sk-*)', () => {
    expect(sanitizeOutput('key: sk-abc123def456')).toBe('key: [REDACTED]');
  });

  it('should redact Google API keys (AIza*)', () => {
    expect(sanitizeOutput('key: AIzaSyABCDEF123456')).toBe('key: [REDACTED]');
  });

  it('should redact Bearer tokens', () => {
    expect(sanitizeOutput('Authorization: Bearer eyJhbGci...')).toBe(
      'Authorization: [REDACTED]',
    );
  });

  it('should redact GitHub tokens', () => {
    expect(sanitizeOutput('token: ghp_ABCdef123456789012345678901234567890')).toBe(
      'token: [REDACTED]',
    );
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
    const input = 'sk-abc123 and AIzaSy456 and ghp_XYZ789012345678901234567890123456';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('sk-abc');
    expect(result).not.toContain('AIzaSy');
    expect(result).not.toContain('ghp_XYZ');
  });
});
```

**Step 2: Write implementation**

```typescript
// src/security/sanitizer.ts
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[a-zA-Z0-9]{20,}/g, '[REDACTED]'],
  [/\bAIza[a-zA-Z0-9_-]{30,}/g, '[REDACTED]'],
  [/Bearer\s+[a-zA-Z0-9._-]+/g, '[REDACTED]'],
  [/\bghp_[a-zA-Z0-9]{36,}/g, '[REDACTED]'],
  [/\bgho_[a-zA-Z0-9]{36,}/g, '[REDACTED]'],
  [/\bxox[bpras]-[a-zA-Z0-9-]+/g, '[REDACTED]'],
  [/\bkey-[a-zA-Z0-9]{20,}/g, '[REDACTED]'],
  [/\btoken-[a-zA-Z0-9]{20,}/g, '[REDACTED]'],
  [/https?:\/\/[^:]+:[^@]+@/g, (match: string) => match.replace(/\/\/[^:]+:[^@]+@/, '//[REDACTED]@')],
];

export function sanitizeOutput(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    if (typeof replacement === 'string') {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}
```

**Step 3: Run tests, commit**

```bash
npx vitest run src/security/sanitizer.test.ts
git add src/security/sanitizer.*
git commit -m "feat: add credential sanitizer with pattern-based redaction"
```

---

### Task 3: Input validator

**Files:**
- Create: `src/security/validator.ts`
- Create: `src/security/validator.test.ts`

**Step 1: Write the failing test**

```typescript
// src/security/validator.test.ts
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
    expect(validateCSharpIdentifier('123invalid')).toBe(false);
    expect(validateCSharpIdentifier('has space')).toBe(false);
    expect(validateCSharpIdentifier('')).toBe(false);
    expect(validateCSharpIdentifier('class')).toBe(false); // C# keyword
  });
});
```

**Step 2: Write implementation**

```typescript
// src/security/validator.ts
import { z } from 'zod';

export function validateInput<T extends z.ZodType>(
  input: unknown,
  schema: T,
): z.infer<T> {
  return schema.parse(input);
}

const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
]);

const CSHARP_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateCSharpIdentifier(name: string): boolean {
  if (!name || !CSHARP_IDENTIFIER_RE.test(name)) return false;
  return !CSHARP_KEYWORDS.has(name);
}
```

**Step 3: Run tests, commit**

```bash
npx vitest run src/security/validator.test.ts
git add src/security/validator.*
git commit -m "feat: add input validator with C# identifier checking"
```

---

### Task 4: File tools (file_read, file_write, file_edit, file_delete, file_rename, list_directory)

**Files:**
- Create: `src/tools/file/file-read.ts`
- Create: `src/tools/file/file-write.ts`
- Create: `src/tools/file/file-edit.ts`
- Create: `src/tools/file/file-delete.ts`
- Create: `src/tools/file/file-rename.ts`
- Create: `src/tools/file/list-directory.ts`
- Create: `src/tools/file/index.ts`
- Create: `src/tools/file/file-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/file/file-tools.test.ts
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
  });

  describe('FileDeleteTool', () => {
    it('should delete file', async () => {
      await fs.writeFile(path.join(tmpDir, 'delete-me.cs'), 'temp');
      const tool = new FileDeleteTool();
      const result = await tool.execute({ path: 'delete-me.cs' }, ctx);
      expect(result.isError).toBeFalsy();
      await expect(fs.access(path.join(tmpDir, 'delete-me.cs'))).rejects.toThrow();
    });
  });

  describe('FileRenameTool', () => {
    it('should rename file', async () => {
      await fs.writeFile(path.join(tmpDir, 'old.cs'), 'content');
      const tool = new FileRenameTool();
      const result = await tool.execute(
        { source: 'old.cs', destination: 'new.cs' },
        ctx,
      );
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
    });
  });
});
```

**Step 2: Implement all 6 file tools**

Each tool follows the same pattern:
1. Validate input with Zod
2. Validate path with path-guard
3. Check read-only mode for write operations
4. Execute fs operation
5. Return ToolResult with sanitized output

(Full implementation code for each tool — approximately 40-60 lines per tool)

Key patterns:
- `file_read`: `fs.readFile` + line numbering + offset/limit support
- `file_write`: `fs.mkdir` (recursive) + `fs.writeFile`
- `file_edit`: `fs.readFile` + string replace + `fs.writeFile`
- `file_delete`: `fs.unlink` with error handling
- `file_rename`: `fs.rename` with validation
- `list_directory`: `fs.readdir` with `withFileTypes` for file/dir indicators

**Step 3: Create barrel export**

```typescript
// src/tools/file/index.ts
export { FileReadTool } from './file-read.js';
export { FileWriteTool } from './file-write.js';
export { FileEditTool } from './file-edit.js';
export { FileDeleteTool } from './file-delete.js';
export { FileRenameTool } from './file-rename.js';
export { ListDirectoryTool } from './list-directory.js';
```

**Step 4: Run tests**

Run: `npx vitest run src/tools/file/`
Expected: PASS (7+ tests)

**Step 5: Commit**

```bash
git add src/tools/file/ src/security/
git commit -m "feat: add 6 file tools with path guard security"
```

---

### Task 5: Push Phase 2

```bash
git push origin main
```

**Phase 2 complete.** Deliverables:
- Path guard (traversal prevention, null byte rejection, multi-root)
- Credential sanitizer (8 patterns)
- Input validator + C# identifier checker
- 6 file tools (read, write, edit, delete, rename, list_directory)
- ~30 tests passing
