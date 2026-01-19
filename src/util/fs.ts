/**
 * File system utilities for the Figma Smart Image MCP server.
 */

import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";

/**
 * Generate a unique output directory based on timestamp or content hash.
 */
export function generateOutputDir(
  baseDir: string = "./out/figma",
  useTimestamp: boolean = true
): string {
  const timestamp = Date.now();
  const hash = createHash("md5").update(String(timestamp)).digest("hex").substring(0, 8);

  const dirName = useTimestamp ? `${timestamp}` : hash;
  return resolve(baseDir, dirName);
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Write a manifest file with metadata about generated images.
 */
export async function writeManifest(
  manifestPath: string,
  data: {
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
  }
): Promise<void> {
  await ensureDir(manifestPath.substring(0, manifestPath.lastIndexOf("/")));
  await writeFile(manifestPath, JSON.stringify(data, null, 2));
}

/**
 * Convert a file path to be relative-friendly for display.
 * Collapses long absolute paths to show just the meaningful parts.
 */
export function getDisplayPath(path: string, cwd: string = process.cwd()): string {
  const resolved = resolve(path);
  const resolvedCwd = resolve(cwd);

  if (resolved.startsWith(resolvedCwd)) {
    return resolved.substring(resolvedCwd.length + 1);
  }

  return resolved;
}

/**
 * Format bytes for human-readable display.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get the relative path from base to target.
 */
export function getRelativePath(targetPath: string, basePath: string = process.cwd()): string {
  const resolvedTarget = resolve(targetPath);
  const resolvedBase = resolve(basePath);

  if (resolvedTarget.startsWith(resolvedBase)) {
    return resolvedTarget.substring(resolvedBase.length + 1);
  }

  return resolvedTarget;
}
