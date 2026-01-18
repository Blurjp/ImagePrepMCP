/**
 * Image crop generation using heuristics.
 * Generates intelligent crops for common UI patterns.
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
export class ImageCropper {
    encoder;
    constructor(encoder) {
        this.encoder = encoder;
    }
    /**
     * Generate heuristic crops from an image.
     * Focuses on common UI areas: navigation, content, actions.
     */
    async generateCrops(inputPath, outputDir, options) {
        const { maxBytes, maxLongEdge, preferFormat, minCropSize } = options;
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
        const crops = [];
        let cropIndex = 0;
        // Define crop regions based on heuristics
        const cropRegions = this.generateCropRegions(imageWidth, imageHeight, minCropSize);
        // Generate each crop
        for (const region of cropRegions) {
            const cropPath = join(outputDir, `crop_${cropIndex}_${this.sanitizeName(region.name)}.${preferFormat === "webp" ? "webp" : "jpg"}`);
            try {
                const encoded = await this.encoder.encodeToFit(inputPath, cropPath, {
                    maxBytes,
                    maxLongEdge,
                    preferFormat,
                }, {
                    left: region.x,
                    top: region.y,
                    width: region.w,
                    height: region.h,
                });
                crops.push({
                    path: encoded.path,
                    name: region.name,
                    x: region.x,
                    y: region.y,
                    w: region.w,
                    h: region.h,
                    bytes: encoded.bytes,
                    width: encoded.width,
                    height: encoded.height,
                });
                cropIndex++;
            }
            catch (error) {
                // Skip crops that fail to encode
                console.warn(`Failed to generate crop "${region.name}": ${error}`);
            }
        }
        return crops;
    }
    /**
     * Generate crop regions using heuristics.
     */
    generateCropRegions(width, height, minSize) {
        const regions = [];
        // Skip if image is too small
        if (width < minSize || height < minSize) {
            return regions;
        }
        const isLandscape = width > height;
        const isPortrait = height > width;
        const isSquare = Math.abs(width - height) / width < 0.1;
        // 1. Top navigation/header area (top ~20%)
        const headerHeight = Math.min(Math.round(height * 0.2), minSize);
        if (headerHeight >= minSize * 0.5) {
            regions.push({
                name: "header",
                x: 0,
                y: 0,
                w: width,
                h: headerHeight,
            });
        }
        // 2. Top-left area (common for logo/back button)
        const topLeftSize = Math.min(minSize, Math.round(width * 0.4));
        if (topLeftSize >= minSize * 0.5) {
            regions.push({
                name: "top_left",
                x: 0,
                y: 0,
                w: topLeftSize,
                h: topLeftSize,
            });
        }
        // 3. Top-right area (common for actions/menu)
        const topRightSize = Math.min(minSize, Math.round(width * 0.4));
        if (topRightSize >= minSize * 0.5) {
            regions.push({
                name: "top_right",
                x: width - topRightSize,
                y: 0,
                w: topRightSize,
                h: topRightSize,
            });
        }
        // 4. Center area (main content)
        const centerSize = Math.min(minSize, Math.round(Math.min(width, height) * 0.6));
        const centerX = Math.round((width - centerSize) / 2);
        const centerY = Math.round((height - centerSize) / 2);
        if (centerSize >= minSize * 0.5) {
            regions.push({
                name: "center",
                x: centerX,
                y: centerY,
                w: centerSize,
                h: centerSize,
            });
        }
        // 5. Bottom area (common for CTA/navigation)
        const footerHeight = Math.min(Math.round(height * 0.25), minSize);
        const footerY = height - footerHeight;
        if (footerHeight >= minSize * 0.5) {
            regions.push({
                name: "footer",
                x: 0,
                y: footerY,
                w: width,
                h: footerHeight,
            });
        }
        // 6. Bottom-right area (common for floating actions)
        const bottomRightSize = Math.min(minSize, Math.round(width * 0.3));
        if (bottomRightSize >= minSize * 0.5 && isLandscape) {
            regions.push({
                name: "bottom_right",
                x: width - bottomRightSize,
                y: height - bottomRightSize,
                w: bottomRightSize,
                h: bottomRightSize,
            });
        }
        // 7. Left edge (for navigation drawers in landscape)
        if (isLandscape && width >= minSize * 1.5) {
            const sideWidth = Math.min(minSize, Math.round(width * 0.3));
            regions.push({
                name: "left_edge",
                x: 0,
                y: 0,
                w: sideWidth,
                h: height,
            });
        }
        // 8. Right edge (for detail panels in landscape)
        if (isLandscape && width >= minSize * 1.5) {
            const sideWidth = Math.min(minSize, Math.round(width * 0.3));
            regions.push({
                name: "right_edge",
                x: width - sideWidth,
                y: 0,
                w: sideWidth,
                h: height,
            });
        }
        return regions;
    }
    /**
     * Sanitize a name for use in a filename.
     */
    sanitizeName(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    }
}
// This is already implemented in tiles.ts, so we just need to reference it
// The actual implementation is shared between both modules
//# sourceMappingURL=crops.js.map