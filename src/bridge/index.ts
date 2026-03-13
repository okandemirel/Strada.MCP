export {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  UnityEventSchema,
  ErrorCode,
  parseJsonRpcMessage,
  createRequest,
  createNotification,
  resetRequestIdCounter,
  type JsonRpcRequestType,
  type JsonRpcResponseType,
  type JsonRpcNotificationType,
  type JsonRpcErrorType,
  type UnityEvent,
  type UnityEventType,
  type ParsedMessage,
} from './protocol.js';

export {
  ConnectionManager,
  ConnectionState,
  type ConnectionManagerOptions,
  type ConnectionManagerEvents,
} from './connection-manager.js';

export { BridgeClient, type BridgeClientOptions } from './bridge-client.js';

export { EventHandler } from './event-handler.js';

export { BridgeManager, type BridgeManagerOptions } from './bridge-manager.js';
