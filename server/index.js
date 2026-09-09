// index.js — Premiere MCP Standalone (no Beat Shake dependency)
// Nếu port đang rảnh: tự làm bridge chính (primary) + serve MCP luôn trong tiến trình này.
// Nếu port đã có ai chiếm (vd script khác đã chạy sẵn): tự chuyển sang chế độ controller.

import { createConnection } from 'net';
import { createWsBridge } from './src/ws-bridge.js';
import { createWsBridgeClient } from './src/ws-bridge-client.js';
import { createMcpServer } from './src/mcp-server.js';

process.on('uncaughtException', err => { console.error('[MCP] Uncaught:', err.message); });
process.on('unhandledRejection', reason => { console.error('[MCP] Unhandled rejection:', reason); });

const WS_PORT = parseInt(process.env.PMCP_WS_PORT ?? '3005', 10);

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = createConnection(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    setTimeout(() => { socket.destroy(); resolve(false); }, 800);
  });
}

const busy = await isPortBusy(WS_PORT);
let wsBridge;

if (busy) {
  console.error(`[INDEX] Port ${WS_PORT} busy — switching to controller mode`);
  try {
    wsBridge = await createWsBridgeClient(WS_PORT);
  } catch (err) {
    console.error(`[INDEX] Cannot connect to existing bridge: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error(`[INDEX] Starting WS bridge + MCP server on port ${WS_PORT}`);
  wsBridge = createWsBridge(WS_PORT);
}

const { start } = createMcpServer(wsBridge);
await start();
