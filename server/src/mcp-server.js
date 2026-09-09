import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { INFO_TOOLS } from './tools/info-tools.js';
import { PREMIERE_TOOLS } from './tools/premiere-tools.js';

const ALL_TOOLS = [...INFO_TOOLS, ...PREMIERE_TOOLS];

export function createMcpServer(wsBridge) {
  const server = new Server(
    { name: 'premiere-mcp-standalone', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = ALL_TOOLS.find(t => t.name === name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool không tồn tại: ${name}` }],
        isError: true
      };
    }

    try {
      const result = await tool.execute(wsBridge, args ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Lỗi: ${err.message}` }],
        isError: true
      };
    }
  });

  return {
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('[MCP] Premiere MCP Standalone server ready (stdio transport)');
    }
  };
}
