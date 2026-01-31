# Figma Smart Image MCP Server

A comprehensive Model Context Protocol (MCP) server for Figma integration. Combines visual analysis (image export) with structural data extraction (components, layout properties, design variables). Provides everything the official Figma MCP offers **plus** smart image processing for Claude's vision capabilities.

## Quick Start

### Option A: Use Hosted Service (Easiest)

**One-click setup** (automatically configures timeout):

**macOS/Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/Blurjp/ImagePrepMCP/main/figma-smart-image-mcp/configure-claude.sh | bash
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://raw.githubusercontent.com/Blurjp/ImagePrepMCP/main/figma-smart-image-mcp/configure-claude.ps1 | iex
```

Then visit https://figma-smart-image-mcp-production.up.railway.app/ to authenticate with Figma.

### Option B: Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Build the project
npm run build

# 3. Start the server (must be running to use)
node dist/server.js --transport http --port 3845

# 4. In another terminal, register with Claude (one-time)
claude mcp add --transport http figma-smart-image http://127.0.0.1:3845/mcp

# 5. Visit in browser to authenticate with Figma via OAuth
open http://localhost:3845/
```

Click "Connect to Figma" to authorize via OAuth. No manual token needed!

**⚠️ Important**: Local setup doesn't auto-configure timeout. You must manually add `"timeout": 180000` to `claude_desktop_config.json` (see Troubleshooting section).

## Features

### Visual Analysis (Image Export)
- **Automatic Figma Export**: Paste any Figma design link and automatically export the design
- **Smart Format Selection**: Tries SVG first (best for UI), falls back to PNG
- **Size Optimization**: All images are compressed to fit size constraints (default 4MB)
- **Automatic Tiling**: Large designs are split into overlapping tiles for detailed analysis
- **Fallback Node Selection**: If no node-id is provided, selects the first frame automatically

### Structural Data Extraction (NEW!)
- **Component Extraction**: Get all components and component sets (variants) from Figma files
- **Layout Properties**: Extract auto-layout settings, spacing, padding, constraints
- **Design Variables**: Access design tokens (colors, spacing, typography) with multi-mode support
- **Detailed Node Info**: Get fills, effects, opacity, text content, and hierarchy for any node

### Infrastructure
- **OAuth 2.0 Authentication**: Secure PKCE flow for Figma authorization
- **Multi-Tenant Support**: Each user has their own OAuth token, safe for public hosting
- **Redis Storage**: Reliable token storage with automatic expiration (1 hour)
- **Token Refresh**: Automatic token refresh for long-running sessions
- **Rate Limiting**: Built-in protection against API abuse (100 req/min per IP)
- **Session Cleanup**: Expired sessions are automatically cleaned up
- **HTTP/SSE Transport**: Easy setup with Claude CLI using HTTP transport

## Why This MCP vs Official Figma MCP?

This server is a **superset** of the official Figma MCP - it does everything the official one does, plus more:

| Feature | This Server | Official Figma MCP |
|---------|-------------|-------------------|
| Component extraction | ✅ Yes | ✅ Yes |
| Layout properties | ✅ Yes | ✅ Yes |
| Design variables | ✅ Yes | ✅ Yes |
| **Image export** | ✅ **YES!** | ❌ **NO** |
| **Tiled images for vision** | ✅ **YES!** | ❌ **NO** |
| **Visual analysis** | ✅ **YES!** | ❌ **NO** |

