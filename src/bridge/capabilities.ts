import { z } from 'zod';

export const BridgeCapabilityManifest = z.object({
  manifestVersion: z.number().int().min(1),
  bridgeVersion: z.string(),
  protocolVersion: z.string().default('2.0'),
  supportedMethods: z.array(z.string()).default([]),
  supportedFeatures: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BridgeCapabilityManifestType = z.infer<typeof BridgeCapabilityManifest>;

export function supportsBridgeMethod(
  manifest: BridgeCapabilityManifestType | null | undefined,
  method: string,
): boolean {
  if (!manifest) {
    return false;
  }

  return manifest.supportedMethods.includes(method);
}

export function supportsBridgeFeature(
  manifest: BridgeCapabilityManifestType | null | undefined,
  feature: string,
): boolean {
  if (!manifest) {
    return false;
  }

  return manifest.supportedFeatures.includes(feature);
}
