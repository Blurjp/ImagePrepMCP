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
    private oauthStates;
    private oauthAuthCodes;
    private toolTimeoutMs;
    private figmaRequestTimeoutMs;
    constructor(transportMode?: TransportMode);
    /**
     * Get token for a specific session
     * Returns session token if available, otherwise falls back to most recent OAuth token, then global token
     */
    private getTokenForSession;
    /**
     * Clean up expired sessions (older than 1 hour)
     * Note: Redis handles TTL automatically, this is for in-memory fallback
     */
    private cleanupExpiredSessions;
    private withTimeout;
    private setupHandlers;
    private handleProcessFigmaLink;
    private handleGetFigmaComponents;
    private handleGetFigmaNodeDetails;
    private handleGetFigmaVariables;
    private handleListFigmaFrames;
    private handleDebugFigmaAccess;
    runStdio(): Promise<void>;
    runHttp(port: number): Promise<void>;
    private generateCodeVerifier;
    private base64URLEncode;
    private generateCodeChallenge;
    private generateState;
    private exchangeCodeForToken;
    private refreshAccessToken;
    private getAuthPage;
    run(): Promise<void>;
}
export { FigmaSmartImageServer };
//# sourceMappingURL=server.d.ts.map