**Best of both worlds:**
- 🎨 Visual understanding via images (for Claude's vision)
- 🏗️ Structural data via API (for code generation)
- 🎯 Exact design values (no guessing colors/spacing)

**Use cases unique to this server:**
- "Show me what this design looks like" → Only this server can do it
- "Build this design exactly" → This server gives Claude both visual context AND exact values
- "Analyze the visual hierarchy" → This server provides images for vision analysis

## Deployment to Railway (Public Service)

Deploy this as a hosted service that everyone can use:

### Live Deployment

The service is deployed at: **https://figma-smart-image-mcp-production.up.railway.app**

### Add to Claude (for users)

**⚡ One-Click Setup (Recommended)**:

Automatically configure Claude Desktop with proper timeout settings:

**macOS/Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/Blurjp/ImagePrepMCP/main/figma-smart-image-mcp/configure-claude.sh | bash
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://raw.githubusercontent.com/Blurjp/ImagePrepMCP/main/figma-smart-image-mcp/configure-claude.ps1 | iex
```

This automatically adds the MCP server with `timeout: 180000` (3 minutes).

---

**Quick Add (Command Line - NOT Recommended)**:
```bash
claude mcp add --transport http figma-smart-image https://figma-smart-image-mcp-production.up.railway.app/mcp
```

⚠️ **Warning**: This uses the default 30-second timeout and will fail on large files. Use the one-click setup above instead.

---

**Manual Configuration with Timeout**

For better reliability with large files, manually configure in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "figma-smart-image": {
      "url": "https://figma-smart-image-mcp-production.up.railway.app/mcp",
      "timeout": 180000
    }
  }
}
```

**Config file location**:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Why set timeout?**
- Claude Desktop's **default timeout is ~30 seconds** for HTTP transport
- Large Figma files can take 30-90 seconds to export and process
- Setting `timeout: 180000` (3 minutes) prevents timeout errors
- Without this, you may see "The operation timed out" errors

### Users Authenticate Themselves via OAuth

Each user visits the service URL to authenticate with Figma:
```
https://figma-smart-image-mcp-production.up.railway.app/
```

**OAuth Flow**:
1. Click "Connect to Figma" button
2. Redirect to Figma's OAuth authorization page
3. Authorize the application
4. Redirect back with authorization code
5. Server exchanges code for access token
6. Token stored in Redis for 1 hour (auto-refreshed)

**Security**: Each user's OAuth token is stored securely in Redis with automatic expiration. Tokens are unique per session and never shared between users.

### Railway Configuration

The project includes:
- `.nixpacks.toml` - Build configuration for Railway
- `package.json` - Dependencies and scripts
- `Procfile` - Process startup configuration

**Required Environment Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `FIGMA_CLIENT_ID` | Figma OAuth Client ID | `v6XQDfqJ17Q7yQMewrboBE` |
| `FIGMA_CLIENT_SECRET` | Figma OAuth Client Secret | `your-secret-here` |
| `REDIS_URL` | Redis connection URL | Auto-provided by Railway |

**Optional Environment Variables** (Timeout Configuration):

| Variable | Description | Default | Recommended |
|----------|-------------|---------|-------------|
| `MCP_TOOL_TIMEOUT_MS` | Maximum time for tool execution (ms) | `60000` (60s) | `180000` (3min) |
| `FIGMA_REQUEST_TIMEOUT_MS` | Timeout for Figma API requests and downloads (ms) | Same as tool timeout | `180000` (3min) |

**Why increase timeouts?** Large Figma files or slow networks may need more time. Setting these to 3 minutes prevents timeout errors for most use cases.

**Setting up Figma OAuth App**:
1. Go to [Figma Developer Portal](https://www.figma.com/developers/apps)
2. Create a new app
3. Set callback URL: `https://your-domain.railway.app/oauth/callback`
4. Copy Client ID and Secret to Railway environment variables

## Local Development

### Prerequisites

- Node.js 20+
- Redis (optional - will use in-memory fallback if not available)
- Figma OAuth app credentials (for OAuth flow)

### Setting up OAuth for Local Development

1. **Create a Figma OAuth App**:
   - Go to https://www.figma.com/developers/apps
   - Create a new app
   - Set callback URL: `http://localhost:3845/oauth/callback`
   - Copy Client ID and Secret

2. **Set environment variables**:
   ```bash
   export FIGMA_CLIENT_ID="your_client_id"
   export FIGMA_CLIENT_SECRET="your_client_secret"
   # Optional: For Redis storage
   export REDIS_URL="redis://localhost:6379"
   ```

3. **Start the server**:
   ```bash
   npm run build
   node dist/server.js --transport http --port 3845
   ```

4. **Visit the authentication page**:
   ```
   http://localhost:3845/
   ```

5. **Click "Connect to Figma"** to authorize via OAuth

### Step-by-Step Setup

1. **Navigate to the project directory:**
   ```bash
   cd /path/to/figma-smart-image-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Set up environment variables** (see "Setting up OAuth" above)

5. **Start the server:**
   ```bash
   node dist/server.js --transport http --port 3845
   ```

6. **Register with Claude (one-time):**
   ```bash
   claude mcp add --transport http figma-smart-image http://127.0.0.1:3845/mcp
   ```

7. **Authenticate with Figma:**
   - Visit http://localhost:3845/ in your browser
   - Click "Connect to Figma" to authorize via OAuth

## Important: Server Must Be Running

**The server needs to be running every time you want to use it.**

The `claude mcp add` command only **registers** the server with Claude. It doesn't start the server.

### Starting the Server

Every time you want to use the Figma tool, start the server:

```bash
# From the project directory
node dist/server.js --transport http --port 3845
```

### Running in Background

To keep the server running in the background:

```bash
# Start in background
nohup node dist/server.js --transport http --port 3845 > /tmp/figma-mcp.log 2>&1 &

# Check if it's running
ps aux | grep "node dist/server.js"

# View logs
tail -f /tmp/figma-mcp.log
```

### Auto-Start on Login (macOS)

Create `~/Library/LaunchAgents/com.figma.smartimage.mcp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.figma.smartimage.mcp</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/jianping/projects/ImagePrepMCP/figma-smart-image-mcp/dist/server.js</string>
    <string>--transport</string>
    <string>http</string>
    <string>--port</string>
    <string>3845</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>/Users/jianping/projects/ImagePrepMCP/figma-smart-image-mcp</string>
</dict>
</plist>
```

Then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.figma.smartimage.mcp.plist
```

To stop:

```bash
launchctl unload ~/Library/LaunchAgents/com.figma.smartimage.mcp.plist
```

## Usage

### Available Tools

This server provides 4 MCP tools for comprehensive Figma integration:

#### 1. `process_figma_link` - Visual Analysis
Exports Figma designs as images for Claude's vision capabilities.

**When to use:**
- Understanding the visual appearance of a design
- Getting an overview of layouts and compositions
- Analyzing UI elements visually
- Large designs that benefit from tiled viewing

**Returns:**
- Overview image (optimized WebP/JPEG)
- Tiles for detailed analysis (overlapping 1536px squares)
- Manifest with metadata

**Example:**
```
Use process_figma_link with:
https://www.figma.com/design/abc123/My-Design?node-id=1-456
```

#### 2. `get_figma_components` - Component Library
Extracts all components and component sets (variants) from a Figma file.

**When to use:**
- Understanding a design system
- Listing reusable components
- Finding component variants
- Code generation from design systems

**Returns:**
- Component sets (variant groups)
- Individual components with names, descriptions, keys
- Component documentation links
- Raw JSON data

**Example:**
```
Use get_figma_components to list all components in:
https://www.figma.com/design/abc123/Design-System
```

#### 3. `get_figma_node_details` - Layout Properties
Gets detailed layout and styling information for a specific node.

**Requires:** URL with `node-id` parameter

**When to use:**
- Getting exact spacing values
- Understanding auto-layout configuration
- Extracting fill/color values
- Finding shadow/effect properties
- Analyzing node hierarchy

**Returns:**
- Bounding box (position, size)
- Auto-layout properties (mode, spacing, padding)
- Fills (colors, gradients)
- Effects (shadows, blurs)
- Opacity and blend mode
- Text content (if text node)
- Children list
- Raw JSON data

**Example:**
```
Use get_figma_node_details with:
https://www.figma.com/design/abc123/My-Design?node-id=1-456
```

#### 4. `get_figma_variables` - Design Tokens
Extracts design variables (design tokens) from a Figma file.

**When to use:**
- Extracting design tokens
- Building CSS variables
- Understanding color systems
- Getting spacing scales
- Multi-mode themes (light/dark)

**Returns:**
- Variable collections with modes
- Variables grouped by type (COLOR, FLOAT, STRING, BOOLEAN)
- Values for each mode
- Raw JSON data

**Example:**
```
Use get_figma_variables to extract design tokens from:
https://www.figma.com/design/abc123/Design-System
```

### Tool Selection Guide

| User asks for... | Use this tool |
|------------------|---------------|
| "Show me the design" | `process_figma_link` |
| "What components exist?" | `get_figma_components` |
| "What's the spacing in this frame?" | `get_figma_node_details` |
| "What are the color tokens?" | `get_figma_variables` |
| "Build this design" | **ALL 4 TOOLS!** |
| "Document this design system" | **ALL 4 TOOLS!** |

### Basic Usage

Simply provide a Figma URL to Claude:

**For visual analysis:**
```
Show me this design:
https://www.figma.com/design/abc123/My-Design-File?node-id=1-456
```
Claude will use `process_figma_link` to export images.

**For component extraction:**
```
What components are in this design system?
https://www.figma.com/design/abc123/Design-System
```
Claude will use `get_figma_components` to list all components.

**For building a design:**
```
Build this Figma design as React code:
https://www.figma.com/design/abc123/My-Design?node-id=1-456
```
Claude will use all 4 tools:
1. `process_figma_link` - Get visual context
2. `get_figma_components` - Understand reusable components
3. `get_figma_node_details` - Get exact spacing/colors
4. `get_figma_variables` - Extract design tokens

### Tool Parameters

#### `process_figma_link` Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | (required) | The Figma design URL |
| `out_dir` | string | `./out/figma/<timestamp>/` | Output directory path |
| `max_bytes` | number | `4000000` | Maximum size for each image (4MB) |
| `max_long_edge` | number | `4096` | Maximum width/height in pixels |
| `tile_px` | number | `1536` | Size of each tile |
| `overlap_px` | number | `96` | Overlap between tiles |
| `prefer_format` | "webp" \| "jpeg" | `"webp"` | Output format for processed images |
| `force_source_format` | "auto" \| "svg" \| "png" | `"auto"` | Force specific export format |
| `include_crops` | boolean | `false` | Generate heuristic crops |

#### Other Tools Parameters
- `get_figma_components`: Only requires `url` (Figma file URL)
- `get_figma_node_details`: Only requires `url` (Figma URL with `node-id` parameter)
- `get_figma_variables`: Only requires `url` (Figma file URL)

### Example Outputs

#### `process_figma_link` Output
```
Successfully processed Figma design

Source: o5ucyn5Pm8Fhb9CNTSGkp9 (node: 1:249)
Selected node: "Thumbnail" (auto-selected first frame)
Export format: svg

Output directory: out/figma/1768742799088

Overview:
  Path: out/figma/1768742799088/source_overview.webp
  Size: 3840x2160
  Bytes: 191.99 KB
  Format: webp (quality: 95)

Tiles: 6
  out/figma/1768742799088/tiles/tile_0_0.webp: 1536x1536 at (0,0) - 28.68 KB
  out/figma/1768742799088/tiles/tile_0_1.webp: 1536x1536 at (1440,0) - 26.86 KB
  ...

Manifest: out/figma/1768742799088/manifest.json
```

#### `get_figma_components` Output
```markdown
# Components from Figma File

File: dC3ifprl6oWlApLF1wzOFz

## Component Sets (3)
### Button
Button component with variants
Key: 27:2068

## Components (21)
### Button/Primary
Primary action button
Key: ad7e62d71449d00f09a985fee4fffbf88633e482
Component Set ID: 27:2068

### Card/Game
Game card component for launcher
Key: 5b2c8f...
```

#### `get_figma_node_details` Output
```markdown
# Node Details: Game Launcher Frame

Type: FRAME
ID: 1:1235

## Bounding Box
- Position: (0, 0)
- Size: 1728 × 1117

## Auto Layout
- Layout Mode: VERTICAL
- Item Spacing: 16px
- Padding: 24px 24px 24px 24px

## Fills (1)
1. SOLID

## Effects (2)
1. DROP_SHADOW
2. INNER_SHADOW

## Children (8)
- Header (FRAME)
- Title (TEXT)
- Game Grid (FRAME)
...
```

#### `get_figma_variables` Output
```markdown
# Design Variables

File: dC3ifprl6oWlApLF1wzOFz

## Collections (2)
### Color Tokens
ID: VariableCollectionId:123
Modes: Light, Dark

## Variables (15)

### COLOR (8)
**colors/primary**
Primary brand color
ID: VariableID:789
Values: {"Light": {"r": 0.2, "g": 0.5, "b": 1, "a": 1}}

### FLOAT (7)
**spacing/md**
Medium spacing
ID: VariableID:791
Values: {"Default": 16}
```

## URL Formats Supported

- **New design URLs**: `https://www.figma.com/design/<fileKey>/...?node-id=xxx-yyy`
- **Old file URLs**: `https://www.figma.com/file/<fileKey>/...?node-id=xxx-yyy`
- **Proto URLs**: `https://www.figma.com/proto/<fileKey>/...`
- **Without node-id**: The server will auto-select the first frame

## HTTP Endpoints

When running with `--transport http`, the server provides:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Authentication page with OAuth button |
| `/oauth/authorize` | GET | OAuth authorization flow initiation |
| `/oauth/callback` | GET | OAuth callback handler |
| `/mcp` | GET | SSE connection endpoint |
| `/message` | POST | Message endpoint for SSE client |
| `/health` | GET | Health check with Redis status |
| `/auth` | GET/POST | Legacy token endpoint (deprecated) |

## Troubleshooting

### "The operation timed out" error

**Symptoms**: Tool fails with timeout error, especially with large Figma files.

**Root Cause**: The default timeouts are too short for large files.

**Timeout Layers Explained**:
- **Claude Desktop default**: ~30 seconds (HTTP transport)
- **Server default (this MCP)**: 180 seconds (3 minutes) - already configured
- **Network/proxy timeouts**: Varies by infrastructure

**Solutions**:

1. **Client-Side (RECOMMENDED - fixes most issues)**:

   Add `timeout` to your `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "figma-smart-image": {
         "url": "https://your-server.railway.app/mcp",
         "timeout": 180000
       }
     }
   }
   ```

   **Why?** Claude Desktop's default 30s timeout is too short. Large Figma files need 60-120s.

2. **Server-Side (already set, but can override)**:

   If self-hosting, set these in Railway/environment:
   - `MCP_TOOL_TIMEOUT_MS=180000`
   - `FIGMA_REQUEST_TIMEOUT_MS=180000`

   The public deployment already has these set to 3 minutes.

3. **For Very Large Files (1000+ frames)**:

   Use `list_figma_frames` first to get specific frame node IDs, then query individual frames instead of the entire file. This avoids fetching the whole document.

### Server not responding

**Check if the server is running:**
```bash
ps aux | grep "node dist/server.js"
```

**If not running, start it:**
```bash
node dist/server.js --transport http --port 3845
```

### "Failed to parse Figma URL"

Make sure the URL is a valid Figma design URL:
- `figma.com/design/<fileKey>/...`
- `figma.com/file/<fileKey>/...`
- `figma.com/proto/<fileKey>/...`

### "No image URL returned for node X"

This happens when:
- The node is a canvas/page (not exportable)
- The node doesn't exist
- You don't have access to the node

**Solution**: Omit the `node-id` parameter to auto-select the first frame.

### OAuth Not Configured

**Error**: "OAuth Not Configured - FIGMA_CLIENT_ID environment variable is not set"

**Solution**:
1. Ensure you've created a Figma OAuth app
2. Set environment variables:
   ```bash
   export FIGMA_CLIENT_ID="your_client_id"
   export FIGMA_CLIENT_SECRET="your_client_secret"
   ```
3. Restart the server

### OAuth Callback Error

**Error**: Callback returns error or fails to complete

**Solutions**:
1. Ensure callback URL in Figma app matches your deployment URL
   - Local: `http://localhost:3845/oauth/callback`
   - Railway: `https://your-domain.railway.app/oauth/callback`
2. Check that Figma app has "file_read" scope
3. Verify REDIS_URL is set (for multi-tenant storage)

### "Invalid token" error

Your OAuth token may have expired:

1. Visit http://localhost:3845/
2. Click "Connect to Figma" to re-authorize
3. Tokens auto-refresh every hour when active

### Port already in use

Change the port:

```bash
node dist/server.js --transport http --port 3846
```

Then update the MCP registration:

```bash
claude mcp remove figma-smart-image
claude mcp add --transport http figma-smart-image http://127.0.0.1:3846/mcp
```

### Permission Errors

Check:
1. You've authorized the app via OAuth
2. You have access to the Figma file
3. The file contains at least one frame or component

### "No components found in this file"

When using `get_figma_components`:

**Cause**: The Figma file doesn't have any published components.

**This is normal for**:
- Design files without a component library
- Files with only frames/groups (not components)
- Files where components haven't been published

**Solution**: Only design system files with published components will return data.

### "No variables found in this file"

When using `get_figma_variables`:

**Cause**: The Figma file doesn't have any local variables defined.

**This is normal for**:
- Files created before Figma variables were introduced
- Files that don't use design tokens
- Files where designers use styles instead of variables

**Solution**: This is expected and not an error. Not all files have variables.

### "Node ID is required"

When using `get_figma_node_details`:

**Cause**: The URL doesn't include a `node-id` parameter.

**Solutions**:
1. Get the node ID from Figma:
   - Right-click layer → "Copy link to layer"
   - URL will include `?node-id=X-Y`
2. Use `process_figma_link` first to auto-select a frame and see its node ID
3. Use `get_figma_components` to get component keys, then use as node IDs

## Development

### Project Structure

```
figma-smart-image-mcp/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── redis.ts           # Redis storage for OAuth tokens
│   ├── figma/
│   │   ├── parse_link.ts  # URL parsing
│   │   ├── api.ts         # Figma API client
│   │   └── export.ts      # Image export/download
│   ├── image/
│   │   ├── encode.ts      # Image encoding/compression
│   │   ├── tiles.ts       # Image tiling
│   │   └── crops.ts       # Heuristic crops
│   └── util/
│       └── fs.ts          # File system utilities
├── .nixpacks.toml         # Railway build configuration
├── Procfile               # Process startup
├── package.json
├── tsconfig.json
└── README.md
```

### NPM Scripts

```bash
npm run build    # Build TypeScript
npm start        # Run with stdio transport
npm run start:http  # Run with HTTP transport on port 3845
```

## License

MIT

## Credits

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Sharp](https://sharp.pixelplumbing.com/) for image processing
- [Undici](https://undici.nodejs.org/) for HTTP requests
- [Zod](https://zod.dev/) for schema validation
- [ioredis](https://github.com/luin/ioredis) for Redis storage
- [Railway](https://railway.app/) for deployment infrastructure

**Feature parity with [Official Figma MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/figma)** plus unique image export capabilities.

---

## What's New

### v2.0.0 (2026-01-23) - Component Extraction & Design Variables
- ✨ Added `get_figma_components` tool - Extract all components and component sets
- ✨ Added `get_figma_node_details` tool - Get layout properties, spacing, fills, effects
- ✨ Added `get_figma_variables` tool - Extract design tokens (colors, spacing, etc.)
- 🎯 Full parity with official Figma MCP while keeping unique image export
- 📚 Best of both worlds: Visual analysis + Structural data extraction
