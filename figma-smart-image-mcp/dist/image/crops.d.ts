/**
 * Image crop generation using heuristics.
 * Generates intelligent crops for common UI patterns.
 */
import { ImageEncoder } from "./encode.js";
export interface Crop {
    path: string;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    bytes: number;
    width: number;
    height: number;
}
export interface CropOptions {
    maxBytes: number;
    maxLongEdge: number;
    preferFormat: "webp" | "jpeg";
    minCropSize: number;
}
export declare class ImageCropper {
    private readonly encoder;
    constructor(encoder: ImageEncoder);
    /**
     * Generate heuristic crops from an image.
     * Focuses on common UI areas: navigation, content, actions.
     */
    generateCrops(inputPath: string, outputDir: string, options: CropOptions): Promise<Crop[]>;
    /**
     * Generate crop regions using heuristics.
     */
    private generateCropRegions;
    /**
     * Sanitize a name for use in a filename.
     */
    private sanitizeName;
}
/**
 * Extended ImageEncoder with region extraction support (same as in tiles.ts).
 */
declare module "./encode.js" {
    interface ImageEncoder {
        encodeToFit(inputPath: string, outputPath: string, options: EncodeOptions, region?: {
            left: number;
            top: number;
            width: number;
            height: number;
        }): Promise<import("./encode.js").EncodedImage>;
    }
}
//# sourceMappingURL=crops.d.ts.map