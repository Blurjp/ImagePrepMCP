/**
 * Parses a Figma URL to extract fileKey and nodeId.
 * Supports both old (/file/) and new (/design/) URL formats.
 */

export interface ParsedFigmaLink {
  fileKey: string;
  nodeId?: string;
  originalUrl: string;
}

export class FigmaLinkParser {
  private static readonly FILE_PATTERNS = [
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

  private static readonly NODE_ID_PATTERN = /node-id=([^&]+)/;

  /**
   * Parse a Figma URL and extract fileKey and nodeId.
   */
  static parse(url: string): ParsedFigmaLink {
    const trimmedUrl = url.trim();

    // Extract fileKey
    let fileKey: string | undefined;
    for (const pattern of this.FILE_PATTERNS) {
      const match = trimmedUrl.match(pattern);
      if (match && match[1]) {
        fileKey = match[1];
        break;
      }
    }

    if (!fileKey) {
      throw new Error(
        `Could not extract fileKey from URL. Please ensure the URL is a valid Figma design/file URL.`
      );
    }

    // Extract nodeId from query parameter
    const nodeIdMatch = trimmedUrl.match(this.NODE_ID_PATTERN);
    const nodeId = nodeIdMatch ? nodeIdMatch[1] : undefined;

    return {
      fileKey,
      nodeId,
      originalUrl: trimmedUrl,
    };
  }

  /**
   * Validates if a string looks like a Figma URL.
   */
  static isFigmaUrl(url: string): boolean {
    const trimmedUrl = url.trim();
    return this.FILE_PATTERNS.some((pattern) => pattern.test(trimmedUrl));
  }
}
