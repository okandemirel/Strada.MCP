# Phase 5: Tree-sitter C# Parser + Analysis Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build tree-sitter based C# AST parser and 4 analysis tools (csharp_parse, code_quality, dependency_graph, project_health).

**Architecture:** Tree-sitter provides accurate C# parsing — classes, methods, fields, attributes, namespaces, generics. Analysis tools consume parsed ASTs to detect anti-patterns and map dependencies.

**Tech Stack:** tree-sitter, tree-sitter-c-sharp

---

### Task 1: Tree-sitter C# parser wrapper

**Files:**
- Create: `src/intelligence/parser/csharp-parser.ts`
- Create: `src/intelligence/parser/csharp-parser.test.ts`

Parses C# source into structured nodes:
```typescript
interface CSharpNode {
  type: 'class' | 'struct' | 'interface' | 'enum' | 'method' | 'field' | 'property' | 'namespace' | 'using';
  name: string;
  modifiers: string[];         // public, private, static, abstract, etc.
  attributes: string[];        // [StradaSystem], [Inject], etc.
  baseTypes: string[];         // : SystemBase, IComponent
  genericParams: string[];     // <T1, T2>
  parameters?: CSharpParam[];  // method params
  children: CSharpNode[];      // nested types, methods
  startLine: number;
  endLine: number;
}
```

Tests verify:
- Simple class parsing
- Struct with IComponent
- SystemBase subclass with attributes
- Generic class with constraints
- Nested class handling
- Namespace extraction
- Using directive extraction

```bash
git commit -m "feat: add tree-sitter C# parser with AST extraction"
```

---

### Task 2: csharp_parse tool

Exposes parser as MCP tool. Input: file path or raw C# code. Output: structured AST JSON.

```bash
git commit -m "feat: add csharp_parse tool"
```

---

### Task 3: code_quality tool (Strada-specific)

Anti-pattern detection rules:
- Component struct with managed reference fields (string, array)
- System without [StradaSystem] attribute
- System with public mutable state
- Service not registered as singleton
- Module without Configure method
- ForEach query with >8 components
- Missing [StructLayout] on component
- Direct EntityManager access outside systems
- Circular namespace dependencies

```bash
git commit -m "feat: add code_quality tool with Strada anti-pattern detection"
```

---

### Task 4: dependency_graph tool

Scans all .asmdef files and parses references to build assembly dependency graph. Also scans `using` directives across .cs files for namespace-level dependencies.

Output: JSON graph + human-readable summary.

```bash
git commit -m "feat: add dependency_graph tool"
```

---

### Task 5: project_health tool

Combines multiple checks:
- `dotnet build` status (if available)
- Test results summary
- Code quality score (anti-pattern count)
- Dependency graph health (circular refs)
- File statistics (total .cs files, LOC, namespace distribution)

```bash
git commit -m "feat: add project_health tool"
git push origin main
```

**Phase 5 complete.** ~100 tests passing.
