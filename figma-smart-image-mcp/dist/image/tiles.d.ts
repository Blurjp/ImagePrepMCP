/**
 * Image tiling functionality.
 * Divides large images into overlapping tiles for better LLM vision processing.
 */
import { ImageEncoder } from "./encode.js";
export interface Tile {
    path: string;
    x: number;
    y: number;
    w: number;
    h: number;
    bytes: number;
    width: number;
    height: number;
}
export interface TilingOptions {
    tilePx: number;
    overlapPx: number;
    maxBytes: number;
    maxLongEdge: number;
    preferFormat: "webp" | "jpeg";
}
export declare class ImageTiler {
    private readonly encoder;
    constructor(encoder: ImageEncoder);
    /**
     * Generate tiles from an image.
     */
    generateTiles(inputPath: string, outputDir: string, options: TilingOptions): Promise<Tile[]>;
}
/**
 * Extended ImageEncoder with region extraction support.
 */
declare module "./encode.js" {
    interface ImageEncoder {
        encodeToFit(inputPath: string, outputPath: string, options: EncodeOptions, region?: {
            left: number;
            top: number;
            width: number;
            height: number;
        }): Promise<EncodedImage>;
    }
}
//# sourceMappingURL=tiles.d.ts.map