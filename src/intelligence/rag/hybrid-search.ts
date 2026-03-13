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
