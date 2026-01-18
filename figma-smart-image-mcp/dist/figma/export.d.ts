/**
 * Figma image export and download functionality.
 */
import { FigmaApiClient } from "./api.js";
export interface ExportedImage {
    path: string;
    format: "svg" | "png";
    bytes: number;
}
export declare class FigmaExporter {
    private readonly api;
    constructor(api: FigmaApiClient);
    /**
     * Download an image from a URL to a local file.
     */
    private downloadImage;
    /**
     * Export a node from Figma and download it.
     * Tries SVG first, falls back to PNG.
     */
    exportAndDownload(fileKey: string, nodeId: string, outputDir: string, forceFormat?: "auto" | "svg" | "png", baseName?: string): Promise<ExportedImage>;
}
//# sourceMappingURL=export.d.ts.map