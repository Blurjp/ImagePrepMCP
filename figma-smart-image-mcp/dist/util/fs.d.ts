/**
 * File system utilities for the Figma Smart Image MCP server.
 */
/**
 * Generate a unique output directory based on timestamp or content hash.
 */
export declare function generateOutputDir(baseDir?: string, useTimestamp?: boolean): string;
/**
 * Ensure a directory exists, creating it if necessary.
 */
export declare function ensureDir(dirPath: string): Promise<void>;
/**
 * Write a manifest file with metadata about generated images.
 */
export declare function writeManifest(manifestPath: string, data: {
    version: string;
    timestamp: number;
    selected?: {
        fileKey: string;
        nodeId?: string;
        sourceFormatUsed: string;
        originalPath: string;
    };
    overview?: {
        path: string;
        bytes: number;
        width: number;
        height: number;
        format: string;
        quality: number;
        scaleFactor: number;
    };
    tiles?: Array<{
        path: string;
        x: number;
        y: number;
        w: number;
        h: number;
        bytes: number;
        width: number;
        height: number;
    }>;
    crops?: Array<{
        path: string;
        name: string;
        x: number;
        y: number;
        w: number;
        h: number;
        bytes: number;
        width: number;
        height: number;
    }>;
}): Promise<void>;
/**
 * Convert a file path to be relative-friendly for display.
 * Collapses long absolute paths to show just the meaningful parts.
 */
export declare function getDisplayPath(path: string, cwd?: string): string;
/**
 * Format bytes for human-readable display.
 */
export declare function formatBytes(bytes: number): string;
/**
 * Get the relative path from base to target.
 */
export declare function getRelativePath(targetPath: string, basePath?: string): string;
//# sourceMappingURL=fs.d.ts.map