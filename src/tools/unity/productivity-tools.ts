import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

abstract class JsonBridgeTool extends BridgeTool {
  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }
}

const uiQuerySchema = z.object({
  target: z.string().optional(),
  includeInactive: z.boolean().optional().default(true),
  includeToolkit: z.boolean().optional().default(true),
  includeComponents: z.boolean().optional().default(true),
  maxDepth: z.number().int().min(1).max(16).optional().default(8),
});

export class UiQueryTool extends JsonBridgeTool {
  readonly name = 'unity_ui_query';
  readonly description =
    'Query UGUI and UI Toolkit trees, interactable state, bindings, and current values in the active Unity scenes';
  protected readonly rpcMethod = 'editor.uiQuery';
  protected readonly schema = uiQuerySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

const uiActionSchema = z.object({
  target: z.string().min(1),
  system: z.enum(['auto', 'ugui', 'uitoolkit']).optional().default('auto'),
  action: z.enum(['click', 'toggle', 'setText', 'select', 'dragSlider', 'submit', 'navigate', 'focus']),
  value: z.any().optional(),
  direction: z.enum(['up', 'down', 'left', 'right', 'next', 'previous']).optional(),
  document: z.string().optional(),
});

export class UiActionTool extends JsonBridgeTool {
  readonly name = 'unity_ui_action';
  readonly description =
    'Perform high-level UI actions against UGUI or UI Toolkit controls in the Unity editor';
  protected readonly rpcMethod = 'editor.uiAction';
  protected readonly schema = uiActionSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
}

const inputSimulateSchema = z.object({
  target: z.string().optional(),
  system: z.enum(['auto', 'ugui', 'uitoolkit']).optional().default('auto'),
  action: z.enum(['mouseClick', 'keyboardText', 'submit', 'navigate']),
  text: z.string().optional(),
  direction: z.enum(['up', 'down', 'left', 'right', 'next', 'previous']).optional(),
});

export class InputSimulateTool extends JsonBridgeTool {
  readonly name = 'unity_input_simulate';
  readonly description =
    'Simulate high-level UI input such as clicks, text entry, submit, and navigation inside the Unity editor';
  protected readonly rpcMethod = 'editor.inputSimulate';
  protected readonly schema = inputSimulateSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
}

const cameraManageSchema = z.object({
  action: z.enum(['list', 'get', 'set', 'create', 'delete', 'attachCinemachineBrain']),
  target: z.string().optional(),
  name: z.string().optional(),
  settings: z.object({}).passthrough().optional(),
});

export class CameraManageTool extends JsonBridgeTool {
  readonly name = 'unity_camera_manage';
  readonly description =
    'Inspect and control Unity cameras, including common camera settings and optional Cinemachine brain attachment';
  protected readonly rpcMethod = 'editor.cameraManage';
  protected readonly schema = cameraManageSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'list' || input.action === 'get';
  }
}

const graphicsManageSchema = z.object({
  action: z.enum(['get', 'set', 'bakeLighting']),
  settings: z.object({}).passthrough().optional(),
});

export class GraphicsManageTool extends JsonBridgeTool {
  readonly name = 'unity_graphics_manage';
  readonly description =
    'Read and update Unity render pipeline, fog, ambient, lighting, and quality-related graphics settings';
  protected readonly rpcMethod = 'editor.graphicsManage';
  protected readonly schema = graphicsManageSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory = 'unity-config' as const;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }
}

const addressablesManageSchema = z.object({
  action: z.enum([
    'status',
    'listGroups',
    'listEntries',
    'listProfiles',
    'setActiveProfile',
    'createGroup',
    'addEntry',
    'moveEntry',
    'build',
    'diagnostics',
  ]),
  groupName: z.string().optional(),
  assetPath: z.string().optional(),
  address: z.string().optional(),
  profileName: z.string().optional(),
  labels: z.array(z.string()).optional().default([]),
  readOnly: z.boolean().optional().default(false),
  createIfMissing: z.boolean().optional().default(false),
});

export class AddressablesManageTool extends JsonBridgeTool {
  readonly name = 'unity_addressables_manage';
  readonly description =
    'Manage Unity Addressables groups, entries, profiles, builds, and diagnostics when the Addressables package is installed';
  protected readonly rpcMethod = 'editor.addressablesManage';
  protected readonly schema = addressablesManageSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory = 'unity-asset' as const;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return ['status', 'listGroups', 'listEntries', 'listProfiles', 'diagnostics'].includes(
      String(input.action ?? ''),
    );
  }
}

const importSettingsManageSchema = z.object({
  action: z.enum(['get', 'set', 'reimport']),
  assetPath: z.string().min(1),
  settings: z.object({}).passthrough().optional(),
});

export class ImportSettingsManageTool extends JsonBridgeTool {
  readonly name = 'unity_import_settings_manage';
  readonly description =
    'Read, update, and reimport Unity texture, model, and audio importer settings for a given asset path';
  protected readonly rpcMethod = 'editor.importSettingsManage';
  protected readonly schema = importSettingsManageSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory = 'unity-asset' as const;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }
}
