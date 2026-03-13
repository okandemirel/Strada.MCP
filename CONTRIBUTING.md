# Contributing to Strada.MCP

Thank you for your interest in contributing to Strada.MCP! This document provides guidelines for contributing.

## Development Setup

### Prerequisites

- Node.js >= 20
- npm >= 10
- Unity 2021.3+ (for bridge testing)
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Strada.MCP.git
   cd Strada.MCP
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests:
   ```bash
   npm test
   ```

## Architecture Overview

Strada.MCP follows a modular architecture:

```
src/
  config/       - Zod-validated configuration (loaded from environment variables)
  security/     - Path guard, output sanitizer, input validator
  tools/        - 49 MCP tools organized by category
  resources/    - 10 MCP resources (file-based and bridge-based)
  prompts/      - 6 MCP prompts (Strada and Unity workflows)
  intelligence/ - Tree-sitter parser and RAG pipeline
  bridge/       - Unity Editor TCP bridge client
  context/      - Brain HTTP client
  utils/        - Logger, process runner
```

Every tool implements the `ITool` interface. Every resource implements `IResource`. Every prompt implements `IPrompt`. All are registered via their respective registries.

## Code Standards

### TypeScript

- Strict mode enabled (no `any` types)
- ESM modules (import/export)
- Zod validation on all tool inputs
- Every tool implements the `ITool` interface
- All file operations go through path guard

### Testing

- **TDD approach**: Write tests before implementation
- **Vitest** for all TypeScript tests
- **NUnit** for Unity C# tests
- Every tool must have unit tests
- Security functions need dedicated test suites

### Commit Messages

Follow conventional commits:

```
feat: add new tool
fix: correct path guard edge case
docs: update README
test: add integration tests
refactor: simplify tool registry
```

### Pull Requests

1. Create a feature branch from `main`
2. Write tests for your changes
3. Ensure all tests pass: `npm test && npm run typecheck`
4. Keep PRs focused — one feature per PR
5. Update documentation if adding tools or changing API

## Adding a New Tool

1. Create tool file in appropriate category: `src/tools/{category}/{tool-name}.ts`
2. Implement `ITool` interface with name, description, inputSchema, and metadata
3. Add Zod input schema for validation
4. Add security checks (path guard for file operations, read-only check for write operations)
5. Write unit tests: `src/tools/{category}/{tool-name}.test.ts`
6. Export from the category index file: `src/tools/{category}/index.ts`
7. Register in the server setup
8. If bridge-dependent, extend `BridgeTool` base class and add corresponding C# handler in the Unity package
9. Update the README tool reference table

### Tool interface

```typescript
interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly metadata: {
    category: ToolCategory;
    requiresBridge: boolean;
    dangerous: boolean;
    readOnly?: boolean;
  };
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

## Adding a New Resource

1. Create resource file: `src/resources/{category}/{resource-name}.ts`
2. Implement `IResource` interface with uri, name, description, and metadata
3. Export from `src/resources/index.ts`
4. Register in the server setup

## Adding a New Prompt

1. Create prompt file: `src/prompts/{category}/{prompt-name}.ts`
2. Implement `IPrompt` interface with name, description, arguments, and getMessage
3. Export from `src/prompts/index.ts`
4. Register in the server setup

## Security Guidelines

- **Never** commit API keys, tokens, or credentials
- All file paths must go through `validatePath()` in `src/security/path-guard.ts`
- All output must go through `sanitizeOutput()` in `src/security/sanitizer.ts`
- Write operations must check the `readOnly` flag
- Shell commands must use `sanitizeArg()` in `src/security/validator.ts`

## Reporting Issues

- Use [GitHub Issues](https://github.com/okandemirel/Strada.MCP/issues)
- Include Node.js version, Unity version, OS
- Provide reproduction steps
- Attach relevant log output (with secrets redacted)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
