import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema for MCP tool inputSchema.
 * Uses Zod v4's built-in toJSONSchema when available.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
