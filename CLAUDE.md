# Project Notes for Claude (AI Assistant)

## Critical Debugging Lessons Learned

### 1. Dockerfile Build Order Issue (RESOLVED)

**Problem**: The Dockerfile had a critical flaw in the build process:

```dockerfile
# WRONG ORDER (before fix):
COPY figma-smart-image-mcp/package.json ... ./   # Copy package files
RUN npm install                                    # postinstall → npm run build → tsc
                                                   # ↑ tsc runs HERE, but src doesn't exist yet!
COPY figma-smart-image-mcp/src ./src              # Source files copied too late
```

The `package.json` contains:
```json
"postinstall": "npm run build"
```

When `npm install` runs, it automatically executes `postinstall` → `npm run build` → `tsc`. But at that point, the source files (`src/`) haven't been copied yet, so TypeScript can't find anything to compile.

**Error message**:
```
error TS18003: No inputs were found in config file '/app/tsconfig.json'.
Specified 'include' paths were '["src/**/*"]' and 'exclude' paths were '["node_modules","dist"]'.
```

**Solution**: Skip postinstall during npm install, then build explicitly after copying source files:

```dockerfile
# CORRECT ORDER (after fix):
COPY figma-smart-image-mcp/package.json figma-smart-image-mcp/package-lock.json* figma-smart-image-mcp/tsconfig.json ./
RUN npm install --ignore-scripts    # ← Skip postinstall to avoid premature build
COPY figma-smart-image-mcp/src ./src
RUN npm run build                   # ← Now build explicitly after sources are copied
```

### 2. Project Structure (Canonical Source)

**Current State (authoritative)**: The **only** project that is used/deployed is the nested one:
- `/Users/jianping/projects/ImagePrepMCP/figma-smart-image-mcp/`

**Not used**:
- `/Users/jianping/projects/ImagePrepMCP/` (root-level project) is legacy and should be ignored for edits/deploys.

**Guideline**: Edit/build/commit only inside `figma-smart-image-mcp/` and its `src/` + `dist/`.

### 3. Railway Deployment Configuration

**Key Discovery**: Railway uses **DOCKERFILE** for this project, NOT Nixpacks.

**Railway config shows**:
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

**Implication**: Any changes to the code require:
1. Correct Dockerfile
2. `git push` to trigger Railway build
3. Wait for Docker build to complete (can take 1-2 minutes)
4. Verify the new code is actually deployed

### 4. JSON Syntax Rules

**Critical**: JSON files (like `package.json`) **CANNOT have comments**.

**Wrong**:
```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
# This comment breaks JSON!
```

**Correct**:
```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 5. TypeScript Module Configuration Issues

**Problem**: Using `const require = createRequire(import.meta.url)` caused TypeScript errors with `module: "Node16"`.

**Error**:
```
error TS2441: Duplicate identifier 'require'.
Compiler reserves name 'require' in top level scope of a module.
```

**Solution**: Rename the variable:
```typescript
const nodeRequire = createRequire(import.meta.url);
const svg2img = nodeRequire("svg2img");
```

Also updated `tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "Bundler"
  }
}
```

### 6. Redis Persistence Testing

For testing Redis persistence on Railway:

```bash
# Step 1: Write test key
curl -s "https://your-app.railway.app/health?debug=set_probe"

# Step 2: Verify key exists
curl -s "https://your-app.railway.app/health?debug=get_probe"
# Should return: {"persist_probe":"ok","exists":true}

# Step 3: Trigger Railway redeploy (via dashboard)

# Step 4: Check if data persisted
curl -s "https://your-app.railway.app/health?debug=get_probe"
# If still exists: {"persist_probe":"ok","exists":true} → Persistence works!
# If null: {"persist_probe":null,"exists":false} → Data was lost
```

### 7. Debug Endpoint Pattern

When debugging production issues, add debug endpoints that return different responses:

```typescript
// In health endpoint handler
const debugAction = url.searchParams.get("debug");
if (debugAction === "test") {
  res.end(JSON.stringify({ debug: "active", data: ... }));
  return;
}
// Normal health check continues...
```

**Usage**: `curl "https://app.com/health?debug=test"`

## Current Status

✅ Dockerfile build order fixed
✅ New code successfully deployed
✅ Debug endpoints working

## OAuth Auto-Approval Feature

The code includes auto-approval for device codes when OAuth tokens exist in Redis:

```typescript
// In /device/authorize endpoint
const mostRecent = await sessionTokensStorage.getMostRecent();
const hasOAuthToken = !!mostRecent?.value?.token;

