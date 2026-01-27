/**
 * Parses a Figma URL to extract fileKey and nodeId.
 * Supports both old (/file/) and new (/design/) URL formats.
 */
export class FigmaLinkParser {
    static FILE_PATTERNS = [
        // /design/ format (new)
        /figma\.com\/design\/([a-zA-Z0-9]+)/,
        /figma\.com\/design\/([a-zA-Z0-9]+)\/.+/,
        // /file/ format (old)
        /figma\.com\/file\/([a-zA-Z0-9]+)/,
        /figma\.com\/file\/([a-zA-Z0-9]+)\/.+/,
        // /proto/ format
        /figma\.com\/proto\/([a-zA-Z0-9]+)/,
        /figma\.com\/proto\/([a-zA-Z0-9]+)\/.+/,
    ];
    static NODE_ID_PATTERN = /node-id=([^&]+)/;
    /**
     * Parse a Figma URL and extract fileKey and nodeId.
     */
    static parse(url) {
        const trimmedUrl = url.trim();
        // Extract fileKey
        let fileKey;
        for (const pattern of this.FILE_PATTERNS) {
            const match = trimmedUrl.match(pattern);
            if (match && match[1]) {
                fileKey = match[1];
                break;
            }
        }
        if (!fileKey) {
            throw new Error(`Could not extract fileKey from URL. Please ensure the URL is a valid Figma design/file URL.`);
        }
        // Extract nodeId from query parameter
        const nodeIdMatch = trimmedUrl.match(this.NODE_ID_PATTERN);
        let nodeId = nodeIdMatch ? nodeIdMatch[1] : undefined;
        if (nodeId) {
            try {
                nodeId = decodeURIComponent(nodeId);
            }
            catch {
                // keep original if decoding fails
            }
            // Normalize Figma node-id formats
            // Figma URLs often use 1-1234 while API expects 1:1234
            if (!nodeId.includes(":") && /^[0-9]+-[0-9]+$/.test(nodeId)) {
                const [left, right] = nodeId.split("-");
                nodeId = `${left}:${right}`;
            }
        }
        return {
            fileKey,
            nodeId,
            originalUrl: trimmedUrl,
        };
    }
    /**
     * Validates if a string looks like a Figma URL.
     */
    static isFigmaUrl(url) {
        const trimmedUrl = url.trim();
        return this.FILE_PATTERNS.some((pattern) => pattern.test(trimmedUrl));
    }
}
//# sourceMappingURL=parse_link.js.map