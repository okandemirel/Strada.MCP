import { describe, it, expect } from 'vitest';
import {
  ResultMerger,
  type MergedSearchResult,
  type LocalSearchResult,
  type BrainSearchResult,
} from './result-merger.js';

function makeLocalResult(name: string, score: number, filePath: string): LocalSearchResult {
  return {
    source: 'local',
    score,
    filePath,
    name,
    namespace: 'Game',
    type: 'class',
    parentClass: undefined,
    startLine: 1,
    endLine: 20,
    snippet: `public class ${name} { }`,
  };
}

function makeBrainResult(content: string, score: number, source: string = 'memory'): BrainSearchResult {
  return {
    source: 'brain',
    content,
    score,
    brainSource: source,
  };
}

describe('ResultMerger', () => {
  const merger = new ResultMerger();

  it('should return local-only results when no brain results', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
      makeLocalResult('MovementSystem', 0.7, 'Movement.cs'),
    ];

    const merged = merger.merge(local, [], 10);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('local');
    expect(merged[0].name).toBe('HealthSystem');
  });

  it('should interleave local and brain results by score', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
      makeLocalResult('MovementSystem', 0.5, 'Movement.cs'),
    ];

    const brain: BrainSearchResult[] = [
      makeBrainResult('Health is an IComponent for entity HP', 0.85),
      makeBrainResult('Movement handles velocity updates', 0.4),
    ];

    const merged = merger.merge(local, brain, 10);
    expect(merged).toHaveLength(4);

    // Should be sorted by score descending
    expect(merged[0].score).toBe(0.9);
    expect(merged[1].score).toBe(0.85);
    expect(merged[2].score).toBe(0.5);
    expect(merged[3].score).toBe(0.4);
  });

  it('should cap results at the requested limit', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('A', 0.9, 'a.cs'),
      makeLocalResult('B', 0.8, 'b.cs'),
      makeLocalResult('C', 0.7, 'c.cs'),
    ];
    const brain: BrainSearchResult[] = [
      makeBrainResult('D content', 0.85),
      makeBrainResult('E content', 0.75),
    ];

    const merged = merger.merge(local, brain, 3);
    expect(merged).toHaveLength(3);
    expect(merged[0].score).toBe(0.9);
    expect(merged[1].score).toBe(0.85);
    expect(merged[2].score).toBe(0.8);
  });

  it('should deduplicate by file path (local wins over brain)', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Assets/Scripts/Health.cs'),
    ];

    const brain: BrainSearchResult[] = [
      {
        source: 'brain',
        content: 'HealthSystem handles HP',
        score: 0.95,
        brainSource: 'memory',
        filePath: 'Assets/Scripts/Health.cs', // Same file path
      },
    ];

    const merged = merger.merge(local, brain, 10);
    // Should deduplicate: keep the local version (higher detail)
    const healthResults = merged.filter(
      (r) => r.filePath === 'Assets/Scripts/Health.cs',
    );
    expect(healthResults).toHaveLength(1);
    expect(healthResults[0].source).toBe('local');
  });

  it('should handle empty local results', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Some memory content', 0.8),
    ];

    const merged = merger.merge([], brain, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('brain');
  });

  it('should handle both empty', () => {
    const merged = merger.merge([], [], 10);
    expect(merged).toEqual([]);
  });

  it('should preserve metadata from local results', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
    ];

    const merged = merger.merge(local, [], 10);
    expect(merged[0].name).toBe('HealthSystem');
    expect(merged[0].namespace).toBe('Game');
    expect(merged[0].type).toBe('class');
    expect(merged[0].startLine).toBe(1);
    expect(merged[0].endLine).toBe(20);
  });

  it('should preserve content from brain results', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Detailed memory about combat system', 0.85),
    ];

    const merged = merger.merge([], brain, 10);
    expect(merged[0].snippet).toBe('Detailed memory about combat system');
    expect(merged[0].brainSource).toBe('memory');
  });

  it('should normalize brain scores to 0-1 range', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Result with high raw score', 1.5),
      makeBrainResult('Result with negative score', -0.2),
    ];

    const merged = merger.merge([], brain, 10);
    for (const result of merged) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});
