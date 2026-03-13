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