await deviceCodesStorage.set(deviceCode, {
  verified: !!this.figmaToken || hasOAuthToken,
  figmaToken: hasOAuthToken ? mostRecent.value.token : this.figmaToken,
});
```

This allows MCP clients to auto-connect without manual authentication when OAuth tokens are already available.

---

**Last updated**: January 24, 2026
**Deployment SHA**: fc33797

## MCP Auth + Transport Lessons (Do Not Regress)

### 1. Canonical Project
- The only deployed code lives in `figma-smart-image-mcp/`.
- Do not edit root-level app code (it was removed).

### 2. Claude Desktop Uses Streamable HTTP + OAuth Code Flow
- Claude’s built-in HTTP client uses **Streamable HTTP** and **OAuth authorization_code + PKCE**.
- Device-code flow is insufficient alone.
- Required endpoints:
  - `/.well-known/oauth-protected-resource` (RFC 9728)
  - `/.well-known/oauth-authorization-server`
  - `/oauth/authorize` (handles MCP PKCE requests)
  - `/oauth/token` (handles `authorization_code` + PKCE)
- If missing, Claude will show “Auth: not authenticated”.

### 3. Always Enforce OAuth on `/mcp`
- Return `401` with `WWW-Authenticate: Bearer … resource_metadata=...` on **all** `/mcp` requests without Bearer token (including GET SSE).
- This forces Claude to start OAuth instead of connecting unauthenticated.

### 4. Streamable HTTP Must Be Stateless
- `StreamableHTTPServerTransport` must be **stateless** (`sessionIdGenerator: undefined`).
- Stateful mode causes “Server already initialized” and random failures.

### 5. MCP OAuth Flow Bridges Figma OAuth
- `/oauth/authorize`:
  - If MCP `client_id` + `redirect_uri` present, mint short-lived **auth code** from existing Figma OAuth token in Redis.
  - If no token, redirect to `/` with `?next=` to complete Figma login then resume.
- `/oauth/token`:
  - Verify PKCE and exchange auth code for access token.
  - Store access token in Redis as key → Figma token for multi-tenant usage.

### 6. Auth Page UX
- The auth page should **not** say “Not connected” if OAuth token exists.
- Page now fetches `/health` to show accurate state.
- Fix JS top-level `return` errors (caused “Illegal return statement”).
- The home page now resumes MCP OAuth automatically via `next` param.

### 7. Figma 403 vs Timeout
- **403** from Figma API means the token lacks access to the file.
- Timeouts usually come from large files or root `node-id=0-1`.
- Use a specific frame node-id or the `list_figma_frames` tool to avoid full file fetch.
- If the user says their environment hasn't changed, assume token/account mismatch first and verify with `debug_figma_access`.

### 8. New Tool: `list_figma_frames`
- Uses `depth=2` to quickly list top-level frames/components with node IDs.
- Helps avoid expensive full-file fetches.

### 9. New Tool: `debug_figma_access`
- Returns `/v1/me` (which Figma user the token belongs to) and a shallow file access check.
- Use this when the user says “the file is mine but I still get 403”.
- If `access.statusCode` is 403, the OAuth token is for a different Figma account or lacks file sharing access.

### 10. Server Timeouts (Env)
- `MCP_TOOL_TIMEOUT_MS` / `FIGMA_TOOL_TIMEOUT_MS` (default 60000) controls tool execution.
- `FIGMA_REQUEST_TIMEOUT_MS` controls Figma API + image download timeout.

### 11. Build Artifacts + Git Hygiene
- Root `.gitignore` ignores root `/dist`, `/out`, and `node_modules/`.
- Keep `figma-smart-image-mcp/dist` tracked.
