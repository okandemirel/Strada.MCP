import { EventEmitter } from 'node:events';
import {
  UnityEventSchema,
  type UnityEvent,
  type UnityEventType,
  type JsonRpcNotificationType,
} from './protocol.js';
import type { BridgeClient } from './bridge-client.js';

const MAX_BUFFER_PER_TYPE = 100;

const ALL_EVENT_TYPES: UnityEventType[] = [
  'SceneChanged',
  'ConsoleLine',
  'CompileStarted',
  'CompileFinished',
  'PlayModeChanged',
  'SelectionChanged',
];

export class EventHandler extends EventEmitter {
  private static readonly METHOD_TO_EVENT: Record<string, UnityEventType> = {
    'unity.sceneChanged': 'SceneChanged',
    'unity.consoleMessage': 'ConsoleLine',
    'unity.compileStarted': 'CompileStarted',
    'unity.compileFinished': 'CompileFinished',
    'unity.playModeChanged': 'PlayModeChanged',
    'unity.selectionChanged': 'SelectionChanged',
  };

  private readonly recentEvents = new Map<UnityEventType, UnityEvent[]>();

  constructor(private readonly client: BridgeClient) {
    super();

    // Initialize buffers
    for (const type of ALL_EVENT_TYPES) {
      this.recentEvents.set(type, []);
    }

    // Listen for notifications from the bridge client
    this.client.on('notification', (notification: JsonRpcNotificationType) => {
      this.handleNotification(notification);
    });
  }

  /**
   * Returns recent events, optionally filtered by type.
   */
  getRecentEvents(type?: UnityEventType): UnityEvent[] {
    if (type) {
      return [...(this.recentEvents.get(type) ?? [])];
    }

    // Return all events across all types, sorted by timestamp
    const all: UnityEvent[] = [];
    for (const events of this.recentEvents.values()) {
      all.push(...events);
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clears the event buffer, optionally for a specific type.
   */
  clearEvents(type?: UnityEventType): void {
    if (type) {
      this.recentEvents.set(type, []);
    } else {
      for (const t of ALL_EVENT_TYPES) {
        this.recentEvents.set(t, []);
      }
    }
  }

  /**
   * Removes listeners and clears buffers.
   */
  destroy(): void {
    this.client.removeAllListeners('notification');
    this.removeAllListeners();
    this.clearEvents();
  }

  private handleNotification(notification: JsonRpcNotificationType): void {
    if (!notification.params) return;

    // Try direct parsing first (params already has type field)
    const directResult = UnityEventSchema.safeParse(notification.params);
    if (directResult.success) {
      this.bufferAndEmit(directResult.data as UnityEvent);
      return;
    }

    // Extract type from notification.method (C# EventBroadcaster format)
    const eventType = EventHandler.METHOD_TO_EVENT[notification.method];
    if (!eventType) return;

    const timestamp = typeof notification.params.timestamp === 'number'
      ? notification.params.timestamp
      : Date.now();

    const data = { ...notification.params } as Record<string, unknown>;
    delete data.timestamp;

    this.bufferAndEmit({ type: eventType, timestamp, data });
  }

  private bufferAndEmit(event: UnityEvent): void {
    const buffer = this.recentEvents.get(event.type);
    if (buffer) {
      buffer.push(event);
      while (buffer.length > MAX_BUFFER_PER_TYPE) {
        buffer.shift();
      }
    }
    this.emit(event.type, event);
    this.emit('event', event);
  }
}
