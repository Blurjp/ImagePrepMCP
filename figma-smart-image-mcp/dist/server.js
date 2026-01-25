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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
import { deviceCodesStorage, sessionTokensStorage, getRedisClient } from "./redis.js";
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
const GetFigmaComponentsInputSchema = z.object({
    url: z.string().url("Must be a valid Figma URL"),
});
const GetFigmaNodeDetailsInputSchema = z.object({
    url: z.string().url("Must be a valid Figma URL with node-id"),
});
const GetFigmaVariablesInputSchema = z.object({
    url: z.string().url("Must be a valid Figma URL"),
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
    // First try space-separated format: --transport http
    const argIndex = process.argv.findIndex((arg) => arg === argName);
    if (argIndex !== -1 && argIndex + 1 < process.argv.length) {
        return process.argv[argIndex + 1];
    }
    // Then try equals format: --transport=http
    const equalsArg = process.argv.find((arg) => arg.startsWith(argName + "="));
    if (equalsArg) {
        return equalsArg.split("=")[1];
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
    sessionTransports; // Track transports per session (in-memory, per-instance)
    rateLimiter;
    oauthStates; // OAuth state management
    constructor(transportMode = "stdio") {
        this.transportMode = transportMode;
        // Load token from: 1) Environment variable, 2) File, 3) Empty
        this.figmaToken = process.env.FIGMA_TOKEN || loadTokenFromFile() || "";
        this.sessionTransports = new Map();
        this.oauthStates = new Map();
        // Rate limiting: 100 requests per minute per IP
        this.rateLimiter = new RateLimiter(100, 60000);
        // Initialize Redis connection
        const redis = getRedisClient();
        if (redis) {
            console.error(`[Server] Using Redis for multi-tenant storage`);
        }
        else {
            console.error(`[Server] REDIS_URL not set, using in-memory storage (single-instance only)`);
        }
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
     * Returns session token if available, otherwise falls back to most recent OAuth token, then global token
     */
    async getTokenForSession(sessionId) {
        // Check session tokens in Redis for this specific session
        const sessionData = await sessionTokensStorage.get(sessionId);
        if (sessionData?.token) {
            return sessionData.token;
        }
        // Check device codes in Redis (for OAuth flow)
        const deviceData = await deviceCodesStorage.get(sessionId);
        if (deviceData?.figmaToken) {
            return deviceData.figmaToken;
        }
        // Fall back to most recent OAuth token from any session
        const mostRecent = await sessionTokensStorage.getMostRecent();
        if (mostRecent?.value?.token) {
            console.error(`[Auth] Using most recent OAuth token for session ${sessionId}`);
            return mostRecent.value.token;
        }
        // Fall back to global token (for local dev)
        return this.figmaToken;
    }
    /**
     * Clean up expired sessions (older than 1 hour)
     * Note: Redis handles TTL automatically, this is for in-memory fallback
     */
    cleanupExpiredSessions() {
        // Redis handles TTL automatically, so no cleanup needed there
        // Only clean up in-memory transports
        const now = Date.now();
        for (const [sessionId, transport] of this.sessionTransports.entries()) {
            // Clean up stale transports (no activity for 1 hour)
            // Note: sessionTransports is per-instance and doesn't need Redis
            if (transport && (now - transport.lastActivity > 60 * 60 * 1000)) {
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
                    {
                        name: "get_figma_components",
                        description: "Get all components and component sets from a Figma file. " +
                            "Returns component definitions with their names, descriptions, and keys. " +
                            "Useful for understanding the design system and generating code that uses these components.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                url: { type: "string", description: "The Figma file URL" },
                            },
                            required: ["url"],
                        },
                    },
                    {
                        name: "get_figma_node_details",
                        description: "Get detailed layout and styling information for a specific Figma node. " +
                            "Returns properties like auto-layout settings, padding, spacing, fills, effects, " +
                            "and constraints. Essential for accurate code generation.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                url: { type: "string", description: "The Figma URL with node-id parameter" },
                            },
                            required: ["url"],
                        },
                    },
                    {
                        name: "get_figma_variables",
                        description: "Get design variables (colors, spacing, typography) from a Figma file. " +
                            "Returns local variables and their values across different modes. " +
                            "Use this to extract design tokens for your design system.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                url: { type: "string", description: "The Figma file URL" },
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
            if (request.params.name === "get_figma_components") {
                return await this.handleGetFigmaComponents(request.params.arguments);
            }
            if (request.params.name === "get_figma_node_details") {
                return await this.handleGetFigmaNodeDetails(request.params.arguments);
            }
            if (request.params.name === "get_figma_variables") {
                return await this.handleGetFigmaVariables(request.params.arguments);
            }
            throw new Error(`Unknown tool: ${request.params.name}`);
        });
    }
    async handleProcessFigmaLink(args) {
        // Extract session ID from metadata if available (for multi-tenant support)
        const sessionId = args._meta?.sessionId;
        const token = await this.getTokenForSession(sessionId || "");
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
    async handleGetFigmaComponents(args) {
        try {
            // Extract session ID from metadata if available
            const sessionId = args._meta?.sessionId;
            const token = await this.getTokenForSession(sessionId || "");
            if (!token) {
                throw new Error("No Figma token available. Please authenticate first.");
            }
            // Parse Figma URL
            const parsed = FigmaLinkParser.parse(args.url);
            const api = new FigmaApiClient(token);
            // Get components and component sets
            const components = await api.getComponents(parsed.fileKey);
            const componentSets = await api.getComponentSets(parsed.fileKey);
            // Format output
            let output = `# Components from Figma File\n\n`;
            output += `File: ${parsed.fileKey}\n\n`;
            if (componentSets.length > 0) {
                output += `## Component Sets (${componentSets.length})\n\n`;
                componentSets.forEach(set => {
                    output += `### ${set.name}\n`;
                    if (set.description) {
                        output += `${set.description}\n`;
                    }
                    output += `Key: ${set.key}\n\n`;
                });
            }
            if (components.length > 0) {
                output += `## Components (${components.length})\n\n`;
                components.forEach(comp => {
                    output += `### ${comp.name}\n`;
                    if (comp.description) {
                        output += `${comp.description}\n`;
                    }
                    output += `Key: ${comp.key}\n`;
                    if (comp.componentSetId) {
                        output += `Component Set ID: ${comp.componentSetId}\n`;
                    }
                    if (comp.documentationLinks.length > 0) {
                        output += `Documentation: ${comp.documentationLinks.join(', ')}\n`;
                    }
                    output += `\n`;
                });
            }
            else {
                output += `No components found in this file.\n`;
            }
            // Also return raw JSON
            output += `\n---\n\n## Raw JSON Data\n\n\`\`\`json\n`;
            output += JSON.stringify({ components, componentSets }, null, 2);
            output += `\n\`\`\`\n`;
            return {
                content: [
                    {
                        type: "text",
                        text: output,
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
    async handleGetFigmaNodeDetails(args) {
        try {
            // Extract session ID from metadata if available
            const sessionId = args._meta?.sessionId;
            const token = await this.getTokenForSession(sessionId || "");
            if (!token) {
                throw new Error("No Figma token available. Please authenticate first.");
            }
            // Parse Figma URL
            const parsed = FigmaLinkParser.parse(args.url);
            if (!parsed.nodeId) {
                throw new Error("Node ID is required. Please provide a Figma URL with node-id parameter.");
            }
            const api = new FigmaApiClient(token);
            // Get node details
            const details = await api.getNodeDetails(parsed.fileKey, parsed.nodeId);
            // Format output
            let output = `# Node Details: ${details.name}\n\n`;
            output += `Type: ${details.type}\n`;
            output += `ID: ${details.id}\n\n`;
            // Layout properties
            if (details.absoluteBoundingBox) {
                output += `## Bounding Box\n`;
                output += `- Position: (${details.absoluteBoundingBox.x}, ${details.absoluteBoundingBox.y})\n`;
                output += `- Size: ${details.absoluteBoundingBox.width} × ${details.absoluteBoundingBox.height}\n\n`;
            }
            if (details.layoutMode) {
                output += `## Auto Layout\n`;
                output += `- Layout Mode: ${details.layoutMode}\n`;
                if (details.primaryAxisSizingMode) {
                    output += `- Primary Axis: ${details.primaryAxisSizingMode}\n`;
                }
                if (details.counterAxisSizingMode) {
                    output += `- Counter Axis: ${details.counterAxisSizingMode}\n`;
                }
                if (details.itemSpacing !== undefined) {
                    output += `- Item Spacing: ${details.itemSpacing}px\n`;
                }
                if (details.paddingLeft !== undefined) {
                    output += `- Padding: ${details.paddingTop || 0}px ${details.paddingRight || 0}px ${details.paddingBottom || 0}px ${details.paddingLeft || 0}px\n`;
                }
                output += `\n`;
            }
            // Visual properties
            if (details.fills && details.fills.length > 0) {
                output += `## Fills (${details.fills.length})\n`;
                details.fills.forEach((fill, i) => {
                    output += `${i + 1}. ${fill.type || 'UNKNOWN'}\n`;
                });
                output += `\n`;
            }
            if (details.effects && details.effects.length > 0) {
                output += `## Effects (${details.effects.length})\n`;
                details.effects.forEach((effect, i) => {
                    output += `${i + 1}. ${effect.type || 'UNKNOWN'}\n`;
                });
                output += `\n`;
            }
            if (details.opacity !== undefined && details.opacity !== 1) {
                output += `## Opacity\n${(details.opacity * 100).toFixed(0)}%\n\n`;
            }
            // Text properties
            if (details.characters) {
                output += `## Text Content\n`;
                output += `"${details.characters}"\n\n`;
            }
            // Children
            if (details.children && details.children.length > 0) {
                output += `## Children (${details.children.length})\n`;
                details.children.forEach(child => {
                    output += `- ${child.name} (${child.type})\n`;
                });
                output += `\n`;
            }
            // Raw JSON
            output += `\n---\n\n## Raw JSON Data\n\n\`\`\`json\n`;
            output += JSON.stringify(details, null, 2);
            output += `\n\`\`\`\n`;
            return {
                content: [
                    {
                        type: "text",
                        text: output,
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
    async handleGetFigmaVariables(args) {
        try {
            // Extract session ID from metadata if available
            const sessionId = args._meta?.sessionId;
            const token = await this.getTokenForSession(sessionId || "");
            if (!token) {
                throw new Error("No Figma token available. Please authenticate first.");
            }
            // Parse Figma URL
            const parsed = FigmaLinkParser.parse(args.url);
            const api = new FigmaApiClient(token);
            // Get variables
            const variablesData = await api.getVariables(parsed.fileKey);
            // Format output
            let output = `# Design Variables\n\n`;
            output += `File: ${parsed.fileKey}\n\n`;
            const { variables, variableCollections } = variablesData.meta;
            // Collections
            const collectionsList = Object.values(variableCollections);
            if (collectionsList.length > 0) {
                output += `## Collections (${collectionsList.length})\n\n`;
                collectionsList.forEach(collection => {
                    output += `### ${collection.name}\n`;
                    output += `ID: ${collection.id}\n`;
                    if (collection.modes.length > 0) {
                        output += `Modes: ${collection.modes.map(m => m.name).join(', ')}\n`;
                    }
                    output += `\n`;
                });
            }
            // Variables
            const variablesList = Object.values(variables);
            if (variablesList.length > 0) {
                output += `## Variables (${variablesList.length})\n\n`;
                // Group by type
                const byType = {};
                variablesList.forEach(v => {
                    if (!byType[v.resolvedType]) {
                        byType[v.resolvedType] = [];
                    }
                    byType[v.resolvedType].push(v);
                });
                Object.entries(byType).forEach(([type, vars]) => {
                    output += `### ${type} (${vars.length})\n\n`;
                    vars.forEach(v => {
                        output += `**${v.name}**\n`;
                        if (v.description) {
                            output += `${v.description}\n`;
                        }
                        output += `ID: ${v.id}\n`;
                        output += `Values: ${JSON.stringify(v.valuesByMode)}\n`;
                        output += `\n`;
                    });
                });
            }
            else {
                output += `No variables found in this file.\n`;
            }
            // Raw JSON
            output += `\n---\n\n## Raw JSON Data\n\n\`\`\`json\n`;
            output += JSON.stringify(variablesData, null, 2);
            output += `\n\`\`\`\n`;
            return {
                content: [
                    {
                        type: "text",
                        text: output,
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Check if it's a 403 error (Starter Plan doesn't support Variables API)
            if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `# Figma Variables API - Not Available

This Figma file's variables cannot be accessed because the **Figma Variables API requires a Professional Plan or higher**.

## What this means:
- Your current Figma plan (Starter) doesn't support access to design variables via API
- The Variables API endpoint returns a 403 Forbidden error

## Alternatives:
1. **Upgrade to Figma Professional** - Get full API access to variables
2. **Use other MCP tools** - You can still use:
   - \`get_figma_components\` - Get component definitions ✅
   - \`get_figma_node_details\` - Get node layout and styling ✅
   - \`process_figma_link\` - Export and process designs ✅

## For design tokens:
You can manually extract design tokens by:
- Using \`get_figma_node_details\` on specific frames to see colors and spacing
- Exporting the design as images and analyzing them
- Using Figma's "Inspect" panel in the Figma app

**Note:** Other Figma MCP tools work normally with your current plan.
`,
                        },
                    ],
                    isError: false, // Not a hard error, just a limitation
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${errorMessage}`,
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
    async runHttp(port) {
        // Store the transport instance to handle POST messages
        // Using a Map to support multiple concurrent connections
        const transports = new Map();
        // Streamable HTTP transport for Claude Desktop's built-in HTTP client
        const streamableTransport = new StreamableHTTPServerTransport({
            // Stateless mode to allow multiple concurrent initializations
            sessionIdGenerator: undefined,
        });
        await this.server.connect(streamableTransport);
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
                // Determine base URL from environment or request host
                let baseUrl;
                if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                    baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                }
                else if (process.env.RAILWAY_STATIC_URL) {
                    baseUrl = process.env.RAILWAY_STATIC_URL;
                }
                else if (req.headers.host) {
                    // Use request host header - prefer x-forwarded-proto for Railway/proxy deployments
                    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                    baseUrl = `${protocol}://${req.headers.host}`;
                }
                else {
                    baseUrl = `http://localhost:${port}`;
                }
                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                res.end(JSON.stringify({
                    issuer: baseUrl,
                    authorization_endpoint: `${baseUrl}/oauth/authorize`,
                    token_endpoint: `${baseUrl}/oauth/token`,
                    registration_endpoint: `${baseUrl}/register`,
                    device_authorization_endpoint: `${baseUrl}/oauth/device_authorization`,
                    response_types_supported: ["code"],
                    grant_types_supported: ["authorization_code", "urn:ietf:params:oauth:grant-type:device_code"],
                    code_challenge_methods_supported: ["S256"],
                    token_endpoint_auth_methods_supported: ["none"],
                }));
                return;
            }
            // OAuth protected resource metadata (RFC 9728)
            if (url.pathname === "/.well-known/oauth-protected-resource") {
                let baseUrl;
                if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                    baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                }
                else if (process.env.RAILWAY_STATIC_URL) {
                    baseUrl = process.env.RAILWAY_STATIC_URL;
                }
                else if (req.headers.host) {
                    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                    baseUrl = `${protocol}://${req.headers.host}`;
                }
                else {
                    baseUrl = `http://localhost:${port}`;
                }
                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                res.end(JSON.stringify({
                    resource: `${baseUrl}/mcp`,
                    authorization_servers: [baseUrl],
                    resource_name: "figma-smart-image-mcp",
                }));
                return;
            }
            // OAuth device authorization endpoint - returns info about web auth
            if (url.pathname === "/oauth/device_authorization" && req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const params = new URLSearchParams(body);
                        const clientId = params.get("client_id");
                        // Generate a device code for this authorization request
                        const deviceCode = "device_" + Math.random().toString(36).substring(2, 15);
                        const userCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                        // Check if we have any OAuth tokens in Redis for auto-verification
                        console.error("[OAuth Device] Checking for existing OAuth tokens...");
                        const mostRecent = await sessionTokensStorage.getMostRecent();
                        const hasOAuthToken = !!mostRecent?.value?.token;
                        console.error(`[OAuth Device] hasOAuthToken: ${hasOAuthToken}`);
                        // Store device code in Redis for later verification
                        // Auto-verify if we have a global token OR OAuth tokens exist
                        await deviceCodesStorage.set(deviceCode, {
                            userCode,
                            clientId: clientId || "unknown",
                            createdAt: Date.now(),
                            verified: !!this.figmaToken || hasOAuthToken,
                            figmaToken: hasOAuthToken ? mostRecent.value.token : this.figmaToken,
                        });
                        let baseUrl;
                        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                            baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                        }
                        else if (req.headers.host) {
                            const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                            baseUrl = `${protocol}://${req.headers.host}`;
                        }
                        else {
                            baseUrl = `http://localhost:${port}`;
                        }
                        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                        res.end(JSON.stringify({
                            device_code: deviceCode,
                            user_code: userCode,
                            verification_uri: `${baseUrl}/`,
                            verification_uri_complete: `${baseUrl}/`,
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
            // OAuth token endpoint - handles device code polling and token requests
            if (url.pathname === "/oauth/token" && req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => { body += chunk.toString(); });
                req.on("end", async () => {
                    const params = new URLSearchParams(body);
                    const grantType = params.get("grant_type");
                    const deviceCode = params.get("device_code");
                    // Device code flow polling
                    if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
                        console.error(`[OAuth] Device code flow started for: ${deviceCode || '(missing)'}`);
                        if (!deviceCode) {
                            console.error(`[OAuth] ERROR: Missing device_code`);
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "invalid_grant",
                                error_description: "Missing device_code",
                            }));
                            return;
                        }
                        // TEMPORARY: Auto-approve "web_auth" if OAuth tokens exist
                        if (deviceCode === "web_auth") {
                            console.error(`[OAuth] web_auth detected - checking for OAuth tokens`);
                            const mostRecent = await sessionTokensStorage.getMostRecent();
                            console.error(`[OAuth] mostRecent result: ${mostRecent ? 'found' : 'null'}`);
                            if (mostRecent?.value?.token) {
                                console.error(`[OAuth] SUCCESS: Returning access token for web_auth`);
                                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                                res.end(JSON.stringify({
                                    access_token: deviceCode,
                                    token_type: "Bearer",
                                    expires_in: 3600,
                                }));
                                return;
                            }
                        }
                        console.error(`[OAuth] Checking auth for device code: ${deviceCode}`);
                        // Check sessionTokens first (specific to this device code)
                        const sessionToken = await sessionTokensStorage.get(deviceCode);
                        console.error(`[OAuth] sessionToken result: ${sessionToken ? 'found' : 'not found'}`);
                        let hasAuthenticated = !!sessionToken;
                        // If not in sessionTokens, try deviceCodes
                        let deviceInfo = null;
                        if (!hasAuthenticated) {
                            deviceInfo = await deviceCodesStorage.get(deviceCode);
                            hasAuthenticated = deviceInfo?.verified && (deviceInfo?.figmaToken || this.figmaToken);
                        }
                        // If still not authenticated, check for ANY recent OAuth token
                        if (!hasAuthenticated) {
                            console.error(`[OAuth Debug] Checking for recent OAuth tokens for device code: ${deviceCode}`);
                            const mostRecent = await sessionTokensStorage.getMostRecent();
                            console.error(`[OAuth Debug] getMostRecent result:`, mostRecent ? `Found (createdAt: ${mostRecent.value?.createdAt}, hasToken: ${!!mostRecent.value?.token})` : 'null');
                            if (mostRecent?.value?.token) {
                                console.error(`[OAuth Token] Using most recent OAuth token for device code ${deviceCode}`);
                                hasAuthenticated = true;
                            }
                            else {
                                console.error(`[OAuth Debug] No valid OAuth token found`);
                            }
                        }
                        if (hasAuthenticated) {
                            // User has authenticated - return success
                            res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                access_token: deviceCode,
                                token_type: "Bearer",
                                expires_in: 3600,
                            }));
                            return;
                        }
                        // For the hardcoded "web_auth" device code, auto-create it if we have OAuth tokens
                        if (deviceCode === "web_auth") {
                            console.error(`[OAuth] Checking for most recent OAuth token...`);
                            const mostRecent = await sessionTokensStorage.getMostRecent();
                            console.error(`[OAuth] getMostRecent result:`, mostRecent ? `Found token (${mostRecent.value?.token?.substring(0, 20)}...)` : 'null');
                            if (mostRecent?.value?.token) {
                                console.error(`[OAuth] Auto-creating web_auth device code with OAuth token`);
                                // Auto-create device code entry for web_auth
                                await deviceCodesStorage.set(deviceCode, {
                                    userCode: "WEB",
                                    clientId: "web",
                                    createdAt: Date.now(),
                                    verified: true,
                                    figmaToken: mostRecent.value.token,
                                });
                                // Return success immediately
                                res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                                res.end(JSON.stringify({
                                    access_token: deviceCode,
                                    token_type: "Bearer",
                                    expires_in: 3600,
                                }));
                                return;
                            }
                            else {
                                console.error(`[OAuth] No OAuth tokens found - cannot auto-create web_auth`);
                            }
                        }
                        // Check if device code exists at all
                        const deviceExists = await deviceCodesStorage.get(deviceCode) || sessionToken;
                        if (!deviceExists) {
                            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                            res.end(JSON.stringify({
                                error: "invalid_grant",
                                error_description: "Invalid or expired device code",
                            }));
                            return;
                        }
                        // Still waiting for user to authenticate
                        let authUrl;
                        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                            authUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                        }
                        else if (req.headers.host) {
                            const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                            authUrl = `${protocol}://${req.headers.host}`;
                        }
                        else {
                            authUrl = `http://localhost:${port}`;
                        }
                        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                        res.end(JSON.stringify({
                            error: "authorization_pending",
                            error_description: `Please visit ${authUrl}/ to authenticate with your Figma token`,
                        }));
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
                req.on("end", async () => {
                    try {
                        const params = new URLSearchParams(body);
                        const clientId = params.get("client_id");
                        // Generate a device code for this authorization request
                        const deviceCode = "device_" + Math.random().toString(36).substring(2, 15);
                        const userCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                        // Check if we have any OAuth tokens in Redis for auto-verification
                        console.error("[Device/Authorize] Checking for existing OAuth tokens...");
                        const mostRecent = await sessionTokensStorage.getMostRecent();
                        const hasOAuthToken = !!mostRecent?.value?.token;
                        console.error(`[Device/Authorize] hasOAuthToken: ${hasOAuthToken}`);
                        // Store device code in Redis for later verification
                        // Auto-verify if we have a global token OR OAuth tokens exist
                        await deviceCodesStorage.set(deviceCode, {
                            userCode,
                            clientId: clientId || "unknown",
                            createdAt: Date.now(),
                            verified: !!this.figmaToken || hasOAuthToken,
                            figmaToken: hasOAuthToken ? mostRecent.value.token : this.figmaToken,
                        });
                        // Use Railway domain if available, otherwise from request host
                        let baseUrl;
                        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                            baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                        }
                        else if (req.headers.host) {
                            const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                            baseUrl = `${protocol}://${req.headers.host}`;
                        }
                        else {
                            baseUrl = `http://localhost:${port}`;
                        }
                        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
                        res.end(JSON.stringify({
                            device_code: deviceCode,
                            user_code: userCode,
                            verification_uri: `${baseUrl}/`,
                            verification_uri_complete: `${baseUrl}/`,
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
            // Debug endpoint for Redis persistence testing
            if (url.pathname === "/debug/redis-test") {
                const redis = getRedisClient();
                if (!redis) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Redis not available" }));
                    return;
                }
                const action = url.searchParams.get("action");
                if (action === "set") {
                    await redis.set("persist_probe", "ok");
                    await redis.save();
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "SET persist_probe=ok and called SAVE" }));
                    return;
                }
                if (action === "get") {
                    const value = await redis.get("persist_probe");
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ persist_probe: value, exists: !!value }));
                    return;
                }
                if (action === "info") {
                    const info = await redis.info("persistence");
                    const dir = await redis.config("GET", "dir");
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ persistence_config: dir, info: info }));
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    usage: "Use ?action=set|get|info",
                    actions: {
                        set: "SET persist_probe 'ok' and call SAVE",
                        get: "GET persist_probe value",
                        info: "Show Redis persistence configuration"
                    }
                }));
                return;
            }
            // Health check endpoint (with optional Figma fetch)
            if (url.pathname === "/health") {
                // Debug: Redis persistence test
                const debugAction = url.searchParams.get("debug");
                const redis = getRedisClient();
                if (redis && debugAction === "set_probe") {
                    await redis.set("persist_probe", "ok");
                    await redis.save();
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "SET persist_probe=ok and called SAVE" }));
                    return;
                }
                if (redis && debugAction === "get_probe") {
                    const value = await redis.get("persist_probe");
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ persist_probe: value, exists: !!value }));
                    return;
                }
                if (redis && debugAction === "redis_info") {
                    const info = await redis.info("persistence");
                    const dir = await redis.config("GET", "dir");
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ persistence_dir: dir, info: info.substring(0, 500) }));
                    return;
                }
                if (debugAction === "sessions") {
                    const activeSessions = Array.from(this.sessionTransports.keys());
                    const globalSessions = Array.from(globalThis.activeTransports?.keys() || []);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        instanceSessions: activeSessions,
                        globalSessions,
                        count: activeSessions.length
                    }));
                    return;
                }
                const figmaUrl = url.searchParams.get("figma");
                // If figma parameter provided, fetch the design
                if (figmaUrl) {
                    const mostRecent = await sessionTokensStorage.getMostRecent();
                    const token = mostRecent?.value?.token || this.figmaToken;
                    if (!token) {
                        res.writeHead(401, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "No Figma token available" }));
                        return;
                    }
                    try {
                        const result = await this.handleProcessFigmaLink({
                            url: figmaUrl,
                            _meta: { sessionId: "health_api" }
                        });
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(result));
                        return;
                    }
                    catch (error) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                        return;
                    }
                }
                // Normal health check
                const deviceCodeKeys = await deviceCodesStorage.keys();
                const mostRecentOAuth = await sessionTokensStorage.getMostRecent();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    status: "ok",
                    hasToken: !!this.figmaToken,
                    hasDefaultToken: !!this.figmaToken,
                    hasOAuthToken: !!mostRecentOAuth?.value?.token,
                    oauthSessionCount: (await sessionTokensStorage.entries()).length,
                    redis: redis ? "connected" : "disconnected (using in-memory fallback)",
                    activeDevices: deviceCodeKeys.length,
                    activeTransports: this.sessionTransports.size,
                }));
                return;
            }
            // Direct Figma fetch endpoint (bypasses MCP)
            if (url.pathname.startsWith("/api")) {
                console.error(`[API] Request: ${req.method} ${url.pathname}`);
            }
            if (url.pathname === "/api/fetch-figma" && req.method === "GET") {
                console.error(`[API] Fetching Figma design...`);
                const figmaUrl = url.searchParams.get("url");
                if (!figmaUrl) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing url parameter" }));
                    return;
                }
                // Get most recent OAuth token
                const mostRecent = await sessionTokensStorage.getMostRecent();
                const token = mostRecent?.value?.token || this.figmaToken;
                if (!token) {
                    res.writeHead(401, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "No Figma token available" }));
                    return;
                }
                try {
                    // Parse and process the Figma URL
                    const result = await this.handleProcessFigmaLink({
                        url: figmaUrl,
                        _meta: { sessionId: "direct_api" }
                    });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(result));
                }
                catch (error) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                }
                return;
            }
            // Debug endpoint to check environment
            if (url.pathname === "/debug/env") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || null,
                    RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || null,
                    PORT: process.env.PORT || null,
                    requestHost: req.headers.host || null,
                    xForwardedProto: req.headers['x-forwarded-proto'] || null,
                    nodeVersion: process.version,
                }));
                return;
            }
            // Authentication page
            if (url.pathname === "/") {
                res.writeHead(200, { "Content-Type": "text/html" });
                const hasOAuth = !!(process.env.FIGMA_CLIENT_ID);
                res.end(this.getAuthPage(hasOAuth));
                return;
            }
            // OAuth authorize endpoint - Start OAuth flow
            if (url.pathname === "/oauth/authorize" && req.method === "GET") {
                const clientId = process.env.FIGMA_CLIENT_ID;
                if (!clientId) {
                    res.writeHead(500, { "Content-Type": "text/html" });
                    res.end("<html><body><h1>OAuth Not Configured</h1><p>FIGMA_CLIENT_ID environment variable is not set.</p></body></html>");
                    return;
                }
                let baseUrl;
                if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                    baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                }
                else if (req.headers.host) {
                    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                    baseUrl = `${protocol}://${req.headers.host}`;
                }
                else {
                    baseUrl = `http://localhost:${HTTP_PORT}`;
                }
                const redirectUri = `${baseUrl}/oauth/callback`;
                const codeVerifier = this.generateCodeVerifier();
                const state = this.generateState();
                // Store state and code verifier for callback verification
                this.oauthStates.set(state, {
                    codeVerifier,
                    redirectUri,
                    createdAt: Date.now(),
                });
                // Generate code challenge
                this.generateCodeChallenge(codeVerifier).then((codeChallenge) => {
                    // Redirect to Figma's OAuth authorize endpoint
                    const figmaAuthUrl = new URL("https://www.figma.com/oauth");
                    figmaAuthUrl.searchParams.set("client_id", clientId);
                    figmaAuthUrl.searchParams.set("redirect_uri", redirectUri);
                    figmaAuthUrl.searchParams.set("scope", "file_content:read file_metadata:read file_variables:read");
                    figmaAuthUrl.searchParams.set("state", state);
                    figmaAuthUrl.searchParams.set("response_type", "code");
                    figmaAuthUrl.searchParams.set("code_challenge", codeChallenge);
                    figmaAuthUrl.searchParams.set("code_challenge_method", "S256");
                    res.writeHead(302, { Location: figmaAuthUrl.toString() });
                    res.end();
                });
                return;
            }
            // OAuth callback endpoint - Handle Figma's redirect
            if (url.pathname === "/oauth/callback" && req.method === "GET") {
                const code = url.searchParams.get("code");
                const state = url.searchParams.get("state");
                const error = url.searchParams.get("error");
                if (error) {
                    res.writeHead(302, { Location: `/?error=${encodeURIComponent(error)}` });
                    res.end();
                    return;
                }
                if (!code || !state) {
                    res.writeHead(400, { "Content-Type": "text/html" });
                    res.end("<html><body><h1>Invalid callback</h1><p>Missing code or state parameter.</p></body></html>");
                    return;
                }
                // Verify state and get code verifier
                const oauthState = this.oauthStates.get(state);
                if (!oauthState) {
                    res.writeHead(400, { "Content-Type": "text/html" });
                    res.end("<html><body><h1>Invalid state</h1><p>OAuth state expired or invalid.</p></body></html>");
                    return;
                }
                // Clean up state
                this.oauthStates.delete(state);
                try {
                    // Exchange code for access token
                    const tokenResponse = await this.exchangeCodeForToken(code, oauthState.codeVerifier, oauthState.redirectUri);
                    // Store token in Redis with refresh capability
                    const sessionData = {
                        token: tokenResponse.access_token,
                        refreshToken: tokenResponse.refresh_token || "",
                        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                        createdAt: Date.now(),
                    };
                    await sessionTokensStorage.set(state, sessionData);
                    // Redirect back to auth page with success
                    res.writeHead(302, { Location: `/?oauth=success&session=${state}` });
                    res.end();
                }
                catch (error) {
                    console.error("[OAuth Callback] Error:", error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    res.writeHead(302, { Location: `/?error=${encodeURIComponent(errorMessage)}` });
                    res.end();
                }
                return;
            }
            // Auth endpoint - GET for status, POST to set token
            if (url.pathname === "/auth") {
                if (req.method === "GET") {
                    // Check if a specific session is being queried
                    (async () => {
                        const sessionId = url.searchParams.get("session_id");
                        const sessionData = sessionId ? await sessionTokensStorage.get(sessionId) : null;
                        const hasToken = sessionId ? !!sessionData?.token : !!this.figmaToken;
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({
                            authenticated: hasToken,
                            hasToken: hasToken
                        }));
                    })();
                    return;
                }
                if (req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk) => {
                        body += chunk.toString();
                    });
                    req.on("end", async () => {
                        try {
                            const params = new URLSearchParams(body);
                            const token = params.get("token") || "";
                            const sessionId = params.get("session_id") || "";
                            const userCode = params.get("user_code")?.toUpperCase() || "";
                            if (userCode) {
                                // Multi-tenant mode via OAuth device code flow
                                // Find the device code by user code in Redis
                                const entries = await deviceCodesStorage.entries();
                                let foundDeviceCode = null;
                                for (const [deviceCode, deviceInfo] of entries) {
                                    if (deviceInfo.userCode === userCode) {
                                        foundDeviceCode = deviceCode;
                                        break;
                                    }
                                }
                                if (foundDeviceCode && token) {
                                    // Store token in Redis sessionTokens using deviceCode as key
                                    await sessionTokensStorage.set(foundDeviceCode, {
                                        token,
                                        createdAt: Date.now(),
                                    });
                                    // Also update deviceCodes in Redis
                                    const deviceInfo = await deviceCodesStorage.get(foundDeviceCode);
                                    if (deviceInfo) {
                                        deviceInfo.figmaToken = token;
                                        deviceInfo.verified = true;
                                        await deviceCodesStorage.set(foundDeviceCode, deviceInfo);
                                    }
                                    res.writeHead(200, { "Content-Type": "application/json" });
                                    res.end(JSON.stringify({ success: true, authenticated: true }));
                                }
                                else if (foundDeviceCode) {
                                    res.writeHead(200, { "Content-Type": "application/json" });
                                    res.end(JSON.stringify({ success: true, authenticated: true }));
                                }
                                else {
                                    res.writeHead(400, { "Content-Type": "application/json" });
                                    res.end(JSON.stringify({ error: "Invalid or expired user code" }));
                                }
                            }
                            else if (sessionId) {
                                // Multi-tenant mode: store token for this session
                                if (token) {
                                    await sessionTokensStorage.set(sessionId, {
                                        token,
                                        createdAt: Date.now(),
                                    });
                                }
                                res.writeHead(200, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ success: true, authenticated: true, sessionId }));
                            }
                            else {
                                // Single-tenant mode: store global token (for local dev)
                                this.figmaToken = token;
                                if (token) {
                                    saveTokenToFile(token);
                                }
                                res.writeHead(200, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ success: true, authenticated: true }));
                            }
                        }
                        catch (error) {
                            res.writeHead(400, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Invalid request" }));
                        }
                    });
                    return;
                }
            }
            // MCP endpoint - supports Streamable HTTP and legacy SSE
            if (url.pathname === "/mcp") {
                const authHeader = req.headers.authorization;
                const oauthEnabled = !!process.env.FIGMA_CLIENT_ID;
                if (oauthEnabled && (!authHeader || !authHeader.startsWith('Bearer '))) {
                    let baseUrl;
                    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                        baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
                    }
                    else if (process.env.RAILWAY_STATIC_URL) {
                        baseUrl = process.env.RAILWAY_STATIC_URL;
                    }
                    else if (req.headers.host) {
                        const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
                        baseUrl = `${protocol}://${req.headers.host}`;
                    }
                    else {
                        baseUrl = `http://localhost:${port}`;
                    }
                    res.writeHead(401, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
                        "WWW-Authenticate": `Bearer realm=\"mcp\", resource_metadata=\"${baseUrl}/.well-known/oauth-protected-resource\"`,
                    });
                    res.end(JSON.stringify({ error: "unauthorized" }));
                    return;
                }
                const mcpSessionIdHeader = typeof req.headers['mcp-session-id'] === 'string'
                    ? req.headers['mcp-session-id']
                    : undefined;
                const hasStreamableHeaders = typeof req.headers['mcp-protocol-version'] === 'string' || !!mcpSessionIdHeader || !!authHeader;
                const useStreamableTransport = req.method !== "GET" || hasStreamableHeaders;
                if (useStreamableTransport) {
                    // CORS headers for Streamable HTTP
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
                    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version");
                    let parsedBody = undefined;
                    if (req.method === "POST") {
                        let body = "";
                        req.on("data", (chunk) => {
                            body += chunk.toString();
                        });
                        req.on("end", async () => {
                            if (body.length > 0) {
                                try {
                                    parsedBody = JSON.parse(body);
                                }
                                catch (error) {
                                    res.writeHead(400, { "Content-Type": "application/json" });
                                    res.end(JSON.stringify({
                                        jsonrpc: "2.0",
                                        error: { code: -32700, message: "Parse error: Invalid JSON" },
                                        id: null,
                                    }));
                                    return;
                                }
                            }
                            // Use device code (Bearer) as session ID for auth if present
                            let authSessionId = mcpSessionIdHeader;
                            if (authHeader && authHeader.startsWith('Bearer ')) {
                                authSessionId = authHeader.substring(7);
                            }
                            if (authSessionId && parsedBody) {
                                const injectSession = (message) => {
                                    if (message?.params && typeof message.params === 'object') {
                                        message.params._meta = {
                                            ...message.params._meta,
                                            sessionId: authSessionId,
                                        };
                                    }
                                };
                                if (Array.isArray(parsedBody)) {
                                    parsedBody.forEach(injectSession);
                                }
                                else {
                                    injectSession(parsedBody);
                                }
                            }
                            if (authSessionId) {
                                const existing = this.sessionTransports.get(authSessionId);
                                if (existing) {
                                    existing.lastActivity = Date.now();
                                }
                                else {
                                    this.sessionTransports.set(authSessionId, { lastActivity: Date.now() });
                                }
                            }
                            await streamableTransport.handleRequest(req, res, parsedBody);
                        });
                        return;
                    }
                    let authSessionId = mcpSessionIdHeader;
                    if (authHeader && authHeader.startsWith('Bearer ')) {
                        authSessionId = authHeader.substring(7);
                    }
                    if (authSessionId) {
                        const existing = this.sessionTransports.get(authSessionId);
                        if (existing) {
                            existing.lastActivity = Date.now();
                        }
                        else {
                            this.sessionTransports.set(authSessionId, { lastActivity: Date.now() });
                        }
                    }
                    await streamableTransport.handleRequest(req, res);
                    return;
                }
                if (req.method === "GET") {
                    // Set CORS headers before transport takes over
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                    // Create SSE transport and connect to server
                    const transport = new SSEServerTransport("/message", res);
                    // Store transport by session ID BEFORE connecting to avoid race condition
                    // The client receives the endpoint event immediately and may send POST before connect() completes
                    transports.set(transport.sessionId, transport);
                    this.sessionTransports.set(transport.sessionId, transport);
                    await this.server.connect(transport);
                    // Clean up when connection closes
                    res.on("close", async () => {
                        transports.delete(transport.sessionId);
                        this.sessionTransports.delete(transport.sessionId);
                        // Also clean up session token on disconnect (from Redis)
                        await sessionTokensStorage.delete(transport.sessionId);
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
                // Set CORS headers
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                // Extract session ID from query string
                const sessionId = url.searchParams.get("sessionId");
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
                    res.end(JSON.stringify({ error: "Missing sessionId" }));
                    return;
                }
                const transport = transports.get(sessionId);
                if (!transport) {
                    res.writeHead(404, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    });
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
                        // Check for Authorization header (contains device code from OAuth flow)
                        const authHeader = req.headers.authorization;
                        let authSessionId = sessionId;
                        if (authHeader && authHeader.startsWith('Bearer ')) {
                            // Extract device code from Bearer token (this is the access_token from OAuth)
                            authSessionId = authHeader.substring(7);
                        }
                        // Inject session ID into request metadata for multi-tenant token support
                        if (parsedBody.params && typeof parsedBody.params === 'object') {
                            parsedBody.params._meta = {
                                ...parsedBody.params._meta,
                                sessionId: authSessionId, // Use auth session ID (device code) if available
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
    // OAuth Helper Functions
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }
    base64URLEncode(buffer) {
        let str = '';
        for (const byte of buffer) {
            str += String.fromCharCode(byte);
        }
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(hash));
    }
    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
    async exchangeCodeForToken(code, codeVerifier, redirectUri) {
        const clientId = process.env.FIGMA_CLIENT_ID;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error('FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET must be configured');
        }
        // Figma expects form-encoded data for token exchange
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', redirectUri);
        params.append('code_verifier', codeVerifier);
        const response = await fetch('https://api.figma.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }
        const tokenData = await response.json();
        return tokenData;
    }
    async refreshAccessToken(refreshToken) {
        const clientId = process.env.FIGMA_CLIENT_ID;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error('FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET must be configured');
        }
        // Figma expects form-encoded data for token refresh
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        const response = await fetch('https://api.figma.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token refresh failed: ${error}`);
        }
        const tokenData = await response.json();
        return tokenData;
    }
    getAuthPage(hasOAuth = false) {
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
    input[type="password"],
    input[type="text"] {
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
    .how-to-use {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 24px;
      margin-top: 32px;
      margin-bottom: 32px;
    }
    .how-to-use h2 {
      color: #fff;
      font-size: 18px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .step-number {
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #f24e1e 0%, #ff7262 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .step-content {
      flex: 1;
    }
    .step-title {
      color: #e0e0e8;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .step-desc {
      color: #a0a0b8;
      font-size: 13px;
      line-height: 1.5;
    }
    .step-code {
      background: #0d0d1a;
      padding: 8px 12px;
      border-radius: 6px;
      margin-top: 8px;
      font-family: monospace;
      font-size: 12px;
      color: #4ade80;
      overflow-x: auto;
    }
    .multi-tenant-badge {
      display: inline-block;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: #000;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }
    .oauth-button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
      border: 2px solid #f24e1e;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .oauth-button:hover {
      background: linear-gradient(135deg, #2d2d4a 0%, #3a3a5c 100%);
      border-color: #ff7262;
    }
    .oauth-button svg {
      width: 20px;
      height: 20px;
    }
    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      margin: 24px 0;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #3a3a5c;
    }
    .divider span {
      padding: 0 16px;
      color: #707090;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><div class="icon">F</div>Figma Smart Image MCP <span class="multi-tenant-badge">Multi-Tenant</span></h1>
    <p class="subtitle">Process Figma designs into Claude-readable images with automatic tiling and optimization.</p>

    <div class="status">
      <div class="status-dot"></div>
      <span>${hasToken ? 'Connected to Figma' : 'Not connected - Enter your Figma token'}</span>
    </div>

    ${!hasToken ? `
    ${hasOAuth ? `
    <a href="/oauth/authorize" class="oauth-button">
      <svg viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 28.5C29.4934 28.5 38 22.1274 38 14.25C38 6.37258 29.4934 0 19 0C8.50659 0 0 6.37258 0 14.25C0 22.1274 8.50659 28.5 19 28.5Z" fill="#F24E1E"/>
        <path d="M19 38.275C30.1503 38.275 39.375 33.5772 39.375 27.1375C39.375 20.6978 30.1503 15.1375 19 15.1375C7.84974 15.1375 -1.375 20.6978 -1.375 27.1375C-1.375 33.5772 7.84974 38.275 19 38.275Z" fill="#A259FF"/>
        <path d="M19 50.3125C27.4264 50.3125 34.5625 46.8303 34.5625 41.9375C34.5625 37.0447 27.4264 32.6875 19 32.6875C10.5736 32.6875 3.4375 37.0447 3.4375 41.9375C3.4375 46.8303 10.5736 50.3125 19 50.3125Z" fill="#1ABCFE"/>
        <path d="M8.3125 14.25C8.3125 17.6901 12.9237 20.6125 19 20.6125C25.0763 20.6125 29.6875 17.6901 29.6875 14.25C29.6875 10.8099 25.0763 8.3125 19 8.3125C12.9237 8.3125 8.3125 10.8099 8.3125 14.25Z" fill="#FF7262"/>
        <path d="M8.3125 27.1375C8.3125 30.5776 12.9237 33.5 19 33.5C25.0763 33.5 29.6875 30.5776 29.6875 27.1375C29.6875 23.6974 25.0763 21.2 19 21.2C12.9237 21.2 8.3125 23.6974 8.3125 27.1375Z" fill="#A259FF"/>
      </svg>
      Authorize with Figma
    </a>
    <div class="divider"><span>or enter token manually</span></div>
    ` : ''}
    <form id="authForm">
      <div class="form-group">
        <label for="userCode">User Code</label>
        <input type="text" id="userCode" name="userCode" placeholder="ABC123" autocomplete="off">
        <p class="help-text">
          Enter the user code from the OAuth device authorization flow.
          Leave empty for local development (single-tenant mode).
        </p>
      </div>
      <div class="form-group">
        <label for="token">Figma Personal Access Token</label>
        <input type="password" id="token" name="token" required placeholder="figd_..." autocomplete="off">
        <p class="help-text">
          Get your token from <a href="https://www.figma.com/settings" target="_blank">Figma Settings</a>.
          Create a personal access token with file read access.
        </p>
      </div>
      <button type="submit">Connect to Figma</button>
    </form>

    <div id="success" class="success">✓ Connected! You can now use this MCP server.</div>
    <div id="error" class="error"></div>
    ` : ''}

    <div class="how-to-use">
      <h2>🚀 How to Use This MCP Server</h2>

      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <div class="step-title">Create .clauderc File</div>
          <div class="step-desc">Create or update .clauderc in your project directory with the following configuration:</div>
          <div class="step-code">{
  "mcpServers": {
    "figma-smart-image": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sse",
               "https://figma-smart-image-mcp-production.up.railway.app/mcp"]
    }
  }
}</div>
        </div>
      </div>

      <div class="step">
        <div class="step-number">2</div>
        <div class="step-content">
          <div class="step-title">Get Device Code</div>
          <div class="step-desc">When you first use the MCP server, you'll receive a device code and user code through the OAuth flow.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-number">3</div>
        <div class="step-content">
          <div class="step-title">Authenticate with Figma</div>
          <div class="step-desc">Enter your user code and Figma token on this page to authenticate. Your token is stored securely in Redis and isolated from other users.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-number">4</div>
        <div class="step-content">
          <div class="step-title">Start Using in Claude</div>
          <div class="step-desc">Ask Claude to process Figma designs:</div>
          <div class="step-code">"Please extract the hero section from this Figma link:
https://www.figma.com/design/abc123/..."</div>
        </div>
      </div>
    </div>

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
      Railway Deployment: <code>https://figma-smart-image-mcp-production.up.railway.app/</code>
    </div>
  </div>

  <script>
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const oauthSuccess = urlParams.get('oauth');
    const oauthError = urlParams.get('error');
    const oauthSession = urlParams.get('session');

    if (oauthSuccess === 'success' && oauthSession) {
      // OAuth was successful
      const successDiv = document.getElementById('success');
      const errorDiv = document.getElementById('error');
      const authForm = document.getElementById('authForm');
      const statusDiv = document.querySelector('.status');

      if (successDiv) successDiv.style.display = 'block';
      if (errorDiv) errorDiv.style.display = 'none';
      if (authForm) authForm.style.display = 'none';
      if (statusDiv) {
        statusDiv.innerHTML = '<div class="status-dot" style="background: #4ade80"></div><span>Connected to Figma via OAuth</span>';
        statusDiv.style.background = '#2d6a4f';
      }

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (oauthError) {
      // OAuth failed
      const errorDiv = document.getElementById('error');
      if (errorDiv) {
        errorDiv.textContent = 'OAuth Error: ' + decodeURIComponent(oauthError);
        errorDiv.style.display = 'block';
      }
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    ${!hasToken ? `
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const userCode = document.getElementById('userCode').value.trim().toUpperCase();
      const successDiv = document.getElementById('success');
      const errorDiv = document.getElementById('error');

      try {
        // Build request body with user_code if provided
        const body = new URLSearchParams({
          token: token,
          ...(userCode && { user_code: userCode })
        });

        const response = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });

        if (response.ok) {
          successDiv.style.display = 'block';
          errorDiv.style.display = 'none';
          document.getElementById('authForm').style.display = 'none';
          document.querySelector('.status').innerHTML = '<div class="status-dot" style="background: #4ade80"></div><span>Connected to Figma</span>';
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save token');
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
            await this.runHttp(HTTP_PORT);
        }
        else {
            await this.runStdio();
        }
    }
}
// Start the server if running directly (not imported by Vercel)
const scriptPath = process.argv[1];
const isMainModule = import.meta.url === `file://${scriptPath}` ||
    scriptPath.endsWith('server.js') ||
    scriptPath.endsWith('/server') ||
    scriptPath.includes('dist/server.js');
if (isMainModule) {
    const server = new FigmaSmartImageServer(TRANSPORT_MODE);
    server.run().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
// Export for Vercel/other platforms
export { FigmaSmartImageServer };
//# sourceMappingURL=server.js.map