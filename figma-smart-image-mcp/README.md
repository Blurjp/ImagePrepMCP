# Figma Smart Image MCP Server

A Model Context Protocol (MCP) server that processes Figma design links into Claude-readable images. Automatically exports designs from Figma, generates optimized overview images, and splits large designs into overlapping tiles for better vision model understanding.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build the project
npm run build

# 3. Start the server (must be running to use)
node dist/server.js --transport http --port 3845

# 4. In another terminal, register with Claude (one-time)
claude mcp add --transport http figma-smart-image http://127.0.0.1:3845/mcp

# 5. Visit in browser to add your Figma token
open http://localhost:3845/
```

Get your Figma token from: https://www.figma.com/settings

## Features

- **Automatic Figma Export**: Paste any Figma design link and automatically export the design
- **Smart Format Selection**: Tries SVG first (best for UI), falls back to PNG
- **Size Optimization**: All images are compressed to fit size constraints (default 4MB)
- **Automatic Tiling**: Large designs are split into overlapping tiles
- **Multi-Tenant Support**: Each session has its own token, safe for public hosting
- **Rate Limiting**: Built-in protection against API abuse (100 req/min per IP)
- **Session Cleanup**: Expired sessions are automatically cleaned up
- **Fallback Node Selection**: If no node-id is provided, selects the first frame automatically
- **HTTP/SSE Transport**: Easy setup with Claude CLI using HTTP transport

## Deployment to Railway (Public Service)

Deploy this as a hosted service that everyone can use:

### Live Deployment

The service is deployed at: **https://figma-smart-image-mcp-production.up.railway.app**

### Add to Claude (for users)

```bash
claude mcp add --transport http figma-smart-image https://figma-smart-image-mcp-production.up.railway.app/mcp
```

### Users Authenticate Themselves

Each user visits the service URL to add their own Figma token:
```
https://figma-smart-image-mcp-production.up.railway.app/
```

**Security**: Each user's Figma token is stored in-memory for their session only. Tokens are never persisted to disk and are automatically cleaned up after 1 hour.

### Railway Configuration

The project includes:
- `Dockerfile` - Container build configuration
- `package.json` - Dependencies and scripts

**Environment Variables** (optional on Railway):
- None required - the service works out of the box
- `PORT` is automatically set by Railway

## Local Development

### Prerequisites

- Node.js 18+
- A Figma account with a personal access token

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

4. **Start the server:**
   ```bash
   node dist/server.js --transport http --port 3845
   ```

5. **Register with Claude (one-time):**
   ```bash
   claude mcp add --transport http figma-smart-image http://127.0.0.1:3845/mcp
   ```

6. **Set up your Figma token:**
   - Go to https://www.figma.com/settings
   - Create a personal access token
   - Visit http://localhost:3845/ in your browser
   - Paste your token and click "Save Token"

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

### Basic Usage

Simply provide a Figma URL to Claude:

```
Use the figma-smart-image tool to process this Figma design:
https://www.figma.com/design/abc123/My-Design-File?node-id=1-456
```

### Tool Parameters

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

### Example Output

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
  out/figma/1768742799088/tiles/tile_1_0.webp: 1536x1536 at (0,624) - 22.37 KB
  ...

Manifest: out/figma/1768742799088/manifest.json
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
| `/` | GET | Authentication page |
| `/auth` | GET/POST | Token status / Save token |
| `/mcp` | GET | SSE connection endpoint |
| `/message` | POST | Message endpoint for SSE client |
| `/health` | GET | Health check |

## Troubleshooting

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

### "Invalid token" error

Your Figma token may have expired or been revoked:

1. Go to https://www.figma.com/settings
2. Create a new personal access token
3. Visit http://localhost:3845/
4. Update your token

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
1. Your Figma token is valid
2. You have access to the Figma file
3. The file contains at least one frame or component

## Development

### Project Structure

```
figma-smart-image-mcp/
├── src/
│   ├── server.ts          # MCP server entry point
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
