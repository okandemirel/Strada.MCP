import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import {
  StradaContainerGraphResource,
  StradaHotReloadResource,
  StradaModuleGraphResource,
  StradaSystemProfileResource,
  StradaValidationReportResource,
} from './live-resources.js';

function createMockBridgeClient(
  responses: Record<string, unknown> = {},
): BridgeClient {
  return {
    request: vi.fn(async (method: string) => responses[method]),
  } as unknown as BridgeClient;
}

describe('Strada live resources', () => {
  let moduleGraph: StradaModuleGraphResource;
  let containerGraph: StradaContainerGraphResource;
  let systemProfile: StradaSystemProfileResource;
  let hotReload: StradaHotReloadResource;
  let validationReport: StradaValidationReportResource;

  beforeEach(() => {
    moduleGraph = new StradaModuleGraphResource();
    containerGraph = new StradaContainerGraphResource();
    systemProfile = new StradaSystemProfileResource();
    hotReload = new StradaHotReloadResource();
    validationReport = new StradaValidationReportResource();
  });

  it('should require a bridge connection', async () => {
    await expect(moduleGraph.read()).rejects.toThrow('Unity bridge not connected');
  });

  it('should fetch live Strada resources through the bridge', async () => {
    const client = createMockBridgeClient({
      'strada.moduleGraph': { moduleCount: 2 },
      'strada.containerGraph': { summary: { registrationCount: 3 } },
      'strada.systemProfile': { metrics: [] },
      'strada.hotReload': { enabled: true },
      'strada.validationReport': { architecture: {}, modules: {} },
    });

    moduleGraph.setBridgeClient(client);
    containerGraph.setBridgeClient(client);
    systemProfile.setBridgeClient(client);
    hotReload.setBridgeClient(client);
    validationReport.setBridgeClient(client);

    expect(JSON.parse((await moduleGraph.read()).text).moduleCount).toBe(2);
    expect(JSON.parse((await containerGraph.read()).text).summary.registrationCount).toBe(3);
    expect(JSON.parse((await systemProfile.read()).text).metrics).toEqual([]);
    expect(JSON.parse((await hotReload.read()).text).enabled).toBe(true);
    expect(JSON.parse((await validationReport.read()).text).architecture).toBeDefined();
  });
});
