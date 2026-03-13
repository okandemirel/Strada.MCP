export interface LocalSearchResult {
  source: 'local';
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

export interface BrainSearchResult {
  source: 'brain';
  content: string;
  score: number;
  brainSource: string;
  /** Optional file path for deduplication */
  filePath?: string;
}

export interface MergedSearchResult {
  source: 'local' | 'brain';
  score: number;
  filePath?: string;
  name?: string;
  namespace?: string;
  type?: string;
  parentClass?: string;
  startLine?: number;
  endLine?: number;
  snippet: string;
  brainSource?: string;
}

/**
 * Merges local HNSW search results with Brain memory search results.
 *
 * Merge strategy:
 * 1. Normalize all scores to 0-1 range
 * 2. Deduplicate by file path (local wins — has richer metadata)
 * 3. Sort by score descending
 * 4. Cap at requested limit
 */
export class ResultMerger {
  /**
   * Merge local and brain results into a single ranked list.
   *
   * @param local - Results from local HNSW vector store
   * @param brain - Results from Brain memory search
   * @param limit - Maximum number of results to return
   * @returns Merged, deduplicated, score-sorted results
   */
  merge(
    local: LocalSearchResult[],
    brain: BrainSearchResult[],
    limit: number,
  ): MergedSearchResult[] {
    // Convert local results to merged format
    const localMerged: MergedSearchResult[] = local.map((r) => ({
      source: 'local' as const,
      score: this.clampScore(r.score),
      filePath: r.filePath,
      name: r.name,
      namespace: r.namespace,
      type: r.type,
      parentClass: r.parentClass,
      startLine: r.startLine,
      endLine: r.endLine,
      snippet: r.snippet,
    }));

    // Convert brain results to merged format
    const brainMerged: MergedSearchResult[] = brain.map((r) => ({
      source: 'brain' as const,
      score: this.clampScore(r.score),
      filePath: r.filePath,
      snippet: r.content,
      brainSource: r.brainSource,
    }));

    // Deduplicate by file path (local wins)
    const localFilePaths = new Set(
      localMerged
        .filter((r) => r.filePath)
        .map((r) => r.filePath),
    );

    const dedupedBrain = brainMerged.filter(
      (r) => !r.filePath || !localFilePaths.has(r.filePath),
    );

    // Combine, sort by score, and cap
    const all = [...localMerged, ...dedupedBrain];
    all.sort((a, b) => b.score - a.score);

    return all.slice(0, limit);
  }

  /**
   * Clamp score to valid 0-1 range.
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }
}
