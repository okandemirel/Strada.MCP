# Phase 6: RAG Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete RAG pipeline for semantic code search — structural chunker, embedding client, HNSW vector store, incremental indexer, and 3 tools (code_search, rag_index, rag_status).

**Architecture:** C# source files are parsed by the tree-sitter parser from Phase 5, split at class/method boundaries by the structural chunker, embedded via Gemini Embedding 2.0 (with provider abstraction), and stored in an HNSW vector index with SQLite metadata. Hybrid search combines vector similarity with keyword boosting for ranked results.

**Tech Stack:** hnswlib-node, better-sqlite3, tree-sitter (from Phase 5), zod, crypto (content hashing)

**Depends on:** Phase 5 (tree-sitter C# parser)

---

### Task 1: Structural Chunker — AST-aware code splitting

**Files:**
- Create: `src/intelligence/rag/chunker.ts`
- Create: `src/intelligence/rag/chunker.test.ts`

The chunker splits C# files at natural code boundaries (class, struct, interface, enum, method) using the tree-sitter AST from Phase 5. Each chunk carries metadata for retrieval context.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/chunker.test.ts
import { describe, it, expect } from 'vitest';
import { StructuralChunker, type CodeChunk } from './chunker.js';

const SAMPLE_CS = `
using System;
using Strada.Core.ECS;

namespace Game.Combat
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Current;
        public float Max;
    }

    [StradaSystem]
    public class HealthSystem : SystemBase
    {
        public override void OnInitialize()
        {
            // setup
        }

        public override void OnUpdate(float deltaTime)
        {
            ForEach<Health>((int entity, ref Health h) =>
            {
                if (h.Current <= 0) { /* handle death */ }
            });
        }

        private void RegenerateHealth(ref Health health, float rate)
        {
            health.Current = Math.Min(health.Current + rate, health.Max);
        }
    }
}
`;

describe('StructuralChunker', () => {
  const chunker = new StructuralChunker();

  it('should split file into class/struct level chunks', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const structChunk = chunks.find((c) => c.name === 'Health');
    expect(structChunk).toBeDefined();
    expect(structChunk!.type).toBe('struct');
    expect(structChunk!.filePath).toBe('Assets/Scripts/Combat/Health.cs');
    expect(structChunk!.namespace).toBe('Game.Combat');
    expect(structChunk!.content).toContain('public float Current');
  });

  it('should extract method-level chunks from classes', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const methods = chunks.filter((c) => c.type === 'method');
    expect(methods.length).toBeGreaterThanOrEqual(2);

    const updateMethod = methods.find((c) => c.name === 'OnUpdate');
    expect(updateMethod).toBeDefined();
    expect(updateMethod!.parentClass).toBe('HealthSystem');
    expect(updateMethod!.content).toContain('ForEach<Health>');
  });

  it('should preserve line range metadata', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('should include using directives in file-level context', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const classChunk = chunks.find((c) => c.type === 'class');
    expect(classChunk).toBeDefined();
    expect(classChunk!.usings).toContain('System');
    expect(classChunk!.usings).toContain('Strada.Core.ECS');
  });

  it('should generate content hash for each chunk', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    for (const chunk of chunks) {
      expect(chunk.contentHash).toBeDefined();
      expect(chunk.contentHash).toHaveLength(64); // SHA-256 hex
    }
  });

  it('should return empty array for empty input', () => {
    const chunks = chunker.chunk('', 'empty.cs');
    expect(chunks).toEqual([]);
  });

  it('should handle file with only using statements', () => {
    const chunks = chunker.chunk('using System;\nusing System.Linq;', 'usings.cs');
    expect(chunks).toEqual([]);
  });

  it('should handle interface declarations', () => {
    const code = `
namespace Game.Interfaces
{
    public interface IDamageable
    {
        void TakeDamage(float amount);
        bool IsAlive { get; }
    }
}`;
    const chunks = chunker.chunk(code, 'IDamageable.cs');
    const iface = chunks.find((c) => c.type === 'interface');
    expect(iface).toBeDefined();
    expect(iface!.name).toBe('IDamageable');
  });

  it('should handle enum declarations', () => {
    const code = `
namespace Game.Types
{
    public enum DamageType
    {
        Physical,
        Magical,
        True
    }
}`;
    const chunks = chunker.chunk(code, 'DamageType.cs');
    const enumChunk = chunks.find((c) => c.type === 'enum');
    expect(enumChunk).toBeDefined();
    expect(enumChunk!.name).toBe('DamageType');
  });

  it('should extract base types and attributes', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const system = chunks.find((c) => c.name === 'HealthSystem');
    expect(system).toBeDefined();
    expect(system!.baseTypes).toContain('SystemBase');
    expect(system!.attributes).toContain('StradaSystem');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/chunker.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/chunker.ts
import { createHash } from 'node:crypto';
import { CSharpParser, type CSharpNode } from '../parser/csharp-parser.js';

export interface CodeChunk {
  /** Unique content-based hash */
  contentHash: string;
  /** Chunk type */
  type: 'class' | 'struct' | 'interface' | 'enum' | 'method';
  /** Type/method name */
  name: string;
  /** Containing namespace */
  namespace: string;
  /** Parent class name (for methods) */
  parentClass?: string;
  /** Source file path (relative) */
  filePath: string;
  /** Raw source text of the chunk */
  content: string;
  /** 1-based start line */
  startLine: number;
  /** 1-based end line */
  endLine: number;
  /** Using directives in the file */
  usings: string[];
  /** Base types / implemented interfaces */
  baseTypes: string[];
  /** Attributes on the type/method */
  attributes: string[];
}

export class StructuralChunker {
  private readonly parser: CSharpParser;

  constructor() {
    this.parser = new CSharpParser();
  }

  chunk(source: string, filePath: string): CodeChunk[] {
    if (!source.trim()) return [];

    const ast = this.parser.parse(source);
    const usings = ast
      .filter((n) => n.type === 'using')
      .map((n) => n.name);
    const namespaceNode = ast.find((n) => n.type === 'namespace');
    const namespace = namespaceNode?.name ?? '';

    const chunks: CodeChunk[] = [];
    const lines = source.split('\n');

    const typeNodes = this.collectTypeNodes(ast);
    if (typeNodes.length === 0) return [];

    for (const node of typeNodes) {
      const typeChunk = this.nodeToChunk(node, filePath, namespace, usings, lines);
      if (typeChunk) {
        chunks.push(typeChunk);
      }

      // Extract method-level chunks from classes/structs
      if (node.type === 'class' || node.type === 'struct') {
        const methods = node.children.filter((c) => c.type === 'method');
        for (const method of methods) {
          const methodChunk = this.methodToChunk(
            method,
            node.name,
            filePath,
            namespace,
            usings,
            lines,
          );
          if (methodChunk) {
            chunks.push(methodChunk);
          }
        }
      }
    }

    return chunks;
  }

  private collectTypeNodes(nodes: CSharpNode[]): CSharpNode[] {
    const types: CSharpNode[] = [];
    for (const node of nodes) {
      if (['class', 'struct', 'interface', 'enum'].includes(node.type)) {
        types.push(node);
      }
      // Check namespace children
      if (node.type === 'namespace' && node.children) {
        types.push(...this.collectTypeNodes(node.children));
      }
    }
    return types;
  }

  private nodeToChunk(
    node: CSharpNode,
    filePath: string,
    namespace: string,
    usings: string[],
    lines: string[],
  ): CodeChunk | null {
    const content = lines.slice(node.startLine - 1, node.endLine).join('\n');
    if (!content.trim()) return null;

    return {
      contentHash: this.hash(content),
      type: node.type as CodeChunk['type'],
      name: node.name,
      namespace,
      filePath,
      content,
      startLine: node.startLine,
      endLine: node.endLine,
      usings,
      baseTypes: node.baseTypes ?? [],
      attributes: node.attributes ?? [],
    };
  }

  private methodToChunk(
    node: CSharpNode,
    parentClass: string,
    filePath: string,
    namespace: string,
    usings: string[],
    lines: string[],
  ): CodeChunk | null {
    const content = lines.slice(node.startLine - 1, node.endLine).join('\n');
    if (!content.trim()) return null;

    return {
      contentHash: this.hash(content),
      type: 'method',
      name: node.name,
      namespace,
      parentClass,
      filePath,
      content,
      startLine: node.startLine,
      endLine: node.endLine,
      usings,
      baseTypes: [],
      attributes: node.attributes ?? [],
    };
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/chunker.test.ts`
Expected: PASS (11 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/chunker.ts src/intelligence/rag/chunker.test.ts
git commit -m "feat: add structural chunker with AST-aware code splitting"
```

---

### Task 2: Embedding Client — provider-agnostic embedding API

**Files:**
- Create: `src/intelligence/rag/embedding-client.ts`
- Create: `src/intelligence/rag/embedding-client.test.ts`

Wraps Gemini Embedding 2.0 as default provider with abstraction layer for OpenAI and Ollama. Supports Matryoshka dimension selection and batch embedding with rate limiting.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/embedding-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingClient,
  GeminiEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';

// Mock provider for testing without API keys
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly maxBatchSize = 10;
  embedCallCount = 0;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    this.embedCallCount++;
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) => Math.sin(i + text.length)),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

describe('EmbeddingClient', () => {
  let mockProvider: MockEmbeddingProvider;
  let client: EmbeddingClient;

  beforeEach(() => {
    mockProvider = new MockEmbeddingProvider();
    client = new EmbeddingClient(mockProvider, { dimensions: 768, rateLimit: 100 });
  });

  it('should embed a single text', async () => {
    const results = await client.embed(['Hello world']);
    expect(results).toHaveLength(1);
    expect(results[0].vector).toHaveLength(768);
    expect(typeof results[0].tokenCount).toBe('number');
  });

  it('should embed multiple texts in batch', async () => {
    const texts = Array.from({ length: 5 }, (_, i) => `text ${i}`);
    const results = await client.embed(texts);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.vector).toHaveLength(768);
    }
  });

  it('should split large batches to respect maxBatchSize', async () => {
    const provider = new MockEmbeddingProvider();
    provider.maxBatchSize = 3;
    const c = new EmbeddingClient(provider, { dimensions: 768, rateLimit: 1000 });
    const texts = Array.from({ length: 7 }, (_, i) => `text ${i}`);
    const results = await c.embed(texts);
    expect(results).toHaveLength(7);
    expect(provider.embedCallCount).toBe(3); // ceil(7/3)
  });

  it('should reject empty input', async () => {
    const results = await client.embed([]);
    expect(results).toEqual([]);
  });

  it('should generate deterministic vectors for same input', async () => {
    const r1 = await client.embed(['test']);
    const r2 = await client.embed(['test']);
    expect(r1[0].vector).toEqual(r2[0].vector);
  });

  it('should respect configured dimensions', async () => {
    const c = new EmbeddingClient(mockProvider, { dimensions: 256, rateLimit: 100 });
    const results = await c.embed(['test']);
    expect(results[0].vector).toHaveLength(256);
  });
});

