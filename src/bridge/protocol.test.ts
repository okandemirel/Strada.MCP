import { describe, it, expect } from 'vitest';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  parseJsonRpcMessage,
  createRequest,
  createNotification,
  ErrorCode,
  type UnityEvent,
} from './protocol.js';

describe('JSON-RPC Protocol Types', () => {
  describe('JsonRpcRequest', () => {
    it('should validate a correct request', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.createGameObject', params: { name: 'Cube' } };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should reject request without jsonrpc version', () => {
      const msg = { id: 1, method: 'test' };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it('should reject request without method', () => {
      const msg = { jsonrpc: '2.0', id: 1 };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it('should accept request without params', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.getState' };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should accept string ids', () => {
      const msg = { jsonrpc: '2.0', id: 'req-42', method: 'test', params: {} };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe('JsonRpcResponse', () => {
    it('should validate a success response', () => {
      const msg = { jsonrpc: '2.0', id: 1, result: { name: 'Cube' } };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should validate an error response', () => {
      const msg = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should validate error with data field', () => {
      const msg = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'Not found', data: { path: '/missing' } },
      };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe('JsonRpcNotification', () => {
    it('should validate a notification (no id)', () => {
      const msg = { jsonrpc: '2.0', method: 'unity.event', params: { type: 'SceneChanged' } };
      const result = JsonRpcNotification.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should reject notification with id', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.event', params: {} };
      // Notifications must NOT have an id field
      const result = JsonRpcNotification.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe('parseJsonRpcMessage', () => {
    it('should parse a request', () => {
      const raw = '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('request');
    });

    it('should parse a response with result', () => {
      const raw = '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('response');
    });

    it('should parse a notification', () => {
      const raw = '{"jsonrpc":"2.0","method":"unity.event","params":{"type":"SceneChanged"}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('notification');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJsonRpcMessage('not json')).toThrow();
    });

    it('should throw on unrecognized message format', () => {
      expect(() => parseJsonRpcMessage('{"foo":"bar"}')).toThrow();
    });
  });

  describe('createRequest', () => {
    it('should create a valid request with auto-incrementing id', () => {
      const req1 = createRequest('unity.play', { mode: 'play' });
      const req2 = createRequest('unity.pause', {});
      expect(req1.jsonrpc).toBe('2.0');
      expect(req1.method).toBe('unity.play');
      expect(req1.params).toEqual({ mode: 'play' });
      expect(typeof req1.id).toBe('number');
      expect(req2.id).toBe((req1.id as number) + 1);
    });
  });

  describe('createNotification', () => {
    it('should create a valid notification without id', () => {
      const notif = createNotification('unity.ping', {});
      expect(notif.jsonrpc).toBe('2.0');
      expect(notif.method).toBe('unity.ping');
      expect(notif).not.toHaveProperty('id');
    });
  });

  describe('ErrorCode', () => {
    it('should define standard JSON-RPC error codes', () => {
      expect(ErrorCode.ParseError).toBe(-32700);
      expect(ErrorCode.InvalidRequest).toBe(-32600);
      expect(ErrorCode.MethodNotFound).toBe(-32601);
      expect(ErrorCode.InvalidParams).toBe(-32602);
      expect(ErrorCode.InternalError).toBe(-32603);
    });

    it('should define Unity-specific error codes', () => {
      expect(ErrorCode.UnityNotReady).toBeDefined();
      expect(ErrorCode.GameObjectNotFound).toBeDefined();
      expect(ErrorCode.ComponentNotFound).toBeDefined();
      expect(ErrorCode.SceneNotLoaded).toBeDefined();
      expect(ErrorCode.CompileError).toBeDefined();
    });
  });
});
