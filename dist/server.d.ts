#!/usr/bin/env node
/**
 * Figma Smart Image MCP Server
 *
 * A Model Context Protocol server that processes Figma design links
 * into Claude-readable images with automatic tiling and compression.
 *
 * Supports both stdio and HTTP (SSE) transports.
 */
type TransportMode = "stdio" | "http";
declare class FigmaSmartImageServer {
    private server;
    private figmaToken;
    private transportMode;
    private sessionTransports;
    private rateLimiter;
    constructor(transportMode?: TransportMode);
    /**
     * Get token for a specific session
     * Returns session token if available, otherwise falls back to global token
     * Checks Redis first, then device codes (for OAuth flow)
     */
    private getTokenForSession;
    /**
     * Clean up expired sessions (older than 1 hour)
     * Note: Redis handles TTL automatically, this is for in-memory fallback
     */
    private cleanupExpiredSessions;
    private setupHandlers;
    private handleProcessFigmaLink;
    runStdio(): Promise<void>;
    runHttp(port: number): void;
    private getAuthPage;
    run(): Promise<void>;
}
export { FigmaSmartImageServer };
//# sourceMappingURL=server.d.ts.map