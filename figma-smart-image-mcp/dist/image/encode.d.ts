/**
 * Image encoding and compression utilities.
 * Handles resizing and format conversion to meet size constraints.
 */
export interface EncodedImage {
    path: string;
    bytes: number;
    width: number;
    height: number;
    format: "webp" | "jpeg";
    quality: number;
    scaleFactor: number;
}
export interface EncodeOptions {
    maxBytes: number;
    maxLongEdge: number;
    preferFormat: "webp" | "jpeg";
}
export declare class ImageEncoder {
    /**
     * Try encoding with specific parameters.
     */
    private tryEncode;
    /**
     * Convert SVG to PNG for processing.
     */
    convertSvgToPng(svgPath: string, pngPath: string, scale?: number): Promise<{
        width: number;
        height: number;
    }>;
    /**
     * Get image metadata.
     */
    getMetadata(imagePath: string): Promise<{
        width: number;
        height: number;
        format: string;
    }>;
}
//# sourceMappingURL=encode.d.ts.map