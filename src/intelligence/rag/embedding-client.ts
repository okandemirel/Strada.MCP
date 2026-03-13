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
