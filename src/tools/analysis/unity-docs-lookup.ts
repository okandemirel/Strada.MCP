import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';

const inputSchema = z.object({
  symbol: z.string().optional().describe('Unity ScriptReference symbol, for example Transform or Rigidbody.AddForce'),
  manualPage: z.string().optional().describe('Unity Manual page slug, for example class-PlayerSettings'),
  url: z.string().url().optional().describe('Direct official docs URL to fetch'),
  version: z.string().optional().default('6000.0'),
  kind: z.enum(['auto', 'script-reference', 'manual']).optional().default('auto'),
});

export class UnityDocsLookupTool implements ITool {
  readonly name = 'unity_docs_lookup';
  readonly description =
    'Fetch and cache official Unity documentation pages, returning title, description, excerpt, and the resolved docs URL';
  readonly inputSchema = zodToJsonSchema(inputSchema);
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();

    try {
      const parsed = inputSchema.parse(input);
      const candidates = buildCandidateUrls(parsed);
      if (candidates.length === 0) {
        return {
          content: 'Provide symbol, manualPage, or url.',
          isError: true,
        };
      }

      const cacheDirectory = path.join(context.projectPath, 'Library', 'StradaMcpCache', 'unity-docs');
      await fs.mkdir(cacheDirectory, { recursive: true });

      let lastError: Error | null = null;
      for (const url of candidates) {
        try {
          const payload = await readCachedOrFetch(url, cacheDirectory);
          const elapsed = Math.round(performance.now() - start);
          return {
            content: JSON.stringify({
              backend: 'official-docs-fetch',
              authority: 'official',
              ...payload,
            }, null, 2),
            metadata: { executionTimeMs: elapsed },
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      return {
        content: JSON.stringify({
          backend: 'official-docs-fetch',
          authority: 'official',
          searched: candidates,
          error: lastError?.message ?? 'Unity docs lookup failed.',
        }, null, 2),
        isError: true,
        metadata: { executionTimeMs: Math.round(performance.now() - start) },
      };
    } catch (error) {
      return {
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  }
}

function buildCandidateUrls(input: z.infer<typeof inputSchema>): string[] {
  if (input.url) {
    if (!input.url.startsWith('https://docs.unity3d.com/')) {
      throw new Error('unity_docs_lookup only supports official https://docs.unity3d.com URLs.');
    }
    return [input.url];
  }

  const version = encodeURIComponent(input.version);
  const candidates: string[] = [];

  if ((input.kind === 'auto' || input.kind === 'script-reference') && input.symbol) {
    const symbol = encodeURIComponent(input.symbol);
    candidates.push(
      `https://docs.unity3d.com/${version}/Documentation/ScriptReference/${symbol}.html`,
      `https://docs.unity3d.com/ScriptReference/${symbol}.html`,
    );
  }

  if ((input.kind === 'auto' || input.kind === 'manual') && input.manualPage) {
    const slug = encodeURIComponent(input.manualPage);
    candidates.push(
      `https://docs.unity3d.com/${version}/Documentation/Manual/${slug}.html`,
      `https://docs.unity3d.com/Manual/${slug}.html`,
    );
  }

  return [...new Set(candidates)];
}

async function readCachedOrFetch(url: string, cacheDirectory: string): Promise<Record<string, unknown>> {
  const key = createHash('sha1').update(url).digest('hex');
  const cacheFile = path.join(cacheDirectory, `${key}.json`);

  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as Record<string, unknown>;
    return {
      ...cached,
      cached: true,
    };
  } catch {
    // cache miss
  }

  const response = await fetch(url, {
    headers: {
      'user-agent': 'strada-mcp/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const title = match(html, /<title>([^<]+)<\/title>/i);
  const description = match(html, /<meta\s+name="description"\s+content="([^"]+)"/i)
    ?? match(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i);
  const heading = match(html, /<h1[^>]*>(.*?)<\/h1>/is);
  const excerptSource = extractMainContent(html);
  const excerpt = stripHtml(excerptSource).replace(/\s+/g, ' ').trim().slice(0, 1200);

  const payload = {
    resolvedUrl: response.url,
    title: title ? stripHtml(title).trim() : null,
    heading: heading ? stripHtml(heading).trim() : null,
    description: description ? decodeEntities(description).trim() : null,
    excerpt,
    cached: false,
  };

  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function extractMainContent(html: string): string {
  return match(html, /<main[^>]*>([\s\S]*?)<\/main>/i)
    ?? match(html, /<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? html;
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function match(value: string, expression: RegExp): string | null {
  return expression.exec(value)?.[1] ?? null;
}