describe('GeminiEmbeddingProvider', () => {
  it('should be constructable with API key', () => {
    const provider = new GeminiEmbeddingProvider('test-api-key', 'gemini-embedding-2-preview');
    expect(provider.name).toBe('gemini');
    expect(provider.maxBatchSize).toBeLessThanOrEqual(100);
  });

  it('should throw on missing API key', () => {
    expect(() => new GeminiEmbeddingProvider('', 'gemini-embedding-2-preview')).toThrow(
      'API key',
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/embedding-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/embedding-client.ts

export interface EmbeddingResult {
  vector: number[];
  tokenCount: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly maxBatchSize: number;
  embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]>;
}

export interface EmbeddingClientOptions {
  dimensions: number;
  rateLimit: number; // max requests per minute
}

export class EmbeddingClient {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly options: EmbeddingClientOptions,
  ) {
    this.minIntervalMs = (60 * 1000) / options.rateLimit;
  }

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const batches = this.splitIntoBatches(texts, this.provider.maxBatchSize);
    const results: EmbeddingResult[] = [];

    for (const batch of batches) {
      await this.waitForRateLimit();
      const batchResults = await this.provider.embed(batch, this.options.dimensions);
      results.push(...batchResults);
    }

    return results;
  }

  private splitIntoBatches(texts: string[], batchSize: number): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    return batches;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

/**
 * Gemini Embedding 2.0 provider.
 * Supports Matryoshka dimensions (128, 256, 512, 768, 1024, 2048, 3072).
 * Uses REST API to avoid extra SDK dependency.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly maxBatchSize = 100;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
  }

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const requests = texts.map((text) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: dimensions,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini embedding failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      embeddings: Array<{ values: number[] }>;
    };

    return data.embeddings.map((e) => ({
      vector: e.values,
      tokenCount: 0, // Gemini does not return token count in batch endpoint
    }));
  }
}

/**
 * OpenAI-compatible embedding provider (works with OpenAI API and compatible endpoints).
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly maxBatchSize = 2048;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'text-embedding-3-small',
    private readonly baseUrl: string = 'https://api.openai.com/v1',
  ) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embedding failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    const sorted = data.data.sort((a, b) => a.index - b.index);
    const tokensPerItem = Math.ceil(data.usage.total_tokens / texts.length);

    return sorted.map((d) => ({
      vector: d.embedding,
      tokenCount: tokensPerItem,
    }));
  }
}

/**
 * Ollama embedding provider (local models).
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly maxBatchSize = 1; // Ollama processes one at a time

  constructor(
    private readonly model: string = 'nomic-embed-text',
    private readonly baseUrl: string = 'http://localhost:11434',
  ) {}

  async embed(texts: string[], _dimensions: number): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama embedding failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      results.push({
        vector: data.embedding,
        tokenCount: text.split(/\s+/).length, // estimate
      });
    }

    return results;
  }
}

/**
 * Factory: create the right provider from config.
 */
export function createEmbeddingProvider(
  provider: 'gemini' | 'openai' | 'ollama',
  apiKey: string | undefined,
  model?: string,
): EmbeddingProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiEmbeddingProvider(
        apiKey ?? '',
        model ?? 'gemini-embedding-2-preview',
      );
    case 'openai':
      return new OpenAIEmbeddingProvider(apiKey ?? '', model);
    case 'ollama':
      return new OllamaEmbeddingProvider(model);
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/embedding-client.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/embedding-client.ts src/intelligence/rag/embedding-client.test.ts
git commit -m "feat: add embedding client with Gemini/OpenAI/Ollama providers"
```

---

### Task 3: HNSW Vector Store — hnswlib-node + SQLite metadata

**Files:**
- Create: `src/intelligence/rag/vector-store.ts`
- Create: `src/intelligence/rag/vector-store.test.ts`

HNSW index for fast approximate nearest neighbor search, with SQLite sidecar for chunk metadata storage. Content-hash based dedup prevents duplicate entries.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/vector-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore, type VectorSearchResult } from './vector-store.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('VectorStore', () => {
  let tmpDir: string;
  let store: VectorStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-vector-test-'));
    store = new VectorStore(tmpDir, 4); // 4 dimensions for fast test
    await store.initialize();
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should insert and search vectors', async () => {
    await store.insert({
      contentHash: 'hash-1',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: {
        filePath: 'Assets/Health.cs',
        type: 'class',
        name: 'Health',
        namespace: 'Game',
        parentClass: undefined,
        startLine: 1,
        endLine: 10,
        content: 'public struct Health : IComponent { }',
      },
    });

    const results = await store.search([1.0, 0.0, 0.0, 0.0], 5);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.name).toBe('Health');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should return top-k results sorted by score', async () => {
    await store.insert({
      contentHash: 'hash-a',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: {
        filePath: 'a.cs', type: 'class', name: 'A', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class A {}',
      },
    });
    await store.insert({
      contentHash: 'hash-b',
      vector: [0.9, 0.1, 0.0, 0.0],
      metadata: {
        filePath: 'b.cs', type: 'class', name: 'B', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class B {}',
      },
    });
    await store.insert({
      contentHash: 'hash-c',
      vector: [0.0, 0.0, 1.0, 0.0],
      metadata: {
        filePath: 'c.cs', type: 'class', name: 'C', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class C {}',
      },
    });

    const results = await store.search([1.0, 0.0, 0.0, 0.0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].metadata.name).toBe('A');
    expect(results[1].metadata.name).toBe('B');
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('should deduplicate by content hash', async () => {
    const entry = {
      contentHash: 'dup-hash',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: {
        filePath: 'a.cs', type: 'class' as const, name: 'A', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class A {}',
      },
    };
    await store.insert(entry);
    await store.insert(entry); // should be no-op
    expect(store.count()).toBe(1);
  });

  it('should delete by file path', async () => {
    await store.insert({
      contentHash: 'hash-x',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: {
        filePath: 'Assets/old.cs', type: 'class', name: 'Old', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class Old {}',
      },
    });
    await store.insert({
      contentHash: 'hash-y',
      vector: [0.0, 1.0, 0.0, 0.0],
      metadata: {
        filePath: 'Assets/keep.cs', type: 'class', name: 'Keep', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class Keep {}',
      },
    });

    await store.deleteByFilePath('Assets/old.cs');
    expect(store.count()).toBe(1);

    const results = await store.search([1.0, 0.0, 0.0, 0.0], 5);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.name).toBe('Keep');
  });

  it('should report correct count', async () => {
    expect(store.count()).toBe(0);
    await store.insert({
      contentHash: 'hash-1',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: {
        filePath: 'a.cs', type: 'class', name: 'A', namespace: '',
        parentClass: undefined, startLine: 1, endLine: 5, content: 'class A {}',
      },
    });
    expect(store.count()).toBe(1);
  });

  it('should persist and reload index', async () => {
    await store.insert({
      contentHash: 'persist-hash',
      vector: [0.5, 0.5, 0.0, 0.0],
      metadata: {
        filePath: 'persist.cs', type: 'method', name: 'DoWork', namespace: 'App',
        parentClass: 'Worker', startLine: 10, endLine: 20, content: 'void DoWork() {}',
      },
    });
    await store.save();
    store.close();

    // Reload
    const store2 = new VectorStore(tmpDir, 4);
    await store2.initialize();
    expect(store2.count()).toBe(1);

    const results = await store2.search([0.5, 0.5, 0.0, 0.0], 1);
    expect(results[0].metadata.name).toBe('DoWork');
    store2.close();
  });

  it('should handle search on empty index', async () => {
    const results = await store.search([1.0, 0.0, 0.0, 0.0], 5);
    expect(results).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/vector-store.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/vector-store.ts
import HierarchicalNSW from 'hnswlib-node';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export interface ChunkMetadata {
  filePath: string;
  type: string;
  name: string;
  namespace: string;
  parentClass: string | undefined;
  startLine: number;
  endLine: number;
  content: string;
}

export interface VectorEntry {
  contentHash: string;
  vector: number[];
  metadata: ChunkMetadata;
}

export interface VectorSearchResult {
  score: number;
  metadata: ChunkMetadata;
}

const HNSW_INDEX_FILE = 'vectors.hnsw';
const SQLITE_FILE = 'metadata.sqlite';
const MAX_ELEMENTS = 100_000;

export class VectorStore {
  private index!: InstanceType<typeof HierarchicalNSW>;
  private db!: Database.Database;
  private nextId = 0;
  private readonly indexPath: string;
  private readonly dbPath: string;
  // Maps HNSW integer IDs to content hashes
  private idToHash = new Map<number, string>();
  // Maps content hashes to HNSW integer IDs for dedup
  private hashToId = new Map<string, number>();
  // Tracks IDs marked as deleted (soft delete for HNSW)
  private deletedIds = new Set<number>();

  constructor(
    private readonly storagePath: string,
    private readonly dimensions: number,
  ) {
    this.indexPath = path.join(storagePath, HNSW_INDEX_FILE);
    this.dbPath = path.join(storagePath, SQLITE_FILE);
  }

  async initialize(): Promise<void> {
    // Initialize SQLite
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        content_hash TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        namespace TEXT NOT NULL,
        parent_class TEXT,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(content_hash);
    `);

    // Initialize HNSW
    this.index = new HierarchicalNSW('cosine', this.dimensions);

    if (fs.existsSync(this.indexPath)) {
      // Load existing index
      this.index.readIndexSync(this.indexPath);
      this.rebuildMappings();
    } else {
      this.index.initIndex(MAX_ELEMENTS);
    }
  }

  private rebuildMappings(): void {
    const rows = this.db.prepare('SELECT id, content_hash FROM chunks').all() as Array<{
      id: number;
      content_hash: string;
    }>;
    for (const row of rows) {
      this.idToHash.set(row.id, row.content_hash);
      this.hashToId.set(row.content_hash, row.id);
      if (row.id >= this.nextId) {
        this.nextId = row.id + 1;
      }
    }
  }

  async insert(entry: VectorEntry): Promise<void> {
    // Deduplicate by content hash
    if (this.hashToId.has(entry.contentHash)) {
      return;
    }

    const id = this.nextId++;

    // Insert into HNSW
    this.index.addPoint(entry.vector, id);

    // Insert into SQLite
    this.db
      .prepare(
        `INSERT OR IGNORE INTO chunks
         (id, content_hash, file_path, type, name, namespace, parent_class, start_line, end_line, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.contentHash,
        entry.metadata.filePath,
        entry.metadata.type,
        entry.metadata.name,
        entry.metadata.namespace,
        entry.metadata.parentClass ?? null,
        entry.metadata.startLine,
        entry.metadata.endLine,
        entry.metadata.content,
      );

    this.idToHash.set(id, entry.contentHash);
    this.hashToId.set(entry.contentHash, id);
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    const currentCount = this.count();
    if (currentCount === 0) return [];

    const effectiveK = Math.min(topK, currentCount);
    const result = this.index.searchKnn(queryVector, effectiveK);

    const results: VectorSearchResult[] = [];
    for (let i = 0; i < result.neighbors.length; i++) {
      const id = result.neighbors[i];
      if (this.deletedIds.has(id)) continue;

      const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as {
        file_path: string;
        type: string;
        name: string;
        namespace: string;
        parent_class: string | null;
        start_line: number;
        end_line: number;
        content: string;
      } | undefined;

      if (!row) continue;

      // HNSW returns distances; for cosine, score = 1 - distance
      const distance = result.distances[i];
      const score = 1 - distance;

      results.push({
        score,
        metadata: {
          filePath: row.file_path,
          type: row.type,
          name: row.name,
          namespace: row.namespace,
          parentClass: row.parent_class ?? undefined,
          startLine: row.start_line,
          endLine: row.end_line,
          content: row.content,
        },
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async deleteByFilePath(filePath: string): Promise<number> {
    const rows = this.db
      .prepare('SELECT id, content_hash FROM chunks WHERE file_path = ?')
      .all(filePath) as Array<{ id: number; content_hash: string }>;

    for (const row of rows) {
      // Mark as deleted in HNSW (hnswlib supports markDelete)
      this.index.markDelete(row.id);
      this.deletedIds.add(row.id);
      this.idToHash.delete(row.id);
      this.hashToId.delete(row.content_hash);
    }

    this.db.prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
    return rows.length;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    return row.cnt;
  }

  async save(): Promise<void> {
    this.index.writeIndexSync(this.indexPath);
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * Returns the total size of the index + metadata files in bytes.
   */
  getIndexSize(): number {
    let size = 0;
    try {
      size += fs.statSync(this.indexPath).size;
    } catch { /* index not yet saved */ }
    try {
      size += fs.statSync(this.dbPath).size;
    } catch { /* db not yet created */ }
    return size;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/vector-store.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/vector-store.ts src/intelligence/rag/vector-store.test.ts
git commit -m "feat: add HNSW vector store with SQLite metadata and content-hash dedup"
```

---

### Task 4: Indexer — scan, parse, chunk, embed, store pipeline

**Files:**
- Create: `src/intelligence/rag/indexer.ts`
- Create: `src/intelligence/rag/indexer.test.ts`

Orchestrates the full indexing pipeline: scan .cs files, parse with tree-sitter, chunk at code boundaries, embed, and store. Incremental via content-hash comparison (skip unchanged files). Reports progress via callback.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/indexer.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Indexer, type IndexProgress } from './indexer.js';
import { VectorStore } from './vector-store.js';
import { EmbeddingClient, type EmbeddingProvider, type EmbeddingResult } from './embedding-client.js';
import { StructuralChunker } from './chunker.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly maxBatchSize = 50;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) =>
        Math.sin(i + text.charCodeAt(0) + text.length),
      ),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

const SAMPLE_COMPONENT = `
using Strada.Core.ECS;
using System.Runtime.InteropServices;

namespace Game.Components
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Velocity : IComponent
    {
        public float X;
        public float Y;
        public float Z;
    }
}
`;

const SAMPLE_SYSTEM = `
using Strada.Core.ECS;
using Strada.Core.ECS.Systems;

namespace Game.Systems
{
    [StradaSystem]
    public class MovementSystem : SystemBase
    {
        public override void OnUpdate(float deltaTime)
        {
            ForEach<Position, Velocity>((int entity, ref Position pos, ref Velocity vel) =>
            {
                pos.X += vel.X * deltaTime;
                pos.Y += vel.Y * deltaTime;
            });
        }
    }
}
`;

describe('Indexer', () => {
  let tmpDir: string;
  let projectDir: string;
  let indexer: Indexer;
  let store: VectorStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-indexer-test-'));
    projectDir = path.join(tmpDir, 'project');
    const storageDir = path.join(tmpDir, 'storage');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(storageDir, { recursive: true });

    store = new VectorStore(storageDir, 128);
    await store.initialize();

    const provider = new MockEmbeddingProvider();
    const client = new EmbeddingClient(provider, { dimensions: 128, rateLimit: 1000 });
    const chunker = new StructuralChunker();

    indexer = new Indexer(store, client, chunker);
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should index .cs files from project directory', async () => {
    const assetsDir = path.join(projectDir, 'Assets', 'Scripts');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);
    await fs.writeFile(path.join(assetsDir, 'MovementSystem.cs'), SAMPLE_SYSTEM);

    const result = await indexer.index(projectDir);

    expect(result.filesScanned).toBe(2);
    expect(result.chunksIndexed).toBeGreaterThan(0);
    expect(result.filesSkipped).toBe(0);
    expect(store.count()).toBeGreaterThan(0);
  });

  it('should skip unchanged files on re-index (incremental)', async () => {
    const assetsDir = path.join(projectDir, 'Assets');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);

    const result1 = await indexer.index(projectDir);
    expect(result1.filesScanned).toBe(1);
    expect(result1.filesSkipped).toBe(0);

    // Re-index without changes
    const result2 = await indexer.index(projectDir);
    expect(result2.filesScanned).toBe(1);
    expect(result2.filesSkipped).toBe(1);
    expect(result2.chunksIndexed).toBe(0);
  });

  it('should re-index changed files', async () => {
    const assetsDir = path.join(projectDir, 'Assets');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);

    await indexer.index(projectDir);

    // Modify the file
    await fs.writeFile(
      path.join(assetsDir, 'Velocity.cs'),
      SAMPLE_COMPONENT.replace('float Z;', 'float Z;\n        public float W;'),
    );

    const result = await indexer.index(projectDir);
    expect(result.filesSkipped).toBe(0);
    expect(result.chunksIndexed).toBeGreaterThan(0);
  });

  it('should remove chunks when file is deleted', async () => {
    const assetsDir = path.join(projectDir, 'Assets');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);
    await fs.writeFile(path.join(assetsDir, 'Movement.cs'), SAMPLE_SYSTEM);

    await indexer.index(projectDir);
    const countBefore = store.count();
    expect(countBefore).toBeGreaterThan(0);

    // Delete one file
    await fs.unlink(path.join(assetsDir, 'Velocity.cs'));

    const result = await indexer.index(projectDir);
    expect(result.filesRemoved).toBe(1);
    expect(store.count()).toBeLessThan(countBefore);
  });

  it('should report progress via callback', async () => {
    const assetsDir = path.join(projectDir, 'Assets');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);

    const progressEvents: IndexProgress[] = [];
    await indexer.index(projectDir, { onProgress: (p) => progressEvents.push({ ...p }) });

    expect(progressEvents.length).toBeGreaterThan(0);
    const last = progressEvents[progressEvents.length - 1];
    expect(last.phase).toBe('done');
  });

  it('should force re-index when force flag is true', async () => {
    const assetsDir = path.join(projectDir, 'Assets');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, 'Velocity.cs'), SAMPLE_COMPONENT);

    await indexer.index(projectDir);
    const result = await indexer.index(projectDir, { force: true });
    expect(result.filesSkipped).toBe(0);
    expect(result.chunksIndexed).toBeGreaterThan(0);
  });

  it('should handle empty project directory', async () => {
    const result = await indexer.index(projectDir);
    expect(result.filesScanned).toBe(0);
    expect(result.chunksIndexed).toBe(0);
  });

  it('should index only within specified subdirectory', async () => {
    const dir1 = path.join(projectDir, 'Assets', 'Scripts');
    const dir2 = path.join(projectDir, 'Assets', 'Plugins');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });
    await fs.writeFile(path.join(dir1, 'A.cs'), SAMPLE_COMPONENT);
    await fs.writeFile(path.join(dir2, 'B.cs'), SAMPLE_SYSTEM);

    const result = await indexer.index(path.join(projectDir, 'Assets', 'Scripts'));
    expect(result.filesScanned).toBe(1);
  });

  it('should ignore non-.cs files', async () => {
    await fs.writeFile(path.join(projectDir, 'readme.md'), '# Hello');
    await fs.writeFile(path.join(projectDir, 'data.json'), '{}');
    await fs.writeFile(path.join(projectDir, 'test.cs'), SAMPLE_COMPONENT);

    const result = await indexer.index(projectDir);
    expect(result.filesScanned).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/indexer.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/indexer.ts
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { StructuralChunker, type CodeChunk } from './chunker.js';
import { EmbeddingClient } from './embedding-client.js';
import { VectorStore } from './vector-store.js';

export interface IndexProgress {
  phase: 'scanning' | 'parsing' | 'embedding' | 'storing' | 'cleanup' | 'done';
  current: number;
  total: number;
  currentFile?: string;
}

export interface IndexOptions {
  /** Force re-index all files, ignoring content hashes */
  force?: boolean;
  /** Progress callback */
  onProgress?: (progress: IndexProgress) => void;
}

export interface IndexResult {
  filesScanned: number;
  filesSkipped: number;
  filesRemoved: number;
  chunksIndexed: number;
  durationMs: number;
}

/**
 * Tracks file content hashes for incremental indexing.
 * Stored as a simple JSON file alongside the vector store.
 */
interface FileHashMap {
  [filePath: string]: string; // filePath -> SHA-256 of file content
}

export class Indexer {
  private fileHashes: FileHashMap = {};
  private hashFilePath = '';

  constructor(
    private readonly store: VectorStore,
    private readonly embeddingClient: EmbeddingClient,
    private readonly chunker: StructuralChunker,
  ) {}

  async index(rootPath: string, options: IndexOptions = {}): Promise<IndexResult> {
    const startTime = Date.now();
    const { force = false, onProgress } = options;

    // Load previous file hashes
    this.hashFilePath = path.join(rootPath, '.strada-mcp', 'file-hashes.json');
    await this.loadFileHashes();

    // Phase 1: Scan for .cs files
    onProgress?.({ phase: 'scanning', current: 0, total: 0 });
    const csFiles = await glob('**/*.cs', {
      cwd: rootPath,
      nodir: true,
      absolute: false,
      ignore: ['**/bin/**', '**/obj/**', '**/node_modules/**', '**/Library/**', '**/Temp/**'],
    });

    const filesScanned = csFiles.length;
    let filesSkipped = 0;
    let chunksIndexed = 0;

    // Track which files still exist for cleanup
    const currentFiles = new Set<string>();
    const newFileHashes: FileHashMap = {};

    // Phase 2: Parse and chunk changed files
    const allChunks: CodeChunk[] = [];

    for (let i = 0; i < csFiles.length; i++) {
      const relPath = csFiles[i];
      currentFiles.add(relPath);
      const absPath = path.join(rootPath, relPath);

      onProgress?.({
        phase: 'parsing',
        current: i + 1,
        total: csFiles.length,
        currentFile: relPath,
      });

      const content = await fs.readFile(absPath, 'utf-8');
      const fileHash = createHash('sha256').update(content).digest('hex');
      newFileHashes[relPath] = fileHash;

      // Skip unchanged files (unless force)
      if (!force && this.fileHashes[relPath] === fileHash) {
        filesSkipped++;
        continue;
      }

      // Delete old chunks for this file before re-indexing
      await this.store.deleteByFilePath(relPath);

      // Chunk the file
      const chunks = this.chunker.chunk(content, relPath);
      allChunks.push(...chunks);
    }

    // Phase 3: Embed all chunks in batch
    if (allChunks.length > 0) {
      onProgress?.({ phase: 'embedding', current: 0, total: allChunks.length });

      const texts = allChunks.map((c) => this.buildEmbeddingText(c));
      const embeddings = await this.embeddingClient.embed(texts);

      // Phase 4: Store in vector index
      for (let i = 0; i < allChunks.length; i++) {
        onProgress?.({
          phase: 'storing',
          current: i + 1,
          total: allChunks.length,
          currentFile: allChunks[i].filePath,
        });

        await this.store.insert({
          contentHash: allChunks[i].contentHash,
          vector: embeddings[i].vector,
          metadata: {
            filePath: allChunks[i].filePath,
            type: allChunks[i].type,
            name: allChunks[i].name,
            namespace: allChunks[i].namespace,
            parentClass: allChunks[i].parentClass,
            startLine: allChunks[i].startLine,
            endLine: allChunks[i].endLine,
            content: allChunks[i].content,
          },
        });
        chunksIndexed++;
      }
    }

    // Phase 5: Cleanup — remove chunks for deleted files
    let filesRemoved = 0;
    const previousFiles = Object.keys(this.fileHashes);
    for (const prevFile of previousFiles) {
      if (!currentFiles.has(prevFile)) {
        await this.store.deleteByFilePath(prevFile);
        filesRemoved++;
      }
    }

    onProgress?.({ phase: 'cleanup', current: filesRemoved, total: filesRemoved });

    // Save updated state
    await this.store.save();
    this.fileHashes = newFileHashes;
    await this.saveFileHashes();

    onProgress?.({
      phase: 'done',
      current: filesScanned,
      total: filesScanned,
    });

    return {
      filesScanned,
      filesSkipped,
      filesRemoved,
      chunksIndexed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Builds enriched text for embedding. Includes structural context
   * (namespace, class name, type) alongside the raw code for better
   * semantic retrieval.
   */
  private buildEmbeddingText(chunk: CodeChunk): string {
    const parts: string[] = [];
    if (chunk.namespace) parts.push(`namespace: ${chunk.namespace}`);
    if (chunk.parentClass) parts.push(`class: ${chunk.parentClass}`);
    parts.push(`${chunk.type}: ${chunk.name}`);
    if (chunk.baseTypes.length > 0) parts.push(`extends: ${chunk.baseTypes.join(', ')}`);
    parts.push('');
    parts.push(chunk.content);
    return parts.join('\n');
  }

  private async loadFileHashes(): Promise<void> {
    try {
      const raw = await fs.readFile(this.hashFilePath, 'utf-8');
      this.fileHashes = JSON.parse(raw);
    } catch {
      this.fileHashes = {};
    }
  }

  private async saveFileHashes(): Promise<void> {
    const dir = path.dirname(this.hashFilePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.hashFilePath, JSON.stringify(this.fileHashes, null, 2));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/indexer.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/indexer.ts src/intelligence/rag/indexer.test.ts
git commit -m "feat: add incremental indexer with scan/parse/chunk/embed/store pipeline"
```

---

### Task 5: code_search tool — hybrid vector + keyword search

**Files:**
- Update: `src/tools/search/code-search.ts` (replace Phase 3 placeholder)
- Create: `src/intelligence/rag/hybrid-search.ts`
- Create: `src/intelligence/rag/hybrid-search.test.ts`
- Create: `src/tools/search/code-search.test.ts`

Replaces the Phase 3 placeholder with RAG-powered semantic search. Combines vector similarity with keyword boosting for better results.

**Step 1: Write the failing test — hybrid search engine**

```typescript
// src/intelligence/rag/hybrid-search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HybridSearch, type HybridSearchResult } from './hybrid-search.js';
import { VectorStore } from './vector-store.js';
import { EmbeddingClient, type EmbeddingProvider, type EmbeddingResult } from './embedding-client.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly maxBatchSize = 50;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) =>
        Math.sin(i + text.charCodeAt(0) + text.length),
      ),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

describe('HybridSearch', () => {
  let tmpDir: string;
  let store: VectorStore;
  let embeddingClient: EmbeddingClient;
  let search: HybridSearch;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-search-test-'));
    store = new VectorStore(tmpDir, 128);
    await store.initialize();

    const provider = new MockEmbeddingProvider();
    embeddingClient = new EmbeddingClient(provider, { dimensions: 128, rateLimit: 1000 });

    // Seed the store with test data
    const texts = [
      'public class HealthSystem : SystemBase',
      'public struct Health : IComponent',
      'public class MovementSystem : SystemBase',
      'public void TakeDamage(float amount)',
    ];
    const embeddings = await embeddingClient.embed(texts);

    for (let i = 0; i < texts.length; i++) {
      await store.insert({
        contentHash: `hash-${i}`,
        vector: embeddings[i].vector,
        metadata: {
          filePath: `file-${i}.cs`,
          type: i % 2 === 0 ? 'class' : 'struct',
          name: ['HealthSystem', 'Health', 'MovementSystem', 'TakeDamage'][i],
          namespace: 'Game',
          parentClass: i === 3 ? 'HealthSystem' : undefined,
          startLine: 1,
          endLine: 10,
          content: texts[i],
        },
      });
    }

    search = new HybridSearch(store, embeddingClient);
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return results for a query', async () => {
    const results = await search.search('health system', 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.filePath).toBeDefined();
      expect(r.snippet).toBeDefined();
    }
  });

  it('should boost results with keyword matches', async () => {
    const results = await search.search('Health', 5);
    // Items containing "Health" in name/content should rank higher
    const healthResults = results.filter(
      (r) => r.name.includes('Health'),
    );
    expect(healthResults.length).toBeGreaterThan(0);
  });

  it('should respect top-k limit', async () => {
    const results = await search.search('system', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for query on empty store', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    await fs.mkdir(emptyDir);
    const emptyStore = new VectorStore(emptyDir, 128);
    await emptyStore.initialize();
    const emptySearch = new HybridSearch(emptyStore, embeddingClient);

    const results = await emptySearch.search('anything', 5);
    expect(results).toEqual([]);
    emptyStore.close();
  });

  it('should include line range and file path in results', async () => {
    const results = await search.search('health', 5);
    for (const r of results) {
      expect(r.startLine).toBeGreaterThanOrEqual(1);
      expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
      expect(r.filePath).toMatch(/\.cs$/);
    }
  });
});
```

**Step 2: Write hybrid search implementation**

```typescript
// src/intelligence/rag/hybrid-search.ts
import { VectorStore, type VectorSearchResult } from './vector-store.js';
import { EmbeddingClient } from './embedding-client.js';

export interface HybridSearchResult {
  score: number;
  filePath: string;
  name: string;
  namespace: string;
  type: string;
  parentClass?: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export class HybridSearch {
  /** Weight for vector similarity score (0-1) */
  private readonly vectorWeight = 0.7;
  /** Weight for keyword match score (0-1) */
  private readonly keywordWeight = 0.3;
  /** Retrieve more candidates from vector search for re-ranking */
  private readonly overFetchFactor = 3;

  constructor(
    private readonly store: VectorStore,
    private readonly embeddingClient: EmbeddingClient,
  ) {}

  async search(query: string, topK: number): Promise<HybridSearchResult[]> {
    if (this.store.count() === 0) return [];

    // Step 1: Embed the query
    const [queryEmbedding] = await this.embeddingClient.embed([query]);

    // Step 2: Over-fetch from vector store for re-ranking
    const candidates = await this.store.search(
      queryEmbedding.vector,
      topK * this.overFetchFactor,
    );

    if (candidates.length === 0) return [];

    // Step 3: Compute hybrid score (vector + keyword)
    const queryTerms = this.tokenize(query);
    const scored: HybridSearchResult[] = candidates.map((c) => {
      const keywordScore = this.computeKeywordScore(queryTerms, c);
      const hybridScore =
        this.vectorWeight * c.score + this.keywordWeight * keywordScore;

      return {
        score: hybridScore,
        filePath: c.metadata.filePath,
        name: c.metadata.name,
        namespace: c.metadata.namespace,
        type: c.metadata.type,
        parentClass: c.metadata.parentClass,
        startLine: c.metadata.startLine,
        endLine: c.metadata.endLine,
        snippet: this.truncateSnippet(c.metadata.content, 500),
      };
    });

    // Step 4: Sort by hybrid score and take top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
  }

  private computeKeywordScore(queryTerms: string[], candidate: VectorSearchResult): number {
    if (queryTerms.length === 0) return 0;

    const nameTokens = this.tokenize(candidate.metadata.name);
    const contentTokens = this.tokenize(candidate.metadata.content);
    const namespaceTokens = this.tokenize(candidate.metadata.namespace);
    const allTokens = new Set([...nameTokens, ...contentTokens, ...namespaceTokens]);

    let matches = 0;
    let nameMatches = 0;

    for (const term of queryTerms) {
      if (allTokens.has(term)) matches++;
      if (nameTokens.some((t) => t.includes(term) || term.includes(t))) {
        nameMatches++;
      }
    }

    // Name matches are worth more
    const contentScore = matches / queryTerms.length;
    const nameScore = nameMatches / queryTerms.length;

    return contentScore * 0.4 + nameScore * 0.6;
  }

  private truncateSnippet(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }
}
```

**Step 3: Write the code_search tool test**

```typescript
// src/tools/search/code-search.test.ts
import { describe, it, expect } from 'vitest';
import { CodeSearchTool } from './code-search.js';
import type { ToolContext } from '../tool.interface.js';

describe('CodeSearchTool', () => {
  it('should have correct metadata', () => {
    const tool = new CodeSearchTool();
    expect(tool.name).toBe('code_search');
    expect(tool.metadata.category).toBe('search');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return error when RAG is not initialized', async () => {
    const tool = new CodeSearchTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({ query: 'health system' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not initialized');
  });

  it('should accept query and top_k parameters', () => {
    const tool = new CodeSearchTool();
    const schema = tool.inputSchema;
    expect(schema.properties).toHaveProperty('query');
    expect(schema.properties).toHaveProperty('top_k');
  });
});
```

**Step 4: Update code_search tool implementation**

```typescript
// src/tools/search/code-search.ts
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { HybridSearch } from '../../intelligence/rag/hybrid-search.js';

export class CodeSearchTool implements ITool {
  readonly name = 'code_search';
  readonly description =
    'RAG-powered semantic code search. Finds relevant code by meaning, not just text matching. Returns ranked results with file paths, line ranges, and code snippets.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language or code search query',
      },
      top_k: {
        type: 'number',
        description: 'Number of results to return (default: 10)',
      },
    },
    required: ['query'],
  };
  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private hybridSearch: HybridSearch | null = null;

  /**
   * Called by the RAG manager after initialization to inject the search engine.
   */
  setHybridSearch(search: HybridSearch): void {
    this.hybridSearch = search;
  }

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    if (!this.hybridSearch) {
      return {
        content: 'RAG pipeline is not initialized. Run rag_index first or enable RAG_AUTO_INDEX.',
        isError: true,
      };
    }

    const query = input.query as string;
    const topK = (input.top_k as number) ?? 10;

    if (!query || typeof query !== 'string') {
      return { content: 'query parameter is required and must be a string.', isError: true };
    }

    try {
      const startTime = Date.now();
      const results = await this.hybridSearch.search(query, topK);
      const durationMs = Date.now() - startTime;

      if (results.length === 0) {
        return { content: 'No results found.', metadata: { executionTimeMs: durationMs } };
      }

      const formatted = results
        .map((r, i) => {
          const location = r.parentClass
            ? `${r.filePath} > ${r.parentClass}.${r.name}`
            : `${r.filePath} > ${r.name}`;
          return [
            `### ${i + 1}. ${r.name} (${r.type})`,
            `**Location:** ${location}`,
            `**Lines:** ${r.startLine}-${r.endLine} | **Score:** ${r.score.toFixed(3)}`,
            `\`\`\`csharp`,
            r.snippet,
            `\`\`\``,
          ].join('\n');
        })
        .join('\n\n');

      return {
        content: `Found ${results.length} results (${durationMs}ms):\n\n${formatted}`,
        metadata: { executionTimeMs: durationMs },
      };
    } catch (err) {
      return {
        content: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
```

**Step 5: Run tests**

Run: `npx vitest run src/intelligence/rag/hybrid-search.test.ts src/tools/search/code-search.test.ts`
Expected: PASS (8 tests)

**Step 6: Commit**

```bash
git add src/intelligence/rag/hybrid-search.ts src/intelligence/rag/hybrid-search.test.ts
git add src/tools/search/code-search.ts src/tools/search/code-search.test.ts
git commit -m "feat: add hybrid search engine and upgrade code_search tool with RAG"
```

---

### Task 6: rag_index tool — manual indexing trigger

**Files:**
- Create: `src/tools/search/rag-index.ts`
- Create: `src/tools/search/rag-index.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/search/rag-index.test.ts
import { describe, it, expect } from 'vitest';
import { RagIndexTool } from './rag-index.js';
import type { ToolContext } from '../tool.interface.js';

describe('RagIndexTool', () => {
  it('should have correct metadata', () => {
    const tool = new RagIndexTool();
    expect(tool.name).toBe('rag_index');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should accept path and force parameters', () => {
    const tool = new RagIndexTool();
    expect(tool.inputSchema.properties).toHaveProperty('path');
    expect(tool.inputSchema.properties).toHaveProperty('force');
  });

  it('should return error when indexer is not initialized', async () => {
    const tool = new RagIndexTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not initialized');
  });

  it('should validate path parameter through path guard', () => {
    const tool = new RagIndexTool();
    // path is optional — defaults to project root
    expect(tool.inputSchema.required).not.toContain('path');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/search/rag-index.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/tools/search/rag-index.ts
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';
import { Indexer, type IndexProgress } from '../../intelligence/rag/indexer.js';

export class RagIndexTool implements ITool {
  readonly name = 'rag_index';
  readonly description =
    'Trigger RAG indexing of C# source files. Scans, parses, chunks, embeds, and stores code for semantic search. Incremental by default — only re-indexes changed files.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Directory to index (relative to project root). Defaults to project root.',
      },
      force: {
        type: 'boolean',
        description: 'Force re-index all files, ignoring content hashes (default: false)',
      },
    },
    required: [] as string[],
  };
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private indexer: Indexer | null = null;

  /**
   * Called by the RAG manager after initialization to inject the indexer.
   */
  setIndexer(indexer: Indexer): void {
    this.indexer = indexer;
  }

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    if (!this.indexer) {
      return {
        content: 'RAG pipeline is not initialized. Check your embedding configuration.',
        isError: true,
      };
    }

    const force = (input.force as boolean) ?? false;
    let targetPath = ctx.projectPath;

    if (input.path && typeof input.path === 'string') {
      try {
        targetPath = validatePath(input.path as string, ctx.projectPath);
      } catch (err) {
        return {
          content: `Invalid path: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    }

    try {
      const result = await this.indexer.index(targetPath, { force });

      const summary = [
        `RAG indexing complete (${result.durationMs}ms):`,
        `  Files scanned: ${result.filesScanned}`,
        `  Files skipped (unchanged): ${result.filesSkipped}`,
        `  Files removed: ${result.filesRemoved}`,
        `  Chunks indexed: ${result.chunksIndexed}`,
        force ? '  Mode: full re-index (forced)' : '  Mode: incremental',
      ].join('\n');

      return {
        content: summary,
        metadata: { executionTimeMs: result.durationMs },
      };
    } catch (err) {
      return {
        content: `Indexing failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools/search/rag-index.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/tools/search/rag-index.ts src/tools/search/rag-index.test.ts
git commit -m "feat: add rag_index tool for manual indexing trigger"
```

---

### Task 7: rag_status tool — index health reporting

**Files:**
- Create: `src/tools/search/rag-status.ts`
- Create: `src/tools/search/rag-status.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/search/rag-status.test.ts
import { describe, it, expect } from 'vitest';
import { RagStatusTool } from './rag-status.js';
import type { ToolContext } from '../tool.interface.js';

describe('RagStatusTool', () => {
  it('should have correct metadata', () => {
    const tool = new RagStatusTool();
    expect(tool.name).toBe('rag_status');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should take no required parameters', () => {
    const tool = new RagStatusTool();
    expect(tool.inputSchema.required).toEqual([]);
  });

  it('should return status when not initialized', async () => {
    const tool = new RagStatusTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('not initialized');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/search/rag-status.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/tools/search/rag-status.ts
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { VectorStore } from '../../intelligence/rag/vector-store.js';

export interface RagStatusInfo {
  indexedFileCount: number;
  chunkCount: number;
  lastIndexTime: string | null;
  indexSizeBytes: number;
  embeddingProvider: string;
  embeddingDimensions: number;
}

export class RagStatusTool implements ITool {
  readonly name = 'rag_status';
  readonly description =
    'Returns the current status of the RAG index — file count, chunk count, last index time, index size, and configuration.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  };
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private store: VectorStore | null = null;
  private lastIndexTime: Date | null = null;
  private embeddingProvider = 'unknown';
  private embeddingDimensions = 0;
  private indexedFileCount = 0;

  /**
   * Called by the RAG manager after initialization.
   */
  configure(options: {
    store: VectorStore;
    embeddingProvider: string;
    embeddingDimensions: number;
  }): void {
    this.store = options.store;
    this.embeddingProvider = options.embeddingProvider;
    this.embeddingDimensions = options.embeddingDimensions;
  }

  /**
   * Called after each successful indexing run.
   */
  updateIndexInfo(fileCount: number): void {
    this.lastIndexTime = new Date();
    this.indexedFileCount = fileCount;
  }

  async execute(_input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    if (!this.store) {
      return {
        content: [
          'RAG Status: not initialized',
          '',
          'The RAG pipeline has not been initialized.',
          'Set EMBEDDING_API_KEY and run rag_index to get started.',
        ].join('\n'),
      };
    }

    const chunkCount = this.store.count();
    const indexSize = this.store.getIndexSize();

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };

    const status = [
      'RAG Status:',
      `  Indexed files: ${this.indexedFileCount}`,
      `  Total chunks:  ${chunkCount}`,
      `  Last indexed:  ${this.lastIndexTime?.toISOString() ?? 'never'}`,
      `  Index size:    ${formatBytes(indexSize)}`,
      `  Provider:      ${this.embeddingProvider}`,
      `  Dimensions:    ${this.embeddingDimensions}`,
    ].join('\n');

    return { content: status };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools/search/rag-status.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/tools/search/rag-status.ts src/tools/search/rag-status.test.ts
git commit -m "feat: add rag_status tool for index health reporting"
```

---

### Task 8: RAG Manager — lifecycle orchestration

**Files:**
- Create: `src/intelligence/rag/rag-manager.ts`
- Create: `src/intelligence/rag/rag-manager.test.ts`

The RAG Manager ties everything together: initializes the vector store, embedding client, chunker, indexer, and hybrid search. Wires them into the tools. Handles auto-indexing on startup if configured.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/rag-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RagManager } from './rag-manager.js';
import type { StradaMcpConfig } from '../../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createTestConfig(overrides: Partial<StradaMcpConfig> = {}): StradaMcpConfig {
  return {
    transport: 'stdio',
    httpPort: 3100,
    httpHost: '127.0.0.1',
    unityBridgePort: 7691,
    unityBridgeAutoConnect: false,
    unityBridgeTimeout: 5000,
    embeddingProvider: 'gemini',
    embeddingModel: 'gemini-embedding-2-preview',
    embeddingDimensions: 128,
    embeddingApiKey: undefined,
    ragAutoIndex: false,
    ragWatchFiles: false,
    readOnly: false,
    scriptExecuteEnabled: false,
    maxFileSize: 10485760,
    logLevel: 'info',
    ...overrides,
  } as StradaMcpConfig;
}

describe('RagManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-rag-mgr-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should initialize with mock provider when no API key', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    // Should not throw — falls back gracefully
    await expect(manager.initialize(tmpDir)).resolves.not.toThrow();
    manager.shutdown();
  });

  it('should expose indexer and search after initialization', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    await manager.initialize(tmpDir);

    expect(manager.getIndexer()).toBeDefined();
    expect(manager.getHybridSearch()).toBeDefined();
    expect(manager.getStore()).toBeDefined();
    manager.shutdown();
  });

  it('should report isInitialized correctly', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    expect(manager.isInitialized()).toBe(false);
    await manager.initialize(tmpDir);
    expect(manager.isInitialized()).toBe(true);
    manager.shutdown();
  });

  it('should shut down cleanly', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    await manager.initialize(tmpDir);
    manager.shutdown();
    expect(manager.isInitialized()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/rag-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/rag-manager.ts
import path from 'node:path';
import fs from 'node:fs';
import type { StradaMcpConfig } from '../../config/config.js';
import { VectorStore } from './vector-store.js';
import {
  EmbeddingClient,
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';
import { StructuralChunker } from './chunker.js';
import { Indexer } from './indexer.js';
import { HybridSearch } from './hybrid-search.js';

/**
 * Fallback provider that generates deterministic pseudo-random vectors.
 * Used when no API key is configured — allows basic functionality
 * without external API calls (keyword search still works).
 */
class FallbackEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fallback';
  readonly maxBatchSize = 100;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) => {
        // Simple hash-based pseudo-random that is deterministic per text
        let h = 0;
        for (let j = 0; j < text.length; j++) {
          h = (h * 31 + text.charCodeAt(j) + i) | 0;
        }
        return Math.sin(h) * 0.5 + 0.5;
      }),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

export class RagManager {
  private store: VectorStore | null = null;
  private embeddingClient: EmbeddingClient | null = null;
  private chunker: StructuralChunker | null = null;
  private indexer: Indexer | null = null;
  private hybridSearch: HybridSearch | null = null;
  private initialized = false;

  constructor(
    private readonly config: StradaMcpConfig,
    private readonly storagePath: string,
  ) {}

  async initialize(projectPath: string): Promise<void> {
    const ragStoragePath = path.join(this.storagePath, '.strada-mcp', 'rag');
    if (!fs.existsSync(ragStoragePath)) {
      fs.mkdirSync(ragStoragePath, { recursive: true });
    }

    // Initialize vector store
    this.store = new VectorStore(ragStoragePath, this.config.embeddingDimensions);
    await this.store.initialize();

    // Initialize embedding client
    let provider: EmbeddingProvider;
    try {
      provider = createEmbeddingProvider(
        this.config.embeddingProvider,
        this.config.embeddingApiKey,
        this.config.embeddingModel,
      );
    } catch {
      // Fall back to deterministic pseudo-random embeddings
      provider = new FallbackEmbeddingProvider();
    }

    this.embeddingClient = new EmbeddingClient(provider, {
      dimensions: this.config.embeddingDimensions,
      rateLimit: 60, // default: 60 requests/minute
    });

    // Initialize chunker and indexer
    this.chunker = new StructuralChunker();
    this.indexer = new Indexer(this.store, this.embeddingClient, this.chunker);
    this.hybridSearch = new HybridSearch(this.store, this.embeddingClient);

    this.initialized = true;

    // Auto-index if configured
    if (this.config.ragAutoIndex) {
      await this.indexer.index(projectPath);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getStore(): VectorStore | null {
    return this.store;
  }

  getIndexer(): Indexer | null {
    return this.indexer;
  }

  getHybridSearch(): HybridSearch | null {
    return this.hybridSearch;
  }

  getEmbeddingClient(): EmbeddingClient | null {
    return this.embeddingClient;
  }

  shutdown(): void {
    if (this.store) {
      try {
        this.store.close();
      } catch { /* ignore close errors */ }
    }
    this.store = null;
    this.embeddingClient = null;
    this.chunker = null;
    this.indexer = null;
    this.hybridSearch = null;
    this.initialized = false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/rag-manager.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/rag-manager.ts src/intelligence/rag/rag-manager.test.ts
git commit -m "feat: add RAG manager for lifecycle orchestration"
```

---

### Task 9: Barrel exports + tool registration + security review

**Files:**
- Create: `src/intelligence/rag/index.ts`
- Update: `src/tools/search/index.ts` (add rag_index, rag_status)

**Step 1: Create barrel export**

```typescript
// src/intelligence/rag/index.ts
export { StructuralChunker, type CodeChunk } from './chunker.js';
export {
  EmbeddingClient,
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';
export { VectorStore, type VectorEntry, type VectorSearchResult, type ChunkMetadata } from './vector-store.js';
export { Indexer, type IndexProgress, type IndexOptions, type IndexResult } from './indexer.js';
export { HybridSearch, type HybridSearchResult } from './hybrid-search.js';
export { RagManager } from './rag-manager.js';
```

**Step 2: Update search tools barrel**

```typescript
// src/tools/search/index.ts
export { GlobSearchTool } from './glob-search.js';
export { GrepSearchTool } from './grep-search.js';
export { CodeSearchTool } from './code-search.js';
export { RagIndexTool } from './rag-index.js';
export { RagStatusTool } from './rag-status.js';
```

**Step 3: Security review checklist**

Verify:
- [ ] Embedding API key is never logged or included in tool output
- [ ] File paths passed to chunker/indexer go through path guard
- [ ] Content stored in SQLite is not returned raw without sanitization in tool output
- [ ] Credential patterns in indexed C# code are scrubbed from search results
- [ ] Vector store files (.sqlite, .hnsw) are in .gitignore

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit and push**

```bash
git add src/intelligence/rag/index.ts src/tools/search/index.ts
git commit -m "feat: add RAG barrel exports and register rag_index + rag_status tools"
git push origin main
```

**Phase 6 complete.** Deliverables:
- Structural chunker (AST-aware, class/method boundaries)
- Embedding client (Gemini, OpenAI, Ollama providers + fallback)
- HNSW vector store (hnswlib-node + SQLite metadata + content-hash dedup)
- Incremental indexer (content-hash based, progress reporting)
- Hybrid search engine (vector similarity + keyword boost)
- 3 tools: code_search, rag_index, rag_status
- RAG manager for lifecycle orchestration
- ~40 tests passing
