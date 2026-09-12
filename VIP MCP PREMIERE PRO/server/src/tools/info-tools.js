// info-tools.js — General status/debug tools for Premiere MCP Standalone (no Beat Shake dependency)

export const INFO_TOOLS = [
  {
    name: 'get_plugin_status',
    description: 'Kiểm tra trạng thái kết nối của Premiere MCP plugin với MCP server. Dùng để xác nhận plugin đang chạy trước khi gọi các tool khác.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute(wsBridge) {
      const connected = wsBridge.isConnected();
      if (!connected) {
        return { connected: false, version: null };
      }
      const info = wsBridge.getPluginInfo();
      if (info !== null) {
        return { connected: true, version: info.version ?? null };
      }
      try {
        const pluginStatus = await wsBridge.sendCommand('get_plugin_status', {}, 5000);
        return { connected: true, ...pluginStatus };
      } catch {
        return { connected: false, version: null };
      }
    }
  },

  {
    name: 'ping',
    description: 'Test WS round-trip: gửi ping tới plugin, plugin trả pong ngay (không gọi Premiere API). Dùng để xác nhận kênh WS send→receive hoạt động.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('ping', {}, 10000);
    }
  },

  {
    name: 'get_sequence_info',
    description: 'Lấy thông tin sequence đang active trong Premiere Pro: tên, kích thước khung hình, frame rate.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_sequence_info', {}, 30000);
    }
  },

  {
    name: 'get_selected_clips',
    description: 'Lấy danh sách clip đang được chọn trên timeline: loại clip (audio/video), tên file, đường dẫn, vị trí bắt đầu và độ dài.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_selected_clips', {}, 30000);
    }
  },

  {
    name: 'debug_get_element',
    description: 'Chẩn đoán UI: đọc trạng thái DOM thật của 1 phần tử trong panel đang mở trong Premiere. Trả về innerHTML, outerHTML (200 ký tự đầu), kích thước thật, và computed style. Dùng để kiểm tra CSS rendering trong UXP.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector, ví dụ "#status", ".btn"' }
      },
      required: ['selector']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('debug_get_element', { selector: args.selector }, 10000);
    }
  },

  {
    name: 'debug_probe_api',
    description: 'Kiểm kê API của bản Premiere đang chạy: có VideoFilterFactory / isAdjustmentLayer / createKeyframe hay không, số effect cài đặt, trạng thái clip đang chọn. CHỈ ĐỌC — an toàn chạy trên project thật.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('debug_probe_api', {}, 20000);
    }
  },

  {
    name: 'debug_inspect_chain',
    description: 'Chẩn đoán Premiere API: kiểm tra ComponentChain của clip đang chọn — liệt kê tất cả method/property có trên chain, các effect hiện có, và thử thêm effect bằng mọi signature biết được.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect muốn thử thêm. Ví dụ: "AE.ADBE Geometry2" (Transform), "AE.ADBE Gaussian Blur 2"' },
        tryAdd: { type: 'boolean', description: 'true = thử gọi add API thật (có thể thay đổi clip), false = chỉ đọc thông tin (an toàn). Mặc định false.' }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('debug_inspect_chain', { matchName: args.matchName, tryAdd: args.tryAdd === true }, 20000);
    }
  },

  {
    name: 'debug_list_markers',
    description: 'Đọc lại TOÀN BỘ marker thật đang có trên clip đang chọn (clip marker và sequence marker), không lọc — dùng để kiểm tra marker trên timeline.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('debug_list_markers', {}, 20000);
    }
  },

  {
    name: 'get_status',
    description: 'Compound tool: lấy toàn bộ trạng thái hiện tại trong 1 lần gọi — thay thế cho việc gọi riêng ping + get_plugin_status + get_sequence_info + get_selected_clips. Dùng đầu session để hiểu bối cảnh nhanh.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute(wsBridge) {
      const connected = wsBridge.isConnected();
      if (!connected) {
        return {
          connected: false,
          _hint: "Plugin chưa kết nối. Kiểm tra: 1) Panel Premiere MCP đang mở trong Premiere, 2) node.exe đang chạy (Task Manager), 3) Thử ping để test lại."
        };
      }

      const [statusResult, seqResult, clipsResult] = await Promise.allSettled([
        (async () => {
          const info = wsBridge.getPluginInfo();
          if (info !== null) return { connected: true, version: info.version ?? null };
          return wsBridge.sendCommand('get_plugin_status', {}, 5000);
        })(),
        wsBridge.sendCommand('get_sequence_info', {}, 10000),
        wsBridge.sendCommand('get_selected_clips', {}, 10000)
      ]);

      return {
        connected: true,
        status: statusResult.status === 'fulfilled' ? statusResult.value : { error: statusResult.reason?.message },
        sequence: seqResult.status === 'fulfilled' ? seqResult.value : { error: seqResult.reason?.message },
        selectedClips: clipsResult.status === 'fulfilled' ? clipsResult.value : { error: clipsResult.reason?.message }
      };
    }
  }
];
