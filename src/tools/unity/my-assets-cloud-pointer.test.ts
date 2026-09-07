/**
 * The local cache is not the library. Measured 2026-09-07: "Nothing here
 * fits, so generating or importing is the right call" ended a sprint's search
 * while the account held 511 purchased packages behind unity_my_assets_cloud.
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { MyAssetsTool } from './my-assets.js';

describe('unity_my_assets points at the purchased library', () => {
  it('names unity_my_assets_cloud in its description and whenever nothing downloaded matches', async () => {
    const tool = new MyAssetsTool();
    expect(tool.description).toContain('unity_my_assets_cloud');
    const r = await tool.execute(
      { query: 'zzzquux-nothing-owned-matches-this' },
      { projectPath: tmpdir(), workingDirectory: tmpdir(), readOnly: false } as never,
    );
    // Either branch — an empty cache or a cache with no match — must point there.
    expect(String(r.content)).toContain('unity_my_assets_cloud');
  });
});
