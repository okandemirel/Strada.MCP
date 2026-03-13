import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const textureInfoSchema = z.object({
  assetPath: z.string().describe('Asset path to the texture (e.g. Assets/Textures/wood.png)'),
});

export class TextureInfoTool extends BridgeTool {
  readonly name = 'unity_texture_info';
  readonly description = 'Get texture information including dimensions, format, compression, and size';
  protected readonly rpcMethod = 'texture.info';
  protected readonly schema = textureInfoSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as {
      path?: string;
      width?: number;
      height?: number;
      format?: string;
      compression?: string;
      mipmapCount?: number;
      sizeBytes?: number;
      isReadable?: boolean;
    };
    const sizeMB = r.sizeBytes ? (r.sizeBytes / (1024 * 1024)).toFixed(2) : '?';
    return [
      `Texture: ${r.path ?? 'unknown'}`,
      `  Dimensions: ${r.width ?? '?'} x ${r.height ?? '?'}`,
      `  Format: ${r.format ?? '?'}`,
      `  Compression: ${r.compression ?? 'none'}`,
      `  Mipmaps: ${r.mipmapCount ?? '?'}`,
      `  Size: ${sizeMB} MB`,
      `  Readable: ${r.isReadable ?? '?'}`,
      '',
      JSON.stringify(result, null, 2),
    ].join('\n');
  }
}
