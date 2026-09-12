import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const RECONNECT_DELAYS_MS = [5000, 10000, 30000]; // backoff giống mcpBridge.js phía plugin

/**
 * Kết nối tới WS bridge đang chạy sẵn như một "controller".
 * Trả về object có interface giống createWsBridge() để mcp-server.js dùng được cả hai.
 *
 * Tự động reconnect (backoff 5s→10s→30s) nếu bridge chính (--watch) restart giữa chừng —
 * nếu không, controller chết vĩnh viễn cho tới khi restart lại toàn bộ tiến trình MCP.
 */
export function createWsBridgeClient(port, connectTimeoutMs = 5000) {
  const pending = new Map(); // id → { resolve, reject, timeoutId }
  let ws = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt++;
    console.error(`[WS-CLIENT] Reconnecting to :${port} sau ${delay / 1000}s...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    const socket = new WebSocket(`ws://localhost:${port}`);
    ws = socket;

    socket.on('open', () => {
      reconnectAttempt = 0;
      socket.send(JSON.stringify({ type: 'controller' }));
      console.error(`[WS-CLIENT] Connected to existing bridge as controller on :${port}`);
    });

    socket.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      const entry = pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timeoutId);
      pending.delete(msg.id);
      if (msg.success) entry.resolve(msg.data);
      else entry.reject(new Error(msg.error ?? 'Unknown error from plugin'));
    });

    socket.on('error', (err) => {
      console.error(`[WS-CLIENT] Socket error: ${err.message}`);
    });

    socket.on('close', () => {
      console.error('[WS-CLIENT] Disconnected from bridge');
      for (const [, entry] of pending) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error('Controller disconnected từ bridge'));
      }
      pending.clear();
      scheduleReconnect();
    });

    return socket;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (ws) ws.terminate();
      reject(new Error(`Cannot connect to existing WS bridge on :${port}`));
    }, connectTimeoutMs);

    const socket = connect();

    socket.once('open', () => {
      clearTimeout(timer);
      resolve({
        isConnected() {
          return ws !== null && ws.readyState === WebSocket.OPEN;
        },

        getPluginInfo() {
          return null; // Not available in client mode
        },

        onPluginConnect(_handler) {
          // Not supported in client mode
        },

        sendCommand(tool, params = {}, timeoutMs = 30000) {
          if (ws === null || ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Controller WS disconnected từ bridge.'));
          }
          const id = randomUUID();
          return new Promise((res, rej) => {
            const timeoutId = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`Timeout: plugin không phản hồi sau ${timeoutMs / 1000}s`));
            }, timeoutMs);
            pending.set(id, { resolve: res, reject: rej, timeoutId });
            ws.send(JSON.stringify({ id, tool, params }));
          });
        }
      });
    });

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
