#!/usr/bin/env node
/**
 * Figma Smart Image MCP Server
 *
 * A Model Context Protocol server that processes Figma design links
 * into Claude-readable images with automatic tiling and compression.
 *
 * Supports both stdio and HTTP (SSE) transports.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createServer as createHttpServer } from "http";
import { URL } from "url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { FigmaLinkParser } from "./figma/parse_link.js";
import { FigmaApiClient } from "./figma/api.js";
import { FigmaExporter } from "./figma/export.js";
import { ImageEncoder } from "./image/encode.js";
import { ImageTiler } from "./image/tiles.js";
import { ImageCropper } from "./image/crops.js";
import { generateOutputDir, writeManifest, getDisplayPath, formatBytes, } from "./util/fs.js";
// Tool input schemas
const ProcessFigmaLinkInputSchema = z.object({
    url: z.string().url("Must be a valid URL"),
    out_dir: z.string().optional(),
    max_bytes: z.number().int().positive().optional(),
    max_long_edge: z.number().int().positive().optional(),
    tile_px: z.number().int().positive().optional(),
    overlap_px: z.number().int().nonnegative().optional(),
    prefer_format: z.enum(["webp", "jpeg"]).optional(),
    force_source_format: z.enum(["auto", "svg", "png"]).optional(),
    include_crops: z.boolean().optional(),
});
// Default constants
const DEFAULT_MAX_BYTES = 4_000_000; // 4MB
const DEFAULT_MAX_LONG_EDGE = 4096;
const DEFAULT_TILE_PX = 1536;
const DEFAULT_OVERLAP_PX = 96;
const DEFAULT_PREFER_FORMAT = "webp";
const DEFAULT_FORCE_SOURCE_FORMAT = "auto";
const DEFAULT_INCLUDE_CROPS = false;
const TRANSPORT_MODE = (process.env.TRANSPORT_MODE || parseArg("--transport") || "stdio");
const HTTP_PORT = parseInt(process.env.HTTP_PORT || parseArg("--port") || "3845", 10);
function parseArg(argName) {
    const argIndex = process.argv.findIndex((arg) => arg === argName);
    if (argIndex !== -1 && argIndex + 1 < process.argv.length) {
        return process.argv[argIndex + 1];
    }
    return undefined;
}
// Token storage directory and file
const TOKEN_DIR = join(homedir(), ".figma-smart-image-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "token");
// Ensure token directory exists with proper permissions
try {
    if (!existsSync(TOKEN_DIR)) {
        mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
    }
}
catch (error) {
    // Directory creation failed, will handle gracefully
}
/**
 * Load Figma token from file
 */
function loadTokenFromFile() {
    try {
        if (existsSync(TOKEN_FILE)) {
            const token = readFileSync(TOKEN_FILE, "utf-8").trim();
            if (token) {
                return token;
            }
        }
    }
    catch (error) {
        // Silently fail - token file might not exist or be unreadable
    }
    return "";
}
/**
 * Save Figma token to file with secure permissions
 */
