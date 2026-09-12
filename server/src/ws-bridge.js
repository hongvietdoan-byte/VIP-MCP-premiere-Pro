import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

export function createWsBridge(port) {
  const wss = new WebSocketServer({ port });
  let pluginSocket = null;
  let pluginInfo = null; // { version, styles, capabilities }
  const pending = new Map();       // id → { resolve, reject, timeoutId }  (local MCP commands)
  const ctrlPending = new Map();   // id → { ws: controllerWs, timeoutId }  (commands forwarded from a controller)
  const connectHandlers = [];

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Determine connection type from first message
    ws.once('message', (firstData) => {
      let firstMsg;
      try { firstMsg = JSON.parse(firstData.toString()); } catch { ws.close(); return; }

      if (firstMsg.type === 'controller') {
        _handleController(ws);
      } else if (firstMsg.type === 'ready') {
        _handlePlugin(ws, firstMsg);
      } else {
        ws.close();
      }
    });

    ws.on('error', (err) => console.error(`[WS] Socket error: ${err.message}`));
  });

  // Heartbeat: readyState có thể vẫn báo OPEN dù kết nối thật đã chết (mất mạng, Premiere ngủ,
  // panel reload không đóng socket cũ sạch sẽ) -- không có cơ chế này thì pluginSocket "xác sống"
  // sẽ treo MỌI lệnh MCP tới hết timeout (10-30s) vĩnh viễn cho tới khi restart tay tiến trình bridge.
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 20000);
  wss.on('close', () => clearInterval(heartbeatInterval));

  function _handlePlugin(ws, readyMsg) {
    console.error('[WS] Premiere MCP plugin connected');
    if (pluginSocket && pluginSocket.readyState === 1) pluginSocket.close();
    pluginSocket = ws;
    pluginInfo = {
      version: readyMsg.version,
      styles: readyMsg.styles ?? [],
      capabilities: readyMsg.capabilities ?? []
    };
    console.error(`[WS] Plugin ready — v${pluginInfo.version}, ${pluginInfo.styles.length} styles`);
    connectHandlers.forEach(h => { try { h(pluginInfo); } catch {} });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      // Route response: controller-originated command?
      if (ctrlPending.has(msg.id)) {
        const { ws: ctrlWs, timeoutId } = ctrlPending.get(msg.id);
        clearTimeout(timeoutId);
        ctrlPending.delete(msg.id);
        if (ctrlWs.readyState === 1) ctrlWs.send(data);
        return;
      }

      // Local MCP command response
      const entry = pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timeoutId);
      pending.delete(msg.id);
      if (msg.success) entry.resolve(msg.data);
      else entry.reject(new Error(msg.error ?? 'Unknown error from plugin'));
    });

    ws.on('close', () => {
      console.error('[WS] Plugin disconnected');
      if (pluginSocket === ws) { pluginSocket = null; pluginInfo = null; }
      for (const [, entry] of pending) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error('Plugin disconnected'));
      }
      pending.clear();
      // Cancel orphaned controller commands (clear timeout to avoid timer leak)
      for (const [id, ctrl] of ctrlPending) {
        clearTimeout(ctrl.timeoutId);
        ctrlPending.delete(id);
      }
    });
  }

  function _handleController(ws) {
    console.error('[WS] MCP controller connected');

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      const pluginConnected = pluginSocket !== null && pluginSocket.readyState === 1;

      // Intercept meta-tools the bridge can answer directly (faster, no plugin round-trip)
      if (msg.tool === 'get_plugin_status') {
        ws.send(JSON.stringify({
          id: msg.id, success: true,
          data: {
            connected: pluginConnected,
            version: pluginInfo?.version ?? null,
            stylesCount: pluginInfo?.styles?.length ?? 0,
            hasLastAnalysis: false
          }
        }));
        return;
      }
      if (msg.tool === 'get_beat_styles') {
        const styles = pluginInfo?.styles ?? [];
        ws.send(JSON.stringify({ id: msg.id, success: true, data: { styles, source: 'bridge' } }));
        return;
      }

      if (!pluginConnected) {
        ws.send(JSON.stringify({
          id: msg.id,
          success: false,
          error: 'Premiere MCP plugin chưa kết nối. Hãy mở Premiere Pro → Windows > Extensions > Premiere MCP v2.'
        }));
        return;
      }

      // Forward command to plugin; set timeout to prevent ctrlPending map from leaking
      const timeoutId = setTimeout(() => {
        if (ctrlPending.has(msg.id)) ctrlPending.delete(msg.id);
        // Controller already timed out on its own — no need to send error back
      }, 35000);
      ctrlPending.set(msg.id, { ws, timeoutId });
      pluginSocket.send(data);
    });

    ws.on('close', () => console.error('[WS] MCP controller disconnected'));
  }

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Should not happen if index.js pre-checks the port, but handle gracefully just in case
      console.error(`[WS] Port ${port} already in use — another bridge is running.`);
      process.exit(0);
    }
    console.error(`[WS] Server error: ${err.message}`);
  });

  console.error(`[WS] WebSocket server listening on :${port}`);

  return {
    isConnected() {
      return pluginSocket !== null && pluginSocket.readyState === 1;
    },

    getPluginInfo() {
      return pluginInfo;
    },

    onPluginConnect(handler) {
      connectHandlers.push(handler);
    },

    sendCommand(tool, params = {}, timeoutMs = 30000) {
      if (!this.isConnected()) {
        return Promise.reject(new Error(
          'Premiere MCP plugin chưa kết nối. Hãy mở Premiere Pro, vào Windows > Extensions > Premiere MCP v2.'
        ));
      }
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timeout: plugin không phản hồi sau ${timeoutMs / 1000}s`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timeoutId });
        pluginSocket.send(JSON.stringify({ id, tool, params }));
      });
    }
  };
}
