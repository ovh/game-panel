import { EventEmitter } from 'events';

/**
 * Global in-process event bus.
 * - REST handlers and services emit domain events here
 * - WebSocket layer subscribes and pushes them to connected clients
 */
export const bus = new EventEmitter();

// Avoid MaxListeners warnings when you have many connected clients.
bus.setMaxListeners(0);
