# Figma Smart Image MCP Server

A Model Context Protocol (MCP) server that processes Figma designs into Claude-readable images with automatic tiling, compression, and smart cropping.

Note: The canonical source for the server lives in `figma-smart-image-mcp/`. The root directory only contains docs and deployment helpers.

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
│  - get_figma_components     │
│  - get_figma_node_details   │
│  - get_figma_variables      │
│  - list_figma_frames        │
└─────────────────────────────┘
```

## Available Tools

### `process_figma_link`
Processes a Figma URL and exports images + tiles to disk.

**Input:**
```json
{
  "url": "https://www.figma.com/design/...",
  "out_dir": "/path/to/output",
  "prefer_format": "webp"
}
```

### `get_figma_components`
Lists all components and component sets in a Figma file.

**Input:**
```json
{
  "url": "https://www.figma.com/design/..."
}
```

### `get_figma_node_details`
Returns layout + styling details for a specific node.

**Input:**
```json
{
  "url": "https://www.figma.com/design/...?...&node-id=1-123"
}
```

### `get_figma_variables`
Returns design variables (requires Figma Pro plan or higher).

**Input:**
```json
{
  "url": "https://www.figma.com/design/..."
}
```

### `list_figma_frames`
Lists top-level frames/components using a shallow fetch.

**Input:**
```json
{
  "url": "https://www.figma.com/design/...",
  "max_frames": 200
}
```

### `debug_figma_access`
Shows which Figma user the token belongs to and whether the file is accessible.

**Input:**
```json
{
  "url": "https://www.figma.com/design/..."
}
```

## Authentication Flow (Technical Details)

### OAuth Authorization Code + PKCE (Claude Desktop)

Claude Desktop uses the authorization_code + PKCE flow. If the token isn't available yet,
the server will redirect you to the home page to authenticate with Figma, then resume
the OAuth redirect automatically.

### OAuth Device Code Flow (Legacy CLI)

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

## Timeouts

- `MCP_TOOL_TIMEOUT_MS` / `FIGMA_TOOL_TIMEOUT_MS` (default: `60000`) controls total tool execution time.
- `FIGMA_REQUEST_TIMEOUT_MS` controls individual Figma API + image download requests.

**Recommendation**: For large Figma files, set both to `120000` (120s) to avoid timeouts.

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
