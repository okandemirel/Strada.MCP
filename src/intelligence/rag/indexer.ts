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