function saveTokenToFile(token) {
    try {
        if (!existsSync(TOKEN_DIR)) {
            mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
        }
        writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    }
    catch (error) {
        console.error("Warning: Failed to save token to file:", error);
    }
}
// Simple rate limiter for API abuse prevention
class RateLimiter {
    requests;
    maxRequests;
    windowMs;
    constructor(maxRequests = 100, windowMs = 60000) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        // Clean up expired entries every minute
        setInterval(() => this.cleanup(), 60000);
    }
    check(identifier) {
        const now = Date.now();
        const record = this.requests.get(identifier);
        if (!record || now > record.resetTime) {
            // First request or window expired
            this.requests.set(identifier, {
                count: 1,
                resetTime: now + this.windowMs,
            });
            return true;
        }
        if (record.count >= this.maxRequests) {
            return false;
        }
        record.count++;
        return true;
    }
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.requests.entries()) {
            if (now > record.resetTime) {
                this.requests.delete(key);
            }
        }
    }
    getStats() {
        let totalRequests = 0;
        for (const record of this.requests.values()) {
            totalRequests += record.count;
        }
        return {
            totalClients: this.requests.size,
            totalRequests,
        };
    }
}
class FigmaSmartImageServer {
    server;
    figmaToken; // Default token (from env/file for local dev)
    transportMode;
    deviceCodes;
    // Multi-tenant: Store tokens per session for hosted deployments
    sessionTokens;
    sessionTransports; // Track transports per session
    rateLimiter;
    constructor(transportMode = "stdio") {
        this.transportMode = transportMode;
        // Load token from: 1) Environment variable, 2) File, 3) Empty
        this.figmaToken = process.env.FIGMA_TOKEN || loadTokenFromFile() || "";
        this.deviceCodes = new Map();
        this.sessionTokens = new Map();
        this.sessionTransports = new Map();
        // Rate limiting: 100 requests per minute per IP
        this.rateLimiter = new RateLimiter(100, 60000);
        // Clean up expired sessions every 5 minutes
        setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
        this.server = new Server({
            name: "figma-smart-image-mcp",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    /**
     * Get token for a specific session
     * Returns session token if available, otherwise falls back to global token
     */
    getTokenForSession(sessionId) {
        const sessionData = this.sessionTokens.get(sessionId);
        if (sessionData && sessionData.token) {
            return sessionData.token;
        }
        return this.figmaToken;
    }
    /**
     * Clean up expired sessions (older than 1 hour)
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour
        for (const [sessionId, data] of this.sessionTokens.entries()) {
            if (now - data.createdAt > maxAge) {
                this.sessionTokens.delete(sessionId);
                this.sessionTransports.delete(sessionId);
            }
        }
    }
    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "process_figma_link",
                        description: "Process a Figma design link and generate Claude-readable images. " +
                            "Automatically exports the design, creates an overview image, and splits " +
                            "it into tiles if needed. All images are compressed to meet size constraints.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                url: { type: "string", description: "The Figma design URL" },
                                out_dir: { type: "string", description: "Output directory path" },
                                max_bytes: { type: "number", description: "Maximum size for each image (default 4000000)" },
                                max_long_edge: { type: "number", description: "Maximum width/height in pixels (default 4096)" },
                                tile_px: { type: "number", description: "Size of each tile (default 1536)" },
                                overlap_px: { type: "number", description: "Overlap between tiles (default 96)" },
                                prefer_format: { type: "string", enum: ["webp", "jpeg"], description: "Output format for processed images" },
                                force_source_format: { type: "string", enum: ["auto", "svg", "png"], description: "Force specific export format" },
                                include_crops: { type: "boolean", description: "Generate heuristic crops" },
                            },
                            required: ["url"],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "process_figma_link") {
                return await this.handleProcessFigmaLink(request.params.arguments);
            }
            throw new Error(`Unknown tool: ${request.params.name}`);
        });
    }
    async handleProcessFigmaLink(args) {
        // Extract session ID from metadata if available (for multi-tenant support)
        const sessionId = args._meta?.sessionId;
        const token = this.getTokenForSession(sessionId || "");
        if (!token) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Figma token is not configured. Please visit the authentication page to set your Figma access token.",
                    },
                ],
                isError: true,
            };
        }
        try {
            // Validate input
            const validated = ProcessFigmaLinkInputSchema.parse(args);
            const { url, out_dir, max_bytes = DEFAULT_MAX_BYTES, max_long_edge = DEFAULT_MAX_LONG_EDGE, tile_px = DEFAULT_TILE_PX, overlap_px = DEFAULT_OVERLAP_PX, prefer_format = DEFAULT_PREFER_FORMAT, force_source_format = DEFAULT_FORCE_SOURCE_FORMAT, include_crops = DEFAULT_INCLUDE_CROPS, } = validated;
            // Parse Figma URL
            let parsed;
            try {
                parsed = FigmaLinkParser.parse(url);
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to parse Figma URL: ${error}`,
                        },
                    ],
                    isError: true,
                };
            }
            // Set up output directory
            const outputDir = out_dir || generateOutputDir();
            // Initialize clients with session-specific token
            const api = new FigmaApiClient(token);
            const exporter = new FigmaExporter(api);
            const encoder = new ImageEncoder();
            const tiler = new ImageTiler(encoder);
            const cropper = new ImageCropper(encoder);
            // Determine which node to export
            let nodeId = parsed.nodeId;
            let nodeName = "";
            if (!nodeId) {
                // No node-id in URL, try to find a suitable node
                try {
                    const selection = await api.findFirstNode(parsed.fileKey);
                    nodeId = selection.nodeId;
                    nodeName = selection.nodeName;
                }
                catch (error) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Failed to find a suitable node in the Figma file: ${error}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }
            // Export and download the source image
            let exportedImage;
            try {
                exportedImage = await exporter.exportAndDownload(parsed.fileKey, nodeId, outputDir, force_source_format);
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to export image from Figma: ${error}`,
                        },
                    ],
                    isError: true,
                };
            }
            // Convert SVG to PNG for processing if needed
            let sourceForProcessing = exportedImage.path;
            if (exportedImage.format === "svg") {
                try {
                    const pngPath = exportedImage.path.replace(/\.svg$/, ".png");
                    await encoder.convertSvgToPng(exportedImage.path, pngPath, 2);
                    sourceForProcessing = pngPath;
                }
                catch (error) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Failed to convert SVG to PNG: ${error}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }
            // Generate overview image
            let overview;
            try {
                const overviewPath = sourceForProcessing.replace(/\.(png|jpg|jpeg|webp)$/, `_overview.${prefer_format}`);
                overview = await encoder.encodeToFit(sourceForProcessing, overviewPath, {
                    maxBytes: max_bytes,
                    maxLongEdge: max_long_edge,
                    preferFormat: prefer_format,
                });
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to generate overview image: ${error}`,
                        },
                    ],
                    isError: true,
                };
            }
            // Generate tiles
            let tiles = [];
            try {
                const tilesDir = outputDir + "/tiles";
                tiles = await tiler.generateTiles(sourceForProcessing, tilesDir, {
                    tilePx: tile_px,
                    overlapPx: overlap_px,
                    maxBytes: max_bytes,
                    maxLongEdge: max_long_edge,
                    preferFormat: prefer_format,
                });
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to generate tiles: ${error}`,
                        },
                    ],
                    isError: true,
                };
            }
            // Generate crops if requested
            let crops = [];
            if (include_crops) {
                try {
                    const cropsDir = outputDir + "/crops";
                    crops = await cropper.generateCrops(sourceForProcessing, cropsDir, {
                        maxBytes: max_bytes,
                        maxLongEdge: max_long_edge,
                        preferFormat: prefer_format,
                        minCropSize: 768,
                    });
                }
                catch (error) {
                    // Don't fail on crops error, just log it
                    console.warn(`Failed to generate crops: ${error}`);
                }
            }
            // Write manifest
            const manifestPath = outputDir + "/manifest.json";
            await writeManifest(manifestPath, {
                version: "1.0.0",
                timestamp: Date.now(),
                selected: {
                    fileKey: parsed.fileKey,
                    nodeId: nodeId,
                    sourceFormatUsed: exportedImage.format,
                    originalPath: exportedImage.path,
                },
                overview: {
                    path: overview.path,
                    bytes: overview.bytes,
                    width: overview.width,
                    height: overview.height,
                    format: overview.format,
                    quality: overview.quality,
                    scaleFactor: overview.scaleFactor,
                },
                tiles: tiles.map((t) => ({
                    path: t.path,
                    x: t.x,
                    y: t.y,
                    w: t.w,
                    h: t.h,
                    bytes: t.bytes,
                    width: t.width,
                    height: t.height,
                })),
                crops: crops.length > 0
                    ? crops.map((c) => ({
                        path: c.path,
                        name: c.name,
                        x: c.x,
                        y: c.y,
                        w: c.w,
                        h: c.h,
                        bytes: c.bytes,
                        width: c.width,
                        height: c.height,
                    }))
                    : undefined,
            });
            // Format response
            let responseText = `Successfully processed Figma design\n\n`;
            responseText += `Source: ${parsed.fileKey}${nodeId ? ` (node: ${nodeId})` : ""}\n`;
            if (nodeName) {
                responseText += `Selected node: "${nodeName}" (node-id was not provided in URL, auto-selected first frame)\n`;
            }
            responseText += `Export format: ${exportedImage.format}\n\n`;
            responseText += `Output directory: ${getDisplayPath(outputDir)}\n\n`;
            responseText += `Overview:\n`;
            responseText += `  Path: ${getDisplayPath(overview.path)}\n`;
            responseText += `  Size: ${overview.width}x${overview.height}\n`;
            responseText += `  Bytes: ${formatBytes(overview.bytes)}\n`;
            responseText += `  Format: ${overview.format} (quality: ${overview.quality})\n\n`;
            responseText += `Tiles: ${tiles.length}\n`;
            for (const tile of tiles) {
                responseText += `  ${getDisplayPath(tile.path)}: ${tile.width}x${tile.height} at (${tile.x},${tile.y}) - ${formatBytes(tile.bytes)}\n`;
            }
            if (crops.length > 0) {
                responseText += `\nCrops: ${crops.length}\n`;
                for (const crop of crops) {
                    responseText += `  ${getDisplayPath(crop.path)}: ${crop.name} - ${crop.width}x${crop.height} - ${formatBytes(crop.bytes)}\n`;
                }
            }
            responseText += `\nManifest: ${getDisplayPath(manifestPath)}\n`;
            return {
                content: [
                    {
                        type: "text",
                        text: responseText,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    }
    async runStdio() {
        if (!this.figmaToken) {
            throw new Error("FIGMA_TOKEN environment variable is required. " +
                "Please set it with your Figma personal access token.");
        }
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
    runHttp(port) {
        // Store the transport instance to handle POST messages
        // Using a Map to support multiple concurrent connections
        const transports = new Map();
        const httpServer = createHttpServer(async (req, res) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            // Rate limiting: use IP address as identifier (skip for health check)
            const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
            if (url.pathname !== "/health") {
                if (!this.rateLimiter.check(clientIp)) {
                    res.writeHead(429, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({
                        error: "Too many requests",
                        message: "Rate limit exceeded. Please try again later.",
                    }));
                    return;
                }
            }
            // CORS headers for OAuth endpoints
            const corsHeaders = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            };
            // Handle OPTIONS preflight
            if (req.method === "OPTIONS") {
                res.writeHead(204, corsHeaders);
                res.end();
                return;
            }
            // OAuth discovery endpoint - required by MCP HTTP transport
            // We provide minimal OAuth response for compatibility, but use simple token auth
            if (url.pathname === "/.well-known/oauth-authorization-server") {
                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                res.end(JSON.stringify({
                    issuer: `http://localhost:${port}`,
                    authorization_endpoint: `http://localhost:${port}/`,
                    token_endpoint: `http://localhost:${port}/oauth/token`,
                    registration_endpoint: `http://localhost:${port}/register`,
                    device_authorization_endpoint: `http://localhost:${port}/device/authorize`,
                    response_types_supported: ["code"],
                    grant_types_supported: ["authorization_code", "urn:ietf:params:oauth:grant-type:device_code"],
                    code_challenge_methods_supported: ["S256"],
                    token_endpoint_auth_methods_supported: ["none"],
                }));
                return;
            }
            // OAuth device authorization endpoint - returns info about web auth
            if (url.pathname === "/oauth/device_authorization" && req.method === "POST") {
                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                res.end(JSON.stringify({
                    device_code: "web_auth",
                    user_code: "WEB",
                    verification_uri: `http://localhost:${port}/`,
                    verification_uri_complete: `http://localhost:${port}/`,
                    expires_in: 300,
                    interval: 5,
                }));
                return;
            }
            // OAuth token endpoint - handles device code polling and token requests
            if (url.pathname === "/oauth/token" && req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => { body += chunk.toString(); });
                req.on("end", () => {
                    const params = new URLSearchParams(body);
                    const grantType = params.get("grant_type");
                    const deviceCode = params.get("device_code");
                    // Device code flow polling
                    if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
                        if (!deviceCode) {
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "invalid_grant",
                                error_description: "Missing device_code",
                            }));
                            return;
                        }
                        const deviceInfo = this.deviceCodes.get(deviceCode);
                        if (!deviceInfo) {
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "invalid_grant",
                                error_description: "Invalid or expired device code",
                            }));
                            return;
                        }
                        // Check if expired (10 minutes)
                        if (Date.now() - deviceInfo.createdAt > 600000) {
                            this.deviceCodes.delete(deviceCode);
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "expired_token",
                                error_description: "Device code has expired",
                            }));
                            return;
                        }
                        // Check if user has authenticated
                        if (this.figmaToken && deviceInfo.verified) {
                            // User has entered their Figma token
                            res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                access_token: "figma_auth_ok",
                                token_type: "Bearer",
                                expires_in: 3600,
                            }));
                        }
                        else {
                            // Still waiting for user to authenticate
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "authorization_pending",
                                error_description: "Please visit http://localhost:" + port + "/ to authenticate with your Figma token",
                            }));
                        }
                        return;
                    }
                    // Regular token request
                    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                    res.end(JSON.stringify({
                        access_token: this.figmaToken || "mcp_auth_ok",
                        token_type: "Bearer",
                        expires_in: 3600,
                    }));
                });
                return;
            }
            // Device authorization endpoint - for OAuth device code flow
            if (url.pathname === "/device/authorize" && req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => { body += chunk.toString(); });
                req.on("end", () => {
                    try {
                        const params = new URLSearchParams(body);
                        const clientId = params.get("client_id");
                        // Generate a device code for this authorization request
                        const deviceCode = "device_" + Math.random().toString(36).substring(2, 15);
                        const userCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                        // Store device code for later verification
                        this.deviceCodes.set(deviceCode, {
                            userCode,
                            clientId: clientId || "unknown",
                            createdAt: Date.now(),
                            verified: !!this.figmaToken, // Auto-verify if token already exists
                        });
                        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                        res.end(JSON.stringify({
                            device_code: deviceCode,
                            user_code: userCode,
                            verification_uri: `http://localhost:${port}/`,
                            verification_uri_complete: `http://localhost:${port}/`,
                            expires_in: 600,
                            interval: 2,
                        }));
                    }
                    catch (error) {
                        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                        res.end(JSON.stringify({ error: "invalid_request" }));
                    }
                });
                return;
            }
            // Dynamic client registration endpoint - for compatibility
            if (url.pathname === "/register" && req.method === "POST") {
                res.writeHead(201, { "Content-Type": "application/json", ...corsHeaders });
                res.end(JSON.stringify({
                    client_id: "mcp_client",
                    client_id_issued_at: Math.floor(Date.now() / 1000),
                    client_secret_expires_at: 0,
                    grant_types: ["urn:ietf:params:oauth:grant-type:device_code"],
                    token_endpoint_auth_method: "none",
                    response_types: ["code"],
                    redirect_uris: [],
                }));
                return;
            }
            // Health check endpoint
            if (url.pathname === "/health") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    status: "ok",
                    hasToken: !!this.figmaToken,
                    activeSessions: this.sessionTokens.size,
                    activeTransports: this.sessionTransports.size,
                }));
                return;
            }
            // Authentication page
            if (url.pathname === "/") {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(this.getAuthPage());
                return;
            }
            // Auth endpoint - GET for status, POST to set token
            if (url.pathname === "/auth") {
                if (req.method === "GET") {
                    // Check if a specific session is being queried
                    const sessionId = url.searchParams.get("session_id");
                    const hasToken = sessionId ? !!this.sessionTokens.get(sessionId)?.token : !!this.figmaToken;
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        authenticated: hasToken,
                        hasToken: hasToken
                    }));
                    return;
                }
                if (req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk) => {
                        body += chunk.toString();
                    });
                    req.on("end", () => {
                        try {
                            const params = new URLSearchParams(body);
                            const token = params.get("token") || "";
                            const sessionId = params.get("session_id") || "";
                            if (sessionId) {
                                // Multi-tenant mode: store token for this session
                                if (token) {
                                    this.sessionTokens.set(sessionId, {
                                        token,
                                        createdAt: Date.now(),
                                    });
                                }
                            }
                            else {
                                // Single-tenant mode: store global token (for local dev)
                                this.figmaToken = token;
                                if (token) {
                                    saveTokenToFile(token);
                                }
                            }
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ success: true, authenticated: true, sessionId }));
                        }
                        catch (error) {
                            res.writeHead(400, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Invalid request" }));
                        }
                    });
                    return;
                }
            }
            // MCP endpoint - handles both GET (SSE) and POST (direct) requests
            if (url.pathname === "/mcp") {
                if (req.method === "GET") {
                    // Set CORS headers before transport takes over
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                    // Create SSE transport and connect to server
                    const transport = new SSEServerTransport("/message", res);
                    await this.server.connect(transport);
                    // Store transport by session ID for multi-tenant support
                    transports.set(transport.sessionId, transport);
                    this.sessionTransports.set(transport.sessionId, transport);
                    // Clean up when connection closes
                    res.on("close", () => {
                        transports.delete(transport.sessionId);
                        this.sessionTransports.delete(transport.sessionId);
                        // Also clean up session token on disconnect
                        this.sessionTokens.delete(transport.sessionId);
                    });
                    return;
                }
                if (req.method === "POST") {
                    // For POST requests, we can't use SSEServerTransport directly
                    // Return an error indicating SSE is required
                    res.writeHead(405, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Use SSE (GET) for MCP communication" }));
                    return;
                }
                res.writeHead(405, { "Content-Type": "text/plain" });
                res.end("Method Not Allowed");
                return;
            }
            // Message endpoint for POST requests from SSE client
            if (url.pathname === "/message" && req.method === "POST") {
                // Extract session ID from query string
                const sessionId = url.searchParams.get("sessionId");
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing sessionId" }));
                    return;
                }
                const transport = transports.get(sessionId);
                if (!transport) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Session not found" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk) => {
                    body += chunk.toString();
                });
                req.on("end", async () => {
                    try {
                        let parsedBody = JSON.parse(body);
                        // Inject session ID into request metadata for multi-tenant token support
                        if (parsedBody.params && typeof parsedBody.params === 'object') {
                            parsedBody.params._meta = {
                                ...parsedBody.params._meta,
                                sessionId: sessionId,
                            };
                        }
                        await transport.handlePostMessage(req, res, parsedBody);
                    }
                    catch (error) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Failed to handle message" }));
                    }
                });
                return;
            }
            // 404
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        });
        httpServer.listen(port, () => {
            console.error(`Figma Smart Image MCP Server running on HTTP port ${port}`);
            console.error(`MCP endpoint: http://localhost:${port}/mcp`);
            console.error(`Auth page: http://localhost:${port}/`);
            if (!this.figmaToken) {
                console.error(`\nWARNING: FIGMA_TOKEN not set. Please visit http://localhost:${port}/ to authenticate.`);
            }
        });
    }
    getAuthPage() {
        const port = HTTP_PORT;
        const hasToken = !!this.figmaToken;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Figma Smart Image MCP Server</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #252542;
      border-radius: 16px;
      padding: 48px;
      max-width: 580px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: #fff;
      font-size: 28px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #f24e1e 0%, #ff7262 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 22px;
      color: white;
    }
    .subtitle {
      color: #a0a0b8;
      font-size: 16px;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .status {
      background: ${hasToken ? '#2d6a4f' : '#3a3a5c'};
      padding: 12px 16px;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      margin-bottom: 32px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${hasToken ? '#4ade80' : '#fbbf24'};
    }
    .form-group {
      margin-bottom: 24px;
    }
    label {
      display: block;
      color: #e0e0e8;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #3a3a5c;
      border-radius: 8px;
      background: #1a1a2e;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #f24e1e;
    }
    .help-text {
      color: #a0a0b8;
      font-size: 13px;
      margin-top: 8px;
      line-height: 1.4;
    }
    .help-text a {
      color: #f24e1e;
      text-decoration: none;
    }
    .help-text a:hover {
      text-decoration: underline;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #f24e1e 0%, #ff7262 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    .success {
      background: #2d6a4f;
      padding: 12px;
      border-radius: 8px;
      color: #fff;
      margin-top: 16px;
      display: none;
      text-align: center;
    }
    .error {
      background: #c1121f;
      padding: 12px;
      border-radius: 8px;
      color: #fff;
      margin-top: 16px;
      display: none;
      text-align: center;
    }
    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 32px;
    }
    .feature {
      background: #1a1a2e;
      border-radius: 10px;
      padding: 16px;
    }
    .feature-icon {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .feature-title {
      color: #e0e0e8;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .feature-desc {
      color: #a0a0b8;
      font-size: 12px;
      line-height: 1.4;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #3a3a5c;
      text-align: center;
      color: #707090;
      font-size: 13px;
    }
    .footer code {
      background: #1a1a2e;
      padding: 4px 8px;
      border-radius: 4px;
      color: #4ade80;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><div class="icon">F</div>Figma Smart Image MCP</h1>
    <p class="subtitle">Process Figma designs into Claude-readable images with automatic tiling and optimization.</p>

    <div class="status">
      <div class="status-dot"></div>
      <span>${hasToken ? 'Connected to Figma' : 'Not connected - Enter your Figma token'}</span>
    </div>

    ${!hasToken ? `
    <form id="authForm">
      <div class="form-group">
        <label for="token">Figma Personal Access Token</label>
        <input type="password" id="token" name="token" required placeholder="figd_..." autocomplete="off">
        <p class="help-text">
          Get your token from <a href="https://www.figma.com/settings" target="_blank">Figma Settings</a>.
          Create a personal access token with file read access. Token will be saved locally for convenience.
        </p>
      </div>
      <button type="submit">Connect to Figma</button>
    </form>

    <div id="success" class="success">✓ Connected! You can now use this MCP server.</div>
    <div id="error" class="error"></div>
    ` : ''}

    <div class="features">
      <div class="feature">
        <div class="feature-icon">🎨</div>
        <div class="feature-title">Smart Export</div>
        <div class="feature-desc">Automatic SVG/PNG export</div>
      </div>
      <div class="feature">
        <div class="feature-icon">📐</div>
        <div class="feature-title">Auto Tiling</div>
        <div class="feature-desc">Large designs split into tiles</div>
      </div>
      <div class="feature">
        <div class="feature-icon">🗜️</div>
        <div class="feature-title">Compression</div>
        <div class="feature-desc">Optimized for size limits</div>
      </div>
      <div class="feature">
        <div class="feature-icon">🔍</div>
        <div class="feature-title">Smart Crops</div>
        <div class="feature-desc">Heuristic UI pattern crops</div>
      </div>
    </div>

    <div class="footer">
      Add via: <code>claude mcp add --transport http figma-smart-image http://127.0.0.1:${port}/mcp</code>
    </div>
  </div>

  <script>
    ${!hasToken ? `
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const successDiv = document.getElementById('success');
      const errorDiv = document.getElementById('error');

      try {
        const response = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'token=' + encodeURIComponent(token)
        });

        if (response.ok) {
          successDiv.style.display = 'block';
          errorDiv.style.display = 'none';
          document.getElementById('authForm').style.display = 'none';
          document.querySelector('.status').innerHTML = '<div class="status-dot" style="background: #4ade80"></div><span>Connected to Figma</span>';
        } else {
          throw new Error('Failed to save token');
        }
      } catch (err) {
        errorDiv.textContent = 'Error: ' + err.message;
        errorDiv.style.display = 'block';
        successDiv.style.display = 'none';
      }
    });
    ` : ''}
  </script>
</body>
</html>`;
    }
    async run() {
        if (this.transportMode === "http") {
            this.runHttp(HTTP_PORT);
        }
        else {
            await this.runStdio();
        }
    }
}
// Start the server if running directly (not imported by Vercel)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('/server.js')) {
    const server = new FigmaSmartImageServer(TRANSPORT_MODE);
    server.run().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
// Export for Vercel/other platforms
export { FigmaSmartImageServer };
//# sourceMappingURL=server.js.map