/**
 * Image tiling functionality.
 * Divides large images into overlapping tiles for better LLM vision processing.
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { ImageEncoder } from "./encode.js";
export class ImageTiler {
    encoder;
    constructor(encoder) {
        this.encoder = encoder;
    }
    /**
     * Generate tiles from an image.
     */
    async generateTiles(inputPath, outputDir, options) {
        const { tilePx, overlapPx, maxBytes, maxLongEdge, preferFormat } = options;
        // Ensure output directory exists
        if (!existsSync(outputDir)) {
            await mkdir(outputDir, { recursive: true });
        }
        // Get image dimensions
        const metadata = await sharp(inputPath).metadata();
        const imageWidth = metadata.width || 0;
        const imageHeight = metadata.height || 0;
        if (imageWidth === 0 || imageHeight === 0) {
            throw new Error("Invalid image dimensions");
        }
        // Calculate tile grid
        const tiles = [];
        const stride = tilePx - overlapPx;
        // Calculate number of tiles in each dimension
        const cols = Math.ceil((imageWidth - overlapPx) / stride);
        const rows = Math.ceil((imageHeight - overlapPx) / stride);
        // Generate tiles
        let tileIndex = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Calculate tile position (with overlap on all sides except edges)
                let x = col * stride;
                let y = row * stride;
                // Adjust for right/bottom edges
                const actualTileWidth = col === cols - 1
                    ? imageWidth - x
                    : Math.min(tilePx, imageWidth - x);
                const actualTileHeight = row === rows - 1
                    ? imageHeight - y
                    : Math.min(tilePx, imageHeight - y);
                // Adjust top/left for better centering on edges
                if (col === cols - 1 && cols > 1) {
                    x = Math.max(0, imageWidth - tilePx);
                }
                if (row === rows - 1 && rows > 1) {
                    y = Math.max(0, imageHeight - tilePx);
                }
                const tilePath = join(outputDir, `tile_${row}_${col}.${preferFormat === "webp" ? "webp" : "jpg"}`);
                // Extract and encode tile
                const encoded = await this.encoder.encodeToFit(inputPath, tilePath, {
                    maxBytes,
                    maxLongEdge: Math.min(maxLongEdge, tilePx),
                    preferFormat,
                }, {
                    left: Math.round(x),
                    top: Math.round(y),
                    width: Math.round(actualTileWidth),
                    height: Math.round(actualTileHeight),
                });
                tiles.push({
                    path: encoded.path,
                    x: Math.round(x),
                    y: Math.round(y),
                    w: Math.round(actualTileWidth),
                    h: Math.round(actualTileHeight),
                    bytes: encoded.bytes,
                    width: encoded.width,
                    height: encoded.height,
                });
                tileIndex++;
            }
        }
        return tiles;
    }
}
// Override the method to support region extraction
ImageEncoder.prototype.encodeToFit = async function (inputPath, outputPath, options, region) {
    const { maxBytes, maxLongEdge, preferFormat } = options;
    // Ensure output directory exists
    const { mkdirSync } = await import("fs");
    if (!existsSync(dirname(outputPath))) {
        await mkdir(dirname(outputPath), { recursive: true });
    }
    // Build pipeline
    let pipeline = sharp(inputPath);
    // Extract region if specified
    if (region) {
        pipeline = pipeline.extract({
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height,
        });
    }
    // Get metadata after potential extraction
    const metadata = await pipeline.clone().metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    // Calculate initial scale factor if needed
    const longEdge = Math.max(originalWidth, originalHeight);
    let scaleFactor = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const format = preferFormat;
    const extension = format === "webp" ? "webp" : "jpg";
    const finalOutputPath = outputPath.endsWith(`.${extension}`)
        ? outputPath
        : `${outputPath}.${extension}`;
    // Try encoding with different quality settings
    let bestResult = null;
    const qualityLevels = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20];
    for (const quality of qualityLevels) {
        try {
            let encodePipeline = sharp(inputPath);
            if (region) {
                encodePipeline = encodePipeline.extract({
                    left: region.left,
                    top: region.top,
                    width: region.width,
                    height: region.height,
                });
            }
            if (scaleFactor < 1) {
                const newWidth = Math.round(originalWidth * scaleFactor);
                const newHeight = Math.round(originalHeight * scaleFactor);
                encodePipeline = encodePipeline.resize(newWidth, newHeight);
            }
            if (format === "webp") {
                encodePipeline = encodePipeline.webp({ quality, effort: 4 });
            }
            else {
                encodePipeline = encodePipeline.jpeg({ quality, mozjpeg: true });
            }
            const info = await encodePipeline.clone().metadata();
            const width = info.width || 0;
            const height = info.height || 0;
            await encodePipeline.toFile(finalOutputPath);
            const { statSync } = await import("fs");
            const bytes = statSync(finalOutputPath).size;
            const result = {
                path: finalOutputPath,
                bytes,
                width,
                height,
                format,
                quality,
                scaleFactor,
            };
            if (bytes <= maxBytes) {
                bestResult = result;
                break;
            }
            bestResult = result;
        }
        catch (error) {
            break;
        }
    }
    // If still too big at lowest quality, reduce resolution
    if (!bestResult || bestResult.bytes > maxBytes) {
        const scaleFactors = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2];
        for (const newScaleFactor of scaleFactors) {
            scaleFactor = Math.min(scaleFactor, newScaleFactor);
            for (const quality of qualityLevels) {
                try {
                    let encodePipeline = sharp(inputPath);
                    if (region) {
                        encodePipeline = encodePipeline.extract({
                            left: region.left,
                            top: region.top,
                            width: region.width,
                            height: region.height,
                        });
                    }
                    const newWidth = Math.round(originalWidth * scaleFactor);
                    const newHeight = Math.round(originalHeight * scaleFactor);
                    encodePipeline = encodePipeline.resize(newWidth, newHeight);
                    if (format === "webp") {
                        encodePipeline = encodePipeline.webp({ quality, effort: 4 });
                    }
                    else {
                        encodePipeline = encodePipeline.jpeg({ quality, mozjpeg: true });
                    }
                    const info = await encodePipeline.clone().metadata();
                    const width = info.width || 0;
                    const height = info.height || 0;
                    await encodePipeline.toFile(finalOutputPath);
                    const { statSync } = await import("fs");
                    const bytes = statSync(finalOutputPath).size;
                    const result = {
                        path: finalOutputPath,
                        bytes,
                        width,
                        height,
                        format,
                        quality,
                        scaleFactor,
                    };
                    if (bytes <= maxBytes) {
                        bestResult = result;
                        break;
                    }
                    bestResult = result;
                }
                catch (error) {
                    break;
                }
            }
            if (bestResult && bestResult.bytes <= maxBytes) {
                break;
            }
        }
    }
    if (!bestResult) {
        throw new Error(`Failed to encode image to meet size constraint of ${maxBytes} bytes`);
    }
    return bestResult;
};
//# sourceMappingURL=tiles.js.map