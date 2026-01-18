/**
 * Parses a Figma URL to extract fileKey and nodeId.
 * Supports both old (/file/) and new (/design/) URL formats.
 */
export interface ParsedFigmaLink {
    fileKey: string;
    nodeId?: string;
    originalUrl: string;
}
export declare class FigmaLinkParser {
    private static readonly FILE_PATTERNS;
    private static readonly NODE_ID_PATTERN;
    /**
     * Parse a Figma URL and extract fileKey and nodeId.
     */
    static parse(url: string): ParsedFigmaLink;
    /**
     * Validates if a string looks like a Figma URL.
     */
    static isFigmaUrl(url: string): boolean;
}
//# sourceMappingURL=parse_link.d.ts.map