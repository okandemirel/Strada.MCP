import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnityProfilerTool } from './unity-profiler.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockBridge(response?: unknown): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue(response ?? { success: true, result: {} }),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

describe('UnityProfilerTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: UnityProfilerTool;
  let bridge: BridgeClient;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    bridge = createMockBridge();
    tool = new UnityProfilerTool();
    tool.setBridgeClient(bridge);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_profiler');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should start profiling', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { status: 'recording' },
    });

    const result = await tool.execute(
      { action: 'start' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('recording');
    expect(bridge.request).toHaveBeenCalledWith(
      'profiler.start',
      expect.any(Object),
    );
  });

  it('should stop profiling', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { status: 'stopped', framesRecorded: 300 },
    });

    const result = await tool.execute(
      { action: 'stop' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('stopped');
  });

  it('should get frame data', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: {
        frames: [
          {
            frameIndex: 0,
            cpuTimeMs: 16.5,
            gpuTimeMs: 12.3,
            drawCalls: 150,
            triangles: 50000,
            memoryMB: 512.4,
          },
          {
            frameIndex: 1,
            cpuTimeMs: 15.2,
            gpuTimeMs: 11.8,
            drawCalls: 148,
            triangles: 49800,
            memoryMB: 512.5,
          },
        ],
      },
    });

    const result = await tool.execute(
      { action: 'getFrameData', frameCount: 2 },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.frames[0].cpuTimeMs).toBe(16.5);
    expect(parsed.frames[0].drawCalls).toBe(150);
  });

  it('should get performance summary', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: {
        summary: {
          avgCpuMs: 15.8,
          avgGpuMs: 12.0,
          maxCpuMs: 25.3,
          maxGpuMs: 18.7,
          avgFps: 63.2,
          minFps: 39.5,
          totalAllocatedMB: 1024.0,
          gcCollections: 3,
          avgDrawCalls: 149,
          avgTriangles: 49900,
          frameCount: 300,
          hotFunctions: [
            { name: 'Physics.Simulate', avgMs: 4.2, percentage: 26.6 },
            { name: 'Camera.Render', avgMs: 3.8, percentage: 24.1 },
          ],
        },
      },
    });

    const result = await tool.execute(
      { action: 'getSummary' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.summary.avgFps).toBeCloseTo(63.2, 1);
    expect(parsed.summary.hotFunctions).toHaveLength(2);
    expect(parsed.summary.hotFunctions[0].name).toBe('Physics.Simulate');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'start' },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should default frameCount to 60', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { frames: [] },
    });

    await tool.execute({ action: 'getFrameData' }, ctx);
    expect(bridge.request).toHaveBeenCalledWith(
      'profiler.getFrameData',
      expect.objectContaining({ frameCount: 60 }),
    );
  });

  it('should handle profiler not recording error', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Profiler is not currently recording',
    });

    const result = await tool.execute(
      { action: 'getFrameData' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not currently recording');
  });

  it('should clamp frameCount to valid range', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { frames: [] },
    });

    await tool.execute({ action: 'getFrameData', frameCount: 5000 }, ctx);
    expect(bridge.request).toHaveBeenCalledWith(
      'profiler.getFrameData',
      expect.objectContaining({ frameCount: 2000 }),
    );
  });
});
