import { createRequire } from 'module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

// Native CJS modules — use createRequire for ESM compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HierarchicalNSW } = require('hnswlib-node');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');

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
  private db!: InstanceType<typeof Database>;
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
