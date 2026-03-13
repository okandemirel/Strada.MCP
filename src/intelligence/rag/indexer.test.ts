import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
