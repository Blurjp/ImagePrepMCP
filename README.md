# Figma Smart Image MCP Server

A Model Context Protocol (MCP) server that processes Figma designs into Claude-readable images with automatic tiling, compression, and smart cropping.

## Live Deployment

**Public URL:** https://figma-smart-image-mcp-production.up.railway.app/

The live deployment supports **multi-tenant authentication** - multiple users can each use their own Figma token simultaneously.

## Features

- **Smart Export**: Automatic SVG/PNG export from Figma
- **Auto Tiling**: Large designs automatically split into manageable tiles
- **Compression**: Optimized for Claude's context size limits
- **Smart Crops**: Heuristic detection of UI patterns for better crops
- **Multi-Tenant**: Each user authenticates with their own Figma token
- **Redis-Backed**: Reliable token storage across sessions

## Quick Start (Using Live Deployment)

### Option A: Quick Command (Recommended for most users)

Run this command in your terminal:

```bash
claude mcp add --transport http figma-smart-image https://figma-smart-image-mcp-production.up.railway.app/mcp
```

That's it! Now skip to **Step 2** below.

### Option B: Manual Configuration (.clauderc file)

Create or update `.clauderc` in your project directory:

```json
{
  "mcpServers": {
    "figma-smart-image": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sse",
        "https://figma-smart-image-mcp-production.up.railway.app/mcp"
      ]
    }
  }
}
```

### Step 2: Get Your User Code

When you first use the MCP server, you'll need to authenticate:

1. Visit **https://figma-smart-image-mcp-production.up.railway.app/**
2. You'll see a user code (e.g., `ABC123`)

### Step 3: Authenticate with Figma

1. Get your Figma Personal Access Token from [Figma Settings](https://www.figma.com/settings)
2. On the authentication page, enter:
   - **User Code**: The code displayed in step 2
   - **Figma Token**: Your personal access token
3. Click "Connect to Figma"

### Step 4: Start Using Claude

Now you can use Figma Smart Image tools in Claude:

```typescript
// Ask Claude to process a Figma design
"Please extract the hero section from this Figma link:
https://www.figma.com/design/..."
```

## How It Works

```
┌─────────────────┐
│  Claude Client  │
└────────┬────────┘
         │ 1. Request MCP connection
         ▼
┌─────────────────────────────┐
│  Railway Deployment         │
│  (Multi-Tenant Server)      │
└────────┬────────────────────┘
         │ 2. Returns device_code + user_code
         ▼
┌─────────────────────────────┐
│  User visits auth page      │
│  - Enters user_code         │
│  - Enters Figma token       │
└────────┬────────────────────┘
         │ 3. Token stored in Redis
         ▼
┌─────────────────────────────┐
│  Client polls for token     │
│  - Gets access_token        │
│  - Uses Bearer auth         │
└────────┬────────────────────┘
         │ 4. Ready to use tools!
         ▼
┌─────────────────────────────┐
│  Figma Smart Image Tools    │
│  - process_figma_link       │
│  - process_figma_frame      │
│  - list_figma_frames        │
└─────────────────────────────┘
```

## Available Tools

### `process_figma_link`
Processes a Figma URL and returns tiled image data.

**Input:**
```json
{
  "url": "https://www.figma.com/design/...",
  "format": "png",  // or "svg"
  "tiles": true     // enable auto-tiling
}
```

**Returns:**
- Base64 encoded image data (tiled if needed)
- Frame metadata
- Tile count and dimensions

### `process_figma_frame`
Accesses a specific frame by node ID.

**Input:**
```json
{
  "fileKey": "abc123",
  "nodeId": "1:4",
  "format": "svg"
}
```

### `list_figma_frames`
Lists all frames in a Figma file.

**Input:**
```json
{
  "fileKey": "abc123"
}
```

## Authentication Flow (Technical Details)

### OAuth Device Code Flow

The server uses the OAuth 2.0 Device Authorization Grant:

1. **Device Authorization Request**
```bash
POST /device/authorize
Content-Type: application/json

{
  "client_id": "mcp_client"
}

Response:
{
  "device_code": "device_xxx",
  "user_code": "ABC123",
  "verification_uri": "https://...",
  "expires_in": 600
}
```

2. **User Authentication**
```bash
POST /auth
Content-Type: application/x-www-form-urlencoded

user_code=ABC123&token=figd_xxx
```

3. **Token Polling**
```bash
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=device_xxx

Response:
{
  "access_token": "device_xxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

4. **Authenticated Requests**
```bash
POST /message?sessionId=xxx
Authorization: Bearer device_xxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { ... }
}
```

## Local Development

To run locally:

```bash
# Install dependencies
npm install

# Set your Figma token (optional - multi-tenant mode works without it)
export FIGMA_TOKEN="your_figma_token_here"

# Build
npm run build

# Run server
npm start
```

For local development with Redis:
```bash
# Using Docker
docker run -d -p 6379:6379 redis

# Set Redis URL
export REDIS_URL="redis://localhost:6379"
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `FIGMA_TOKEN` | Figma Personal Access Token (optional for multi-tenant) | - |
| `REDIS_URL` | Redis connection URL for multi-tenant token storage | - |
| `PORT` | HTTP server port | 3845 |

## Architecture

- **Transport**: HTTP with Server-Sent Events (SSE)
- **Storage**: Redis for device codes and session tokens
- **Authentication**: OAuth 2.0 Device Authorization Grant
- **Deployment**: Railway (Docker container)

## Security

- Each user's Figma token is isolated in Redis
- Tokens expire after 1 hour
- Device codes expire after 10 minutes
- Bearer token required for all MCP requests

## License

MIT

## Support

For issues and questions, please use the GitHub Issues page.
