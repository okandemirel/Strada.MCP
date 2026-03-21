import { z } from 'zod';

// --- JSON-RPC 2.0 Message Schemas ---

export const JsonRpcId = z.union([z.number(), z.string()]);
export type JsonRpcIdType = z.infer<typeof JsonRpcId>;

export const JsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: JsonRpcId,
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcRequestType = z.infer<typeof JsonRpcRequest>;

export const JsonRpcError = z.object({
  code: z.number(),
  message: z.string(),
  data: z.any().optional(),
});
export type JsonRpcErrorType = z.infer<typeof JsonRpcError>;

export const JsonRpcResponse = z.object({
  jsonrpc: z.literal('2.0'),
  id: JsonRpcId.nullable(),
  result: z.unknown().optional(),
  error: JsonRpcError.optional(),
});
export type JsonRpcResponseType = z.infer<typeof JsonRpcResponse>;

export const JsonRpcNotification = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict(); // strict() rejects extra fields like 'id'
export type JsonRpcNotificationType = z.infer<typeof JsonRpcNotification>;

// --- Error Codes ---

export const ErrorCode = {
  // Standard JSON-RPC
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Unity-specific (-32000 to -32099)
  UnityNotReady: -32000,
  GameObjectNotFound: -32001,
  ComponentNotFound: -32002,
  SceneNotLoaded: -32003,
  CompileError: -32004,
  PlayModeRequired: -32005,
  EditModeRequired: -32006,
  AssetNotFound: -32007,
  PermissionDenied: -32008,
  Timeout: -32009,
} as const;

// --- Unity Event Types ---

export type UnityEventType =
  | 'SceneChanged'
  | 'ConsoleLine'
  | 'CompileStarted'
  | 'CompileFinished'
  | 'PlayModeChanged'
  | 'SelectionChanged';

export interface UnityEvent {
  type: UnityEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export const UnityEventSchema = z.object({
  type: z.enum([
    'SceneChanged',
    'ConsoleLine',
    'CompileStarted',
    'CompileFinished',
    'PlayModeChanged',
    'SelectionChanged',
  ]),
  timestamp: z.number(),
  data: z.record(z.string(), z.unknown()),
});

// --- Message Parsing ---

export type ParsedMessage =
  | { type: 'request'; message: JsonRpcRequestType }
  | { type: 'response'; message: JsonRpcResponseType }
  | { type: 'notification'; message: JsonRpcNotificationType };

export function normalizeJsonRpcId(id: JsonRpcIdType | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }

  return String(id);
}

export function parseJsonRpcMessage(raw: string): ParsedMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw.substring(0, 100)}`);
  }

  // Try notification first (stricter -- no 'id' field)
  const notifResult = JsonRpcNotification.safeParse(parsed);
  if (notifResult.success) {
    return { type: 'notification', message: notifResult.data };
  }

  // Try response (has 'result' or 'error', has 'id')
  const respResult = JsonRpcResponse.safeParse(parsed);
  if (
    respResult.success &&
    (respResult.data.result !== undefined || respResult.data.error !== undefined)
  ) {
    return { type: 'response', message: respResult.data };
  }

  // Try request (has 'method' and 'id')
  const reqResult = JsonRpcRequest.safeParse(parsed);
  if (reqResult.success) {
    return { type: 'request', message: reqResult.data };
  }

  throw new Error(`Unrecognized JSON-RPC message: ${raw.substring(0, 200)}`);
}

// --- Message Factory ---

let nextRequestId = 1;

export function createRequest(
  method: string,
  params: Record<string, unknown>,
): JsonRpcRequestType {
  return {
    jsonrpc: '2.0',
    id: nextRequestId++,
    method,
    params,
  };
}

export function createNotification(
  method: string,
  params: Record<string, unknown>,
): JsonRpcNotificationType {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

/**
 * Resets the request ID counter. Only used in tests.
 */
export function resetRequestIdCounter(): void {
  nextRequestId = 1;
}
