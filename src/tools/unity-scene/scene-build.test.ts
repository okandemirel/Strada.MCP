/**
 * What the scene builder tool must promise before it ever launches Unity.
 *
 * The measured failure it exists to prevent: a 104-minute run that produced
 * nine modules, fifty C# files and sixteen test assemblies, and no scene, no
 * prefab and no wiring — reported as a success. Two properties keep that from
 * recurring, and both are asserted here rather than assumed: the tool must be
 * offered when no Editor is connected (a bridge-requiring tool is removed from
 * the toolchain outright, so it could never run on the path it was built for),
 * and a scene it could not assemble must come back as an error rather than as
 * prose the model can read optimistically.
 */

import { describe, it, expect } from 'vitest';
import { SceneBuildTool } from './scene-build.js';
import type { ToolContext } from '../tool.interface.js';

const ctx = (over: Partial<ToolContext> = {}): ToolContext =>
  ({ projectPath: '/tmp/no-such-project', readOnly: false, ...over }) as ToolContext;

describe('unity_scene_build', () => {
  const tool = new SceneBuildTool();

  it('is offered with no editor bridge connected', () => {
    // The load-bearing line. ToolRegistry drops requiresBridge tools when no
    // bridge is up, so claiming to need one would hide this from the agent on
    // exactly the runs it is meant for.
    expect(tool.metadata.requiresBridge).toBe(false);
  });

  it('is declared as a write tool so the write gates apply to it', () => {
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('allows enough time for a cold Library and a compile', () => {
    expect(tool.metadata.timeoutMs ?? 0).toBeGreaterThanOrEqual(300_000);
  });

  it('refuses in read-only mode', async () => {
    const result = await tool.execute({ spec: {} }, ctx({ readOnly: true }));
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/read-only/i);
  });

  it('refuses when given neither a spec nor a spec path', async () => {
    const result = await tool.execute({}, ctx());
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/spec/i);
  });

  it('refuses when a specPath does not exist', async () => {
    const result = await tool.execute({ specPath: '/tmp/nothing-here.json' }, ctx());
    expect(result.isError).toBe(true);
  });

  it('refuses when there is no project path anywhere', async () => {
    const result = await tool.execute({ spec: {} }, ctx({ projectPath: undefined }));
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/projectPath/i);
  });

  it('describes the spec shape in its own schema', async () => {
    // The agent writes this document from the schema alone; if the schema does
    // not say how a reference is expressed, the agent invents an encoding.
    const props = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props['spec']?.description).toMatch(/reference/i);
    expect(props['spec']?.description).toMatch(/assets/);
    expect(props['spec']?.description).toMatch(/objects/);
  });
});
