# Premiere MCP

Standalone MCP server + UXP plugin for Adobe Premiere Pro — exposes general-purpose editing tools (cut/trim/effects/transitions/color/markers/sequence management/timeline placement) to Claude via the Model Context Protocol. No dependency on any other Premiere extension.

> **Mic Check** (docx/csv/xlsx → auto-built timeline, no Claude/MCP dependency) used to live in this same repo — it's now a separate project: [MIC-CHECK-FF-PLUGIN](https://github.com/hongvietdoan-byte/MIC-CHECK-FF-PLUGIN).

## Structure

- `plugin/` — UXP panel extension (loads into Premiere Pro via UXP Developer Tool). `mcpBridge.js` is the WebSocket client that dispatches commands to `premiereActions.js`, which implements them against the Premiere Scripting API.
- `server/` — Node.js MCP server (stdio transport for Claude + a WebSocket bridge on port 3005 that the plugin connects to). Tool definitions live in `server/src/tools/`.

## Setup on a new machine

1. Clone this repo, then install server dependencies: `cd server && npm install`
2. Load the plugin in [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/devtool/): Add Plugin → select this machine's local path to `plugin/manifest.json` → Load → enable **Watch** for live-reload during development. **This step is per-machine and not synced by git** — the plugin registration is local to UXP Developer Tool, so it must be re-added every time you set up on a new machine, even though the code itself came from git.
3. Start the WebSocket bridge + MCP server: `node server/index.js` (from inside `server/`). This does **not** start automatically — you must run it manually every session before the Premiere panel can connect. It listens on port **3005** (not 3001 — that's a different, unrelated project on this same author's machine; if you ever see a stale "3001" reference anywhere, it's a leftover typo, the real port is always 3005).
4. Open Premiere Pro with a project loaded, then open the plugin panel (Window → Extensions → "Premiere MCP v2"). It auto-retries the WS connection every 5s, so start order between step 3 and this step doesn't matter — the indicator turns 🟢 once both sides are up.
5. Point your MCP client (e.g. Claude Desktop/Code) at `server/index.js` via its MCP config, e.g.:
   ```json
   {
     "mcpServers": {
       "premiere": { "command": "node", "args": ["/absolute/path/to/premiere-mcp/server/index.js"] }
     }
   }
   ```

## Status

See [TODO.md](TODO.md) for the current punch list — which tools are confirmed working, which have known bugs, and which are untested. As of 2026-09-10: 68 tools defined, 22 confirmed working against Premiere Pro 25.6.4 (including `insert_clip`/`overwrite_clip`, whose timeline-position bug was just fixed and live-verified), a few known-broken tool names identified but not yet fixed, and ~44 tools not yet tested.
