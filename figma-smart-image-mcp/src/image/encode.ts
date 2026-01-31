/**
 * Image encoding and compression utilities.
 * Handles resizing and format conversion to meet size constraints.
 */

import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
const svg2img = nodeRequire("svg2img");

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

export class ImageEncoder {
  /**
   * Encode an image to meet size constraints.
   * Strategy: reduce quality first, then reduce resolution.
   */
  async encodeToFit(
    inputPath: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodedImage> {
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
    let bestResult: EncodedImage | null = null;

    // Start with high quality and work down
    const qualityLevels = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20];

    for (const quality of qualityLevels) {
      try {
        const result = await this.tryEncode(
          inputPath,
          finalOutputPath,
          scaleFactor,
          quality,
          format,
          maxBytes
        );

        if (result.bytes <= maxBytes) {
          bestResult = result;
          break;
        }

        bestResult = result;
      } catch (error) {
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
            const result = await this.tryEncode(
              inputPath,
              finalOutputPath,
              scaleFactor,
              quality,
              format,
              maxBytes
            );

            if (result.bytes <= maxBytes) {
              bestResult = result;
              break;
            }

            bestResult = result;
          } catch (error) {
            break;
          }
        }

        if (bestResult && bestResult.bytes <= maxBytes) {
          break;
        }
      }
    }

    if (!bestResult) {
      throw new Error(
        `Failed to encode image to meet size constraint of ${maxBytes} bytes`
      );
    }

    return bestResult;
  }

  /**
   * Try encoding with specific parameters.
   */
  private async tryEncode(
    inputPath: string,
    outputPath: string,
    scaleFactor: number,
    quality: number,
    format: "webp" | "jpeg",
    maxBytes: number
  ): Promise<EncodedImage> {
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
    } else {
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
   * Uses svg2img library since Sharp doesn't support SVG.
   */
  async convertSvgToPng(
    svgPath: string,
    pngPath: string,
    scale: number = 2
  ): Promise<{ width: number; height: number }> {
    if (!existsSync(dirname(pngPath))) {
      await mkdir(dirname(pngPath), { recursive: true });
    }

    // Read SVG content
    const svgContent = readFileSync(svgPath, "utf-8");

    // Extract width and height from SVG
    const widthMatch = svgContent.match(/width=["'](\d+(?:\.\d+)?)["']/);
    const heightMatch = svgContent.match(/height=["'](\d+(?:\.\d+)?)["']/);
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);

    let svgWidth = 0;
    let svgHeight = 0;

    if (widthMatch && heightMatch) {
      svgWidth = parseFloat(widthMatch[1]);
      svgHeight = parseFloat(heightMatch[1]);
    } else if (viewBoxMatch) {
      const [, , vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
      svgWidth = vbWidth || 1000;
      svgHeight = vbHeight || 1000;
    } else {
      // Default size if not specified
      svgWidth = 1000;
      svgHeight = 1000;
    }

    const targetWidth = Math.round(svgWidth * scale);
    const targetHeight = Math.round(svgHeight * scale);

    // Convert SVG to PNG using svg2img
    return new Promise((resolve, reject) => {
      svg2img(svgContent, {
        format: "png" as const,
        resvg: {
          fitTo: { mode: "zoom", value: scale }
        }
      }, (error: any, buffer: any) => {
        if (error) {
          reject(new Error(`Failed to convert SVG to PNG: ${error.message}`));
          return;
        }

        // Write PNG buffer to file
        writeFileSync(pngPath, buffer);

        resolve({ width: targetWidth, height: targetHeight });
      });
    });
  }

  /**
   * Get image metadata.
   */
  async getMetadata(imagePath: string): Promise<{
    width: number;
    height: number;
    format: string;
  }> {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || "unknown",
    };
  }
}
