import { toJSONSchema } from 'zod';
import type { z } from 'zod';

/**
 * Converts a Zod schema to a JSON Schema object suitable for MCP tool inputSchema.
 * Thin wrapper around Zod v4's built-in toJSONSchema, stripping the $schema key.
 */
export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const jsonSchema = toJSONSchema(schema) as Record<string, unknown>;
  // Remove $schema key — MCP doesn't need it in tool inputSchema
  const { $schema: _, ...rest } = jsonSchema;
  return rest;
}
