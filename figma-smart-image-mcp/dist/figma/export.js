/**
 * Figma image export and download functionality.
 */
import { request } from "undici";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
export class FigmaExporter {
    api;
    constructor(api) {
        this.api = api;
    }
    /**
     * Download an image from a URL to a local file.
     */
    async downloadImage(url, outputPath) {
        const response = await request(url, {
            method: "GET",
            headers: {
                "User-Agent": "FigmaSmartImageMCP/1.0 (https://github.com/anthropics/claude-code)",
            },
        });
        if (response.statusCode !== 200) {
            throw new Error(`Failed to download image (status ${response.statusCode})`);
        }
        const chunks = [];
        for await (const chunk of response.body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        // Ensure directory exists
        const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
        await writeFile(outputPath, buffer);
        return { bytes: buffer.length };
    }
    /**
     * Export a node from Figma and download it.
     * Tries SVG first, falls back to PNG.
     */
    async exportAndDownload(fileKey, nodeId, outputDir, forceFormat = "auto", baseName = "source") {
        let format = "svg"; // Default to SVG for better quality
        let imageUrl;
        if (forceFormat === "auto") {
            // Try SVG first (better quality for UI designs), fall back to PNG
            try {
                imageUrl = await this.api.getImageExportUrl(fileKey, nodeId, "svg");
                format = "svg";
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("not supported")) {
                    // SVG not supported, try PNG
                    imageUrl = await this.api.getImageExportUrl(fileKey, nodeId, "png");
                    format = "png";
                }
                else {
                    throw error;
                }
            }
        }
        else if (forceFormat === "svg") {
            imageUrl = await this.api.getImageExportUrl(fileKey, nodeId, "svg");
            format = "svg";
        }
        else {
            imageUrl = await this.api.getImageExportUrl(fileKey, nodeId, "png");
            format = "png";
        }
        const extension = format === "svg" ? "svg" : "png";
        const outputPath = join(outputDir, `${baseName}.${extension}`);
        const result = await this.downloadImage(imageUrl, outputPath);
        return {
            path: outputPath,
            format,
            bytes: result.bytes,
        };
    }
}
//# sourceMappingURL=export.js.map