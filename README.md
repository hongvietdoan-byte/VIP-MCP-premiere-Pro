# Premiere MCP

Standalone MCP server + UXP plugin for Adobe Premiere Pro — exposes general-purpose editing tools (cut/trim/effects/transitions/color/markers/sequence management/timeline placement) to Claude via the Model Context Protocol. No dependency on any other Premiere extension.

## Structure

- `plugin/` — UXP panel extension (loads into Premiere Pro via UXP Developer Tool). `mcpBridge.js` is the WebSocket client that dispatches commands to `premiereActions.js`, which implements them against the Premiere Scripting API.
- `server/` — Node.js MCP server (stdio transport for Claude + a WebSocket bridge on port 3005 that the plugin connects to). Tool definitions live in `server/src/tools/`.

## Setup

1. Install dependencies: `cd server && npm install`
2. Load the plugin in [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/devtool/): Add Plugin → select `plugin/manifest.json` → Load → enable **Watch** for live-reload during development.
3. Start the server: `node server/index.js` (or `node --watch server/index.js` during development).
4. Point your MCP client (e.g. Claude Desktop/Code) at `server/index.js` via its MCP config.

## Status

Actively in development — 68 tools defined, ~17 confirmed working against Premiere Pro 25.6.4, several known bugs being tracked and fixed (see project notes for the current punch list).
