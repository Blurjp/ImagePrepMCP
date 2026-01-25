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
