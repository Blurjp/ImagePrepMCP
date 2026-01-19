/**
 * Image encoding and compression utilities.
 * Handles resizing and format conversion to meet size constraints.
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { existsSync } from "fs";
export class ImageEncoder {
    /**
     * Encode an image to meet size constraints.
     * Strategy: reduce quality first, then reduce resolution.
     */
    async encodeToFit(inputPath, outputPath, options) {
        const { maxBytes, maxLongEdge, preferFormat } = options;
        // Ensure output directory exists
        if (!existsSync(dirname(outputPath))) {
            await mkdir(dirname(outputPath), { recursive: true });
        }
        // Get original image metadata
        const metadata = await sharp(inputPath).metadata();
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
        // Start with high quality and work down
        const qualityLevels = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20];
        for (const quality of qualityLevels) {
            try {
                const result = await this.tryEncode(inputPath, finalOutputPath, scaleFactor, quality, format, maxBytes);
                if (result.bytes <= maxBytes) {
                    bestResult = result;
                    break;
                }
                bestResult = result;
            }
            catch (error) {
                // If encoding fails, try reducing resolution
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
                        const result = await this.tryEncode(inputPath, finalOutputPath, scaleFactor, quality, format, maxBytes);
                        if (result.bytes <= maxBytes) {
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
    }
    /**
     * Try encoding with specific parameters.
     */
    async tryEncode(inputPath, outputPath, scaleFactor, quality, format, maxBytes) {
        const pipeline = sharp(inputPath);
        // Resize if scale factor < 1
        if (scaleFactor < 1) {
            const metadata = await sharp(inputPath).metadata();
            const newWidth = Math.round((metadata.width || 0) * scaleFactor);
            const newHeight = Math.round((metadata.height || 0) * scaleFactor);
            pipeline.resize(newWidth, newHeight);
        }
        // Set format options
        if (format === "webp") {
            pipeline.webp({ quality, effort: 4 });
        }
        else {
            pipeline.jpeg({ quality, mozjpeg: true });
        }
        // Get info before saving
        const info = await pipeline.clone().metadata();
        const width = info.width || 0;
        const height = info.height || 0;
        // Save to file
        await pipeline.toFile(outputPath);
        // Get file size
        const { statSync } = await import("fs");
        const bytes = statSync(outputPath).size;
        return {
            path: outputPath,
            bytes,
            width,
            height,
            format,
            quality,
            scaleFactor,
        };
    }
    /**
     * Convert SVG to PNG for processing.
     */
    async convertSvgToPng(svgPath, pngPath, scale = 2) {
        if (!existsSync(dirname(pngPath))) {
            await mkdir(dirname(pngPath), { recursive: true });
        }
        const metadata = await sharp(svgPath).metadata();
        const width = Math.round((metadata.width || 0) * scale);
        const height = Math.round((metadata.height || 0) * scale);
        await sharp(svgPath)
            .resize(width, height)
            .png()
            .toFile(pngPath);
        return { width, height };
    }
    /**
     * Get image metadata.
     */
    async getMetadata(imagePath) {
        const metadata = await sharp(imagePath).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format || "unknown",
        };
    }
}
//# sourceMappingURL=encode.js.